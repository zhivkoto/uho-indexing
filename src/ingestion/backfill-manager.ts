/**
 * Uho — Backfill Manager
 *
 * Manages historical data backfill jobs. Spawns the Rust sidecar as a subprocess,
 * reads NDJSON stream from stdout, pipes through EventDecoder → FanoutWriter → Postgres.
 * Tracks progress and handles errors gracefully.
 */

import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { Connection, PublicKey } from '@solana/web3.js';
import type pg from 'pg';
import type { ParsedIDL, AnchorIDL, DecodedEvent } from '../core/types.js';
import { EventDecoder, type TxContext } from './decoder.js';
import { EventWriter } from './writer.js';
import { TransactionPoller } from './poller.js';
import { inUserSchema } from '../core/db.js';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Demo Backfill Limit
// =============================================================================

/** Maximum number of slots allowed for backfill in demo mode */
export const DEMO_BACKFILL_SLOT_LIMIT = 10_000;

// =============================================================================
// Types
// =============================================================================

export interface BackfillJobConfig {
  jobId: string;
  userId: string;
  userProgramId: string;
  programId: string;
  schemaName: string;
  parsedIdl: ParsedIDL;
  rawIdl: AnchorIDL;
  startSlot?: number | null;
  endSlot?: number;
  enabledEvents: string[];
  rpcUrl: string;
}

export interface BackfillStatus {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentSlot: number | null;
  startSlot: number | null;
  endSlot: number | null;
  eventsFound: number;
  eventsSkipped: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  demoLimitation?: {
    maxSlots: number;
    message: string;
  };
}

// =============================================================================
// Backfill Manager
// =============================================================================

export class BackfillManager {
  private pool: pg.Pool;
  private activeJobs = new Map<string, ChildProcess>();
  private cancelledJobs = new Set<string>();

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  /**
   * Validates and clamps the requested slot range to the demo limit.
   * Returns { startSlot, endSlot } or throws if the request is invalid.
   */
  async validateDemoRange(
    rpcUrl: string,
    requestedStartSlot?: number | null,
    requestedEndSlot?: number
  ): Promise<{ startSlot: number; endSlot: number; currentSlot: number }> {
    const connection = new Connection(rpcUrl, 'confirmed');
    const currentSlot = await connection.getSlot();
    const minAllowedSlot = currentSlot - DEMO_BACKFILL_SLOT_LIMIT;

    let endSlot = requestedEndSlot ?? currentSlot;
    let startSlot: number;

    if (requestedStartSlot != null) {
      if (requestedStartSlot < minAllowedSlot) {
        throw new Error(
          `Demo limitation: backfill can only cover the last ${DEMO_BACKFILL_SLOT_LIMIT} slots. ` +
          `Requested startSlot ${requestedStartSlot} is too far back. ` +
          `Minimum allowed startSlot is ${minAllowedSlot} (current slot: ${currentSlot}).`
        );
      }
      startSlot = requestedStartSlot;
    } else {
      startSlot = minAllowedSlot;
    }

    // Clamp endSlot to current
    if (endSlot > currentSlot) endSlot = currentSlot;

    return { startSlot, endSlot, currentSlot };
  }

  /**
   * Starts a backfill job. Enforces demo slot limit and uses RPC poller
   * instead of the Rust sidecar for the limited range.
   */
  async startBackfill(config: BackfillJobConfig): Promise<void> {
    const { jobId, programId, schemaName } = config;

    // Update job status to running
    await this.updateJobStatus(jobId, {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    try {
      // Validate and clamp to demo limit
      const { startSlot, endSlot } = await this.validateDemoRange(
        config.rpcUrl,
        config.startSlot,
        config.endSlot
      );

      console.log(`[Backfill] Demo mode: polling slots ${startSlot} → ${endSlot} (${endSlot - startSlot} slots)`);

      await this.updateJobStatus(jobId, {
        start_slot: startSlot,
        end_slot: endSlot,
      });

      // Use RPC poller instead of Rust sidecar for demo range
      await this.runRpcBackfill(config, startSlot, endSlot);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Backfill] Job ${jobId} failed: ${errorMsg}`);
      await this.updateJobStatus(jobId, {
        status: 'failed',
        error: errorMsg,
      });
    }
  }

  /**
   * Retries a failed backfill job from where it left off.
   */
  async retryBackfill(jobId: string, config: BackfillJobConfig): Promise<void> {
    // Get current progress to resume from
    const job = await this.getJobStatus(jobId);
    if (job && job.currentSlot) {
      config.startSlot = job.currentSlot;
    }

    await this.updateJobStatus(jobId, {
      status: 'pending',
      error: null,
    });

    // Start in background
    this.startBackfill(config).catch((err) => {
      console.error(`[Backfill] Retry failed for job ${jobId}: ${err}`);
    });
  }

  /**
   * Gets the status of a backfill job.
   */
  async getJobStatus(jobId: string): Promise<BackfillStatus | null> {
    const result = await this.pool.query(
      `SELECT status, progress, start_slot, end_slot, current_slot,
              events_found, events_skipped, error, started_at, completed_at
       FROM backfill_jobs WHERE id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      status: row.status as BackfillStatus['status'],
      progress: Number(row.progress) || 0,
      currentSlot: row.current_slot ? Number(row.current_slot) : null,
      startSlot: row.start_slot ? Number(row.start_slot) : null,
      endSlot: row.end_slot ? Number(row.end_slot) : null,
      eventsFound: Number(row.events_found) || 0,
      eventsSkipped: Number(row.events_skipped) || 0,
      error: row.error as string | null,
      startedAt: row.started_at ? new Date(row.started_at as string).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : null,
      demoLimitation: {
        maxSlots: DEMO_BACKFILL_SLOT_LIMIT,
        message: `Demo mode: backfill is limited to the last ${DEMO_BACKFILL_SLOT_LIMIT} slots. Full historical backfill available in production.`,
      },
    };
  }

  /**
   * Gets backfill job for a user program.
   */
  async getJobByUserProgram(userProgramId: string, userId?: string): Promise<(BackfillStatus & { id: string }) | null> {
    const query = userId
      ? `SELECT id, status, progress, start_slot, end_slot, current_slot,
                events_found, events_skipped, error, started_at, completed_at
         FROM backfill_jobs WHERE user_program_id = $1 AND user_id = $2
         ORDER BY created_at DESC LIMIT 1`
      : `SELECT id, status, progress, start_slot, end_slot, current_slot,
                events_found, events_skipped, error, started_at, completed_at
         FROM backfill_jobs WHERE user_program_id = $1
         ORDER BY created_at DESC LIMIT 1`;
    const result = await this.pool.query(
      query,
      userId ? [userProgramId, userId] : [userProgramId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id as string,
      status: row.status as BackfillStatus['status'],
      progress: Number(row.progress) || 0,
      currentSlot: row.current_slot ? Number(row.current_slot) : null,
      startSlot: row.start_slot ? Number(row.start_slot) : null,
      endSlot: row.end_slot ? Number(row.end_slot) : null,
      eventsFound: Number(row.events_found) || 0,
      eventsSkipped: Number(row.events_skipped) || 0,
      error: row.error as string | null,
      startedAt: row.started_at ? new Date(row.started_at as string).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : null,
      demoLimitation: {
        maxSlots: DEMO_BACKFILL_SLOT_LIMIT,
        message: `Demo mode: backfill is limited to the last ${DEMO_BACKFILL_SLOT_LIMIT} slots. Full historical backfill available in production.`,
      },
    };
  }

  /**
   * Creates a new backfill job record.
   */
  async createJob(config: {
    userId: string;
    userProgramId: string;
    programId: string;
    schemaName: string;
  }): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO backfill_jobs (user_id, user_program_id, program_id, schema_name, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [config.userId, config.userProgramId, config.programId, config.schemaName]
    );
    return result.rows[0].id as string;
  }

  /**
   * Stops any running backfill for a program.
   */
  stopBackfill(jobId: string): void {
    this.cancelledJobs.add(jobId);
    const proc = this.activeJobs.get(jobId);
    if (proc) {
      proc.kill('SIGTERM');
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Public wrapper for updating job status (used by API routes for cancellation).
   */
  async updateJobStatusPublic(
    jobId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    await this.updateJobStatus(jobId, updates);
  }

  // ===========================================================================
  // Private — RPC Backfill (Demo Mode)
  // ===========================================================================

  /**
   * Runs backfill using the existing RPC poller for a small slot range.
   * Used in demo mode instead of the Rust sidecar.
   */
  private async runRpcBackfill(
    config: BackfillJobConfig,
    startSlot: number,
    endSlot: number
  ): Promise<void> {
    const connection = new Connection(config.rpcUrl, 'confirmed');
    const programPubkey = new PublicKey(config.programId);
    const decoder = new EventDecoder(config.parsedIdl, config.rawIdl);

    let eventsFound = 0;
    let eventsSkipped = 0;
    let lastProgressUpdate = Date.now();

    console.log(`[Backfill] RPC backfill: fetching signatures for ${config.programId} in slot range ${startSlot}-${endSlot}`);

    // Fetch all signatures in the slot range using pagination
    let allSignatures: Array<{ signature: string; slot: number; err: unknown }> = [];
    let before: string | undefined;
    let done = false;

    while (!done) {
      const sigs = await connection.getSignaturesForAddress(programPubkey, {
        limit: 1000,
        before,
      });

      if (sigs.length === 0) break;

      for (const sig of sigs) {
        if (sig.slot < startSlot) {
          done = true;
          break;
        }
        if (sig.slot <= endSlot) {
          allSignatures.push(sig);
        }
      }

      before = sigs[sigs.length - 1].signature;
      if (sigs.length < 1000) break;
    }

    console.log(`[Backfill] Found ${allSignatures.length} signatures in range`);

    // Process transactions
    for (let i = 0; i < allSignatures.length; i++) {
      // Check for cancellation
      if (this.cancelledJobs.has(config.jobId)) {
        this.cancelledJobs.delete(config.jobId);
        console.log(`[Backfill] Job ${config.jobId} cancelled by user`);
        return;
      }

      const sig = allSignatures[i];
      if (sig.err) continue;

      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx?.meta?.logMessages) continue;

        const txContext: TxContext = {
          txSignature: sig.signature,
          slot: sig.slot,
          blockTime: tx.blockTime ?? null,
          programId: config.programId,
        };

        let decodedEvents: DecodedEvent[];
        try {
          decodedEvents = decoder.decodeLogMessages(tx.meta.logMessages, txContext);
        } catch {
          eventsSkipped++;
          continue;
        }

        if (decodedEvents.length === 0) continue;

        const filteredEvents = decodedEvents.filter(
          (e) => config.enabledEvents.includes(e.eventName)
        );

        if (filteredEvents.length === 0) continue;

        await inUserSchema(this.pool, config.schemaName, async (client) => {
          const writer = new EventWriter(
            this.createSchemaPool(client),
            config.parsedIdl
          );
          await writer.writeEvents(filteredEvents);
        });
        eventsFound += filteredEvents.length;
      } catch (err) {
        console.warn(`[Backfill] Error processing tx ${sig.signature}: ${(err as Error).message}`);
      }

      // Progress updates every 5 seconds
      const now = Date.now();
      if (now - lastProgressUpdate > 5000) {
        lastProgressUpdate = now;
        const progress = (i + 1) / allSignatures.length;
        await this.updateJobStatus(config.jobId, {
          current_slot: sig.slot,
          progress: Math.min(progress, 1),
          events_found: eventsFound,
          events_skipped: eventsSkipped,
        });
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 100));
    }

    // Mark completed
    await this.updateJobStatus(config.jobId, {
      status: 'completed',
      progress: 1,
      events_found: eventsFound,
      events_skipped: eventsSkipped,
      completed_at: new Date().toISOString(),
    });

    console.log(
      `[Backfill] Job ${config.jobId} completed: ${eventsFound} events found, ${eventsSkipped} skipped`
    );
  }

  // ===========================================================================
  // Private — Sidecar Management (Production — not used in demo)
  // ===========================================================================

  /**
   * Spawns the Rust sidecar and processes its NDJSON output.
   * NOTE: Not used in demo mode. Kept for production full-history backfill.
   */
  private async runSidecar(
    config: BackfillJobConfig,
    startSlot: number,
    endSlot: number
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Path to sidecar binary — check multiple locations
      const sidecarPaths = [
        path.resolve('sidecar/target/release/uho-backfill'),
        path.resolve('sidecar/target/debug/uho-backfill'),
        '/usr/local/bin/uho-backfill',
      ];

      let sidecarPath = sidecarPaths[0];
      for (const p of sidecarPaths) {
        try {
          if (fs.existsSync(p)) {
            sidecarPath = p;
            break;
          }
        } catch { /* ignore */ }
      }

      console.log(`[Backfill] Spawning sidecar: ${sidecarPath}`);
      console.log(`[Backfill] Range: ${startSlot} → ${endSlot}`);

      const proc = spawn(sidecarPath, [
        '--program', config.programId,
        '--start-slot', String(startSlot),
        '--end-slot', String(endSlot),
        '--threads', '4',
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.activeJobs.set(config.jobId, proc);

      // Create decoder and writer for this job
      const decoder = new EventDecoder(config.parsedIdl, config.rawIdl);

      let eventsFound = 0;
      let eventsSkipped = 0;
      let lastProgressUpdate = Date.now();

      // Backpressure: track pending writes and pause/resume the stream
      const MAX_PENDING_WRITES = 50;
      let pendingWrites = 0;
      const stdout = proc.stdout!;

      const checkBackpressure = () => {
        if (pendingWrites >= MAX_PENDING_WRITES) {
          stdout.pause();
        }
      };

      const onWriteComplete = () => {
        pendingWrites--;
        if (pendingWrites < MAX_PENDING_WRITES / 2) {
          stdout.resume();
        }
      };

      // Process stdout NDJSON line by line
      const rl = createInterface({ input: stdout });

      rl.on('line', (line) => {
        try {
          const record = JSON.parse(line) as {
            signature: string;
            slot: number;
            blockTime: number | null;
            logs: string[];
          };

          // Decode events from log messages
          const txContext: TxContext = {
            txSignature: record.signature,
            slot: record.slot,
            blockTime: record.blockTime,
            programId: config.programId,
          };

          let decodedEvents: DecodedEvent[];
          try {
            decodedEvents = decoder.decodeLogMessages(record.logs, txContext);
          } catch {
            // IDL mismatch — skip gracefully (Edge Case #1)
            eventsSkipped++;
            return;
          }

          if (decodedEvents.length === 0) return;

          // Filter to enabled events only
          const filteredEvents = decodedEvents.filter(
            (e) => config.enabledEvents.includes(e.eventName)
          );

          if (filteredEvents.length === 0) return;

          // Write to user's schema (with backpressure tracking)
          pendingWrites++;
          checkBackpressure();

          (async () => {
            try {
              await inUserSchema(this.pool, config.schemaName, async (client) => {
                const writer = new EventWriter(
                  this.createSchemaPool(client),
                  config.parsedIdl
                );
                await writer.writeEvents(filteredEvents);
              });
              eventsFound += filteredEvents.length;
            } catch (err) {
              console.warn(
                `[Backfill] Write error for tx ${record.signature}: ${(err as Error).message}`
              );
            } finally {
              onWriteComplete();
            }

            // Periodic progress updates (every 5 seconds)
            const now = Date.now();
            if (now - lastProgressUpdate > 5000) {
              lastProgressUpdate = now;
              const progress = startSlot < endSlot
                ? (record.slot - startSlot) / (endSlot - startSlot)
                : 1;
              await this.updateJobStatus(config.jobId, {
                current_slot: record.slot,
                progress: Math.min(progress, 1),
                events_found: eventsFound,
                events_skipped: eventsSkipped,
              });
            }
          })();
        } catch (err) {
          // Malformed JSON line — skip
          console.warn(`[Backfill] Failed to parse line: ${(err as Error).message}`);
        }
      });

      // Process stderr for progress reports
      const stderrRl = createInterface({ input: proc.stderr! });
      stderrRl.on('line', (line) => {
        if (line.startsWith('PROGRESS:')) {
          try {
            const stats = JSON.parse(line.slice(9));
            console.log(
              `[Backfill] Progress: ${stats.processed} txns processed, ${stats.matched} matched, slot ${stats.currentSlot}`
            );
          } catch { /* ignore */ }
        } else if (line.startsWith('DONE:')) {
          console.log(`[Backfill] Sidecar completed`);
        } else {
          console.log(`[Backfill/sidecar] ${line}`);
        }
      });

      // Handle process exit
      proc.on('close', async (code) => {
        this.activeJobs.delete(config.jobId);

        if (code === 0) {
          await this.updateJobStatus(config.jobId, {
            status: 'completed',
            progress: 1,
            events_found: eventsFound,
            events_skipped: eventsSkipped,
            completed_at: new Date().toISOString(),
          });
          console.log(
            `[Backfill] Job ${config.jobId} completed: ${eventsFound} events found, ${eventsSkipped} skipped`
          );
          resolve();
        } else {
          const errorMsg = `Sidecar exited with code ${code}`;
          await this.updateJobStatus(config.jobId, {
            status: 'failed',
            error: errorMsg,
            events_found: eventsFound,
            events_skipped: eventsSkipped,
          });
          reject(new Error(errorMsg));
        }
      });

      proc.on('error', async (err) => {
        this.activeJobs.delete(config.jobId);
        await this.updateJobStatus(config.jobId, {
          status: 'failed',
          error: `Sidecar spawn error: ${err.message}`,
        });
        reject(err);
      });
    });
  }

  // ===========================================================================
  // Private — Deployment Detection
  // ===========================================================================

  /**
   * Auto-detects the slot where a program was first deployed by walking back
   * through getSignaturesForAddress to find the earliest transaction.
   *
   * **Limitation:** `getSignaturesForAddress` returns max 1000 signatures per call.
   * We iterate up to 500 times (500K signatures). Programs with more historical
   * transactions than this may not resolve to the true deployment slot. In that case,
   * use the `startFromSlot` override when creating the program to specify the exact
   * deployment slot manually.
   */
  private async detectDeploymentSlot(
    programId: string,
    rpcUrl: string
  ): Promise<number> {
    const MAX_ITERATIONS = 500;
    const connection = new Connection(rpcUrl, 'confirmed');
    const { PublicKey } = await import('@solana/web3.js');
    const pubkey = new PublicKey(programId);

    let earliestSlot = Infinity;
    let before: string | undefined;

    // Walk backwards through signatures to find the earliest one
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const sigs = await connection.getSignaturesForAddress(pubkey, {
        limit: 1000,
        before,
      });

      if (sigs.length === 0) break;

      const lastSig = sigs[sigs.length - 1];
      if (lastSig.slot < earliestSlot) {
        earliestSlot = lastSig.slot;
      }

      before = lastSig.signature;

      // If we got fewer than 1000, we've reached the beginning
      if (sigs.length < 1000) break;

      // Log progress for long-running detection
      if (i > 0 && i % 50 === 0) {
        console.log(`[Backfill] Deployment detection: ${(i + 1) * 1000} signatures scanned, earliest slot so far: ${earliestSlot}`);
      }
    }

    if (earliestSlot === Infinity) {
      // Fallback: use a recent slot (program might be very new)
      const currentSlot = await connection.getSlot();
      return Math.max(0, currentSlot - 100_000); // ~11 hours back
    }

    return earliestSlot;
  }

  // ===========================================================================
  // Private — DB Updates
  // ===========================================================================

  private static readonly ALLOWED_JOB_COLUMNS = new Set([
    'status', 'progress', 'start_slot', 'end_slot', 'current_slot',
    'events_found', 'events_skipped', 'error', 'started_at', 'completed_at',
  ]);

  private async updateJobStatus(
    jobId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (!BackfillManager.ALLOWED_JOB_COLUMNS.has(key)) {
        throw new Error(`Invalid backfill job column: ${key}`);
      }
      setClauses.push(`${key} = $${idx++}`);
      values.push(value);
    }
    setClauses.push('updated_at = NOW()');
    values.push(jobId);

    await this.pool.query(
      `UPDATE backfill_jobs SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  /**
   * Creates a minimal pool-like wrapper around a PoolClient for use with EventWriter.
   */
  private createSchemaPool(client: pg.PoolClient): pg.Pool {
    return {
      query: (sql: string, params?: unknown[]) => client.query(sql, params),
      connect: () =>
        Promise.resolve({
          query: (sql: string, params?: unknown[]) => client.query(sql, params),
          release: () => {},
        }),
    } as unknown as pg.Pool;
  }
}
