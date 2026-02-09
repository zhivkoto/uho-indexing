/**
 * Uho — Indexer Orchestrator
 *
 * Round-robin multi-program poller for platform mode.
 * Polls all active programs from the materialized view, decodes transactions,
 * and fans out events to subscriber schemas. Listens for PG NOTIFY to
 * dynamically pick up new programs.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import type pg from 'pg';
import type { ParsedIDL, AnchorIDL, SubscriberInfo, DecodedEvent } from '../core/types.js';
import { parseIDL } from '../core/idl-parser.js';
import { TransactionPoller } from './poller.js';
import { EventDecoder } from './decoder.js';
import { FanoutWriter } from './fanout-writer.js';

// =============================================================================
// Types
// =============================================================================

/** An active program in the orchestrator's registry */
interface ActiveProgram {
  programId: string;
  poller: TransactionPoller;
  decoder: EventDecoder;
  fanoutWriter: FanoutWriter;
  parsedIdl: ParsedIDL;
  subscribers: SubscriberInfo[];
}

/** Subscriber row from the active_program_subscriptions materialized view */
interface SubscriberRow {
  user_id: string;
  user_program_id: string;
  schema_name: string;
  program_name: string;
  idl: Record<string, unknown>;
  config: Record<string, unknown>;
  enabled_events: Array<{
    event_name: string;
    event_type: string;
    field_config: Record<string, unknown>;
  }> | null;
}

// =============================================================================
// Indexer Orchestrator
// =============================================================================

export class IndexerOrchestrator {
  private pool: pg.Pool;
  private connection: Connection;
  private running = false;

  /** Registry: programId → active program with poller, decoder, writer, subscribers */
  private programs = new Map<string, ActiveProgram>();

  /** Delay between full polling cycles (ms) */
  private cycleIntervalMs = 2000;

  /** Delay between individual program polls within a cycle (ms) */
  private interProgramDelayMs = 100;

  /** PG LISTEN client for program change notifications */
  private listenerClient: pg.PoolClient | null = null;

  constructor(pool: pg.Pool, rpcUrl: string) {
    this.pool = pool;
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Starts the indexer orchestrator:
   * 1. Loads active programs from the materialized view
   * 2. Starts PG LISTEN for program changes
   * 3. Begins the round-robin polling loop
   */
  async start(): Promise<void> {
    this.running = true;
    console.log('[Orchestrator] Starting...');

    // 1. Load initial active programs
    await this.loadActivePrograms();

    // 2. Listen for program changes
    await this.listenForChanges();

    // 3. Start round-robin loop
    console.log(`[Orchestrator] Started with ${this.programs.size} active program(s)`);
    this.runLoop().catch((err) => {
      console.error(`[Orchestrator] Loop crashed: ${(err as Error).message}`);
    });
  }

  /**
   * Stops the orchestrator gracefully.
   */
  async stop(): Promise<void> {
    this.running = false;
    console.log('[Orchestrator] Stopping...');

    if (this.listenerClient) {
      try {
        await this.listenerClient.query('UNLISTEN uho_program_changes');
        this.listenerClient.release();
      } catch {
        // Ignore release errors during shutdown
      }
      this.listenerClient = null;
    }

    this.programs.clear();
    console.log('[Orchestrator] Stopped');
  }

  // ===========================================================================
  // Program Registry
  // ===========================================================================

  /**
   * Loads active programs from the active_program_subscriptions materialized view.
   * Creates pollers and decoders for new programs, updates subscribers for existing ones.
   */
  private async loadActivePrograms(): Promise<void> {
    try {
      // Refresh the materialized view
      await this.pool.query('SELECT refresh_active_subscriptions()').catch(() => {});

      const result = await this.pool.query(
        'SELECT program_id, chain, subscribers FROM active_program_subscriptions'
      );

      const activeProgramIds = new Set<string>();

      for (const row of result.rows) {
        const programId = row.program_id as string;
        const subscribersJson = row.subscribers as SubscriberRow[];
        activeProgramIds.add(programId);

        await this.addOrUpdateProgram(programId, subscribersJson);
      }

      // Remove programs no longer in the active set
      for (const [pid] of this.programs) {
        if (!activeProgramIds.has(pid)) {
          this.programs.delete(pid);
          console.log(`[Orchestrator] Removed program ${pid}`);
        }
      }
    } catch (err) {
      console.error(`[Orchestrator] Failed to load active programs: ${(err as Error).message}`);
    }
  }

  /**
   * Adds a new program to the registry or updates its subscriber list.
   */
  private async addOrUpdateProgram(
    programId: string,
    subscribersJson: SubscriberRow[]
  ): Promise<void> {
    const subscribers = this.parseSubscribers(subscribersJson);

    if (subscribers.length === 0) return;

    if (this.programs.has(programId)) {
      // Update subscribers list
      this.programs.get(programId)!.subscribers = subscribers;
      return;
    }

    // Create new poller, decoder, and fanout writer
    try {
      const canonicalSub = subscribers[0];
      const parsedIdl = canonicalSub.parsedIdl;

      const poller = new TransactionPoller(
        this.connection,
        new PublicKey(programId),
        { pollIntervalMs: 0, batchSize: 25 } // Interval managed by orchestrator
      );

      // Resume from the most advanced cursor
      const maxState = await this.getMostAdvancedState(subscribers);
      if (maxState) {
        poller.setLastSignature(maxState);
      }

      const decoder = new EventDecoder(parsedIdl, canonicalSub.rawIdl as unknown as AnchorIDL);
      const fanoutWriter = new FanoutWriter(this.pool);

      this.programs.set(programId, {
        programId,
        poller,
        decoder,
        fanoutWriter,
        parsedIdl,
        subscribers,
      });

      console.log(`[Orchestrator] Added program ${programId} with ${subscribers.length} subscriber(s)`);
    } catch (err) {
      console.error(`[Orchestrator] Failed to add program ${programId}: ${(err as Error).message}`);
    }
  }

  // ===========================================================================
  // Round-Robin Polling Loop
  // ===========================================================================

  /**
   * Runs the main round-robin polling loop.
   * Iterates over all active programs, polls each one, decodes events,
   * and fans them out to subscriber schemas.
   */
  private async runLoop(): Promise<void> {
    while (this.running) {
      const programList = Array.from(this.programs.values());

      for (const program of programList) {
        if (!this.running) break;

        try {
          const txs = await program.poller.poll();
          if (txs.length > 0) {
            const events: DecodedEvent[] = [];
            for (const tx of txs) {
              events.push(...program.decoder.decodeTransaction(tx));
            }

            if (events.length > 0) {
              await program.fanoutWriter.writeToSubscribers(
                program.programId,
                events,
                [],
                program.subscribers
              );
            }
          }
        } catch (err) {
          console.error(
            `[Orchestrator] Error polling ${program.programId}: ${(err as Error).message}`
          );
        }

        // Small delay between programs to avoid RPC rate limits
        await sleep(this.interProgramDelayMs);
      }

      // Wait before next full cycle
      if (this.running) {
        await sleep(this.cycleIntervalMs);
      }
    }
  }

  // ===========================================================================
  // PG LISTEN — Dynamic Program Updates
  // ===========================================================================

  /**
   * Listens for program change notifications via PG LISTEN.
   * Reloads the active programs registry when a change is detected.
   */
  private async listenForChanges(): Promise<void> {
    try {
      this.listenerClient = await this.pool.connect();
      await this.listenerClient.query('LISTEN uho_program_changes');

      this.listenerClient.on('notification', async (msg) => {
        if (msg.channel !== 'uho_program_changes') return;

        try {
          const change = JSON.parse(msg.payload ?? '{}') as Record<string, string>;
          console.log(
            `[Orchestrator] Program change: ${change.action ?? 'unknown'} ${change.program_id ?? 'unknown'}`
          );

          // Reload active programs
          await this.loadActivePrograms();
        } catch (err) {
          console.error(`[Orchestrator] Error handling program change: ${(err as Error).message}`);
        }
      });

      this.listenerClient.on('error', (err) => {
        console.error(`[Orchestrator] Listener connection error: ${err.message}`);
        // Try to reconnect
        this.listenerClient = null;
        if (this.running) {
          setTimeout(() => this.listenForChanges().catch(() => {}), 5000);
        }
      });
    } catch (err) {
      console.error(`[Orchestrator] Failed to start PG LISTEN: ${(err as Error).message}`);
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Parses subscriber JSON from the materialized view into SubscriberInfo objects.
   */
  private parseSubscribers(subscribersJson: SubscriberRow[]): SubscriberInfo[] {
    const subscribers: SubscriberInfo[] = [];

    for (const sub of subscribersJson) {
      try {
        const rawIdl = sub.idl;
        const parsedIdl = parseIDL(rawIdl as unknown as AnchorIDL);

        const enabledEvents = (sub.enabled_events ?? [])
          .filter((e) => e.event_type === 'event')
          .map((e) => e.event_name);

        subscribers.push({
          userId: sub.user_id,
          schemaName: sub.schema_name,
          programName: sub.program_name,
          parsedIdl,
          enabledEvents,
          rawIdl,
        });
      } catch (err) {
        console.error(
          `[Orchestrator] Failed to parse subscriber ${sub.user_id}: ${(err as Error).message}`
        );
      }
    }

    return subscribers;
  }

  /**
   * Gets the most advanced last_signature across all subscribers for a program.
   * Used to resume polling from the furthest point.
   */
  private async getMostAdvancedState(subscribers: SubscriberInfo[]): Promise<string | null> {
    let maxSlot = 0;
    let maxSignature: string | null = null;

    for (const sub of subscribers) {
      try {
        const result = await this.pool.query(
          `SELECT last_slot, last_signature FROM ${sub.schemaName}._uho_state
           WHERE program_id = $1`,
          [sub.parsedIdl.programId]
        );

        if (result.rows.length > 0) {
          const slot = Number(result.rows[0].last_slot);
          if (slot > maxSlot) {
            maxSlot = slot;
            maxSignature = result.rows[0].last_signature as string | null;
          }
        }
      } catch {
        // Schema or table might not exist yet
      }
    }

    return maxSignature;
  }
}

// =============================================================================
// Utility
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
