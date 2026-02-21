/**
 * Uho — Fanout Writer
 *
 * Writes decoded events to multiple user schemas in a fan-out pattern.
 * Each subscriber gets their own copy of events in their schema, filtered
 * by their enabled events. Sends PG NOTIFY for WebSocket/webhook fanout.
 */

import type pg from 'pg';
import type { ParsedIDL, DecodedEvent, DecodedInstruction, DecodedTokenTransfer, SubscriberInfo, WriteResult } from '../core/types.js';
import { EventWriter } from './writer.js';
import { inUserSchema } from '../core/db.js';

// =============================================================================
// Fanout Writer
// =============================================================================

export class FanoutWriter {
  constructor(private pool: pg.Pool) {}

  /**
   * Writes decoded events to ALL user schemas that subscribe to this program.
   * Uses a separate write operation per subscriber for isolation.
   *
   * @param programId - The Solana program ID these events came from
   * @param events - Decoded events to write
   * @param instructions - Decoded instructions to write
   * @param subscribers - List of subscriber schemas to write to
   * @returns Summary of how many events were written per subscriber
   */
  async writeToSubscribers(
    programId: string,
    events: DecodedEvent[],
    instructions: DecodedInstruction[],
    subscribers: SubscriberInfo[],
    txLogs?: Array<{ txSignature: string; slot: number; logMessages: string[] }>,
    tokenTransfers?: DecodedTokenTransfer[]
  ): Promise<WriteResult> {
    const result: WriteResult = { totalWritten: 0, perSubscriber: {} };

    for (const sub of subscribers) {
      try {
        // Filter events and instructions to only those the subscriber has enabled
        const enabledEvents = events.filter((e) =>
          sub.enabledEvents.includes(e.eventName)
        );
        const enabledInstructions = instructions.filter((ix) =>
          sub.enabledInstructions.includes(ix.instructionName)
        );
        const subTokenTransfers = sub.tokenTransfers ? (tokenTransfers ?? []) : [];

        if (enabledEvents.length === 0 && enabledInstructions.length === 0 && subTokenTransfers.length === 0) continue;

        // Write to subscriber's schema using a schema-scoped client
        const written = await inUserSchema(this.pool, sub.schemaName, async (client) => {
          const writer = new EventWriter(
            this.createSchemaPool(client),
            sub.parsedIdl
          );

          let count = 0;

          if (enabledEvents.length > 0) {
            count += await writer.writeEvents(enabledEvents);
          }

          if (enabledInstructions.length > 0) {
            count += await writer.writeInstructions(enabledInstructions);
          }

          if (subTokenTransfers.length > 0) {
            count += await writer.writeTokenTransfers(subTokenTransfers);
          }

          // Write transaction logs (only for txs that had events/instructions written)
          if (txLogs?.length) {
            const writtenTxSigs = new Set([
              ...enabledEvents.map((e) => e.txSignature),
              ...enabledInstructions.map((ix) => ix.txSignature),
            ]);
            const relevantLogs = txLogs.filter((l) => writtenTxSigs.has(l.txSignature));
            for (const log of relevantLogs) {
              try {
                await client.query(
                  `INSERT INTO _tx_logs (tx_signature, slot, log_messages) VALUES ($1, $2, $3) ON CONFLICT (tx_signature) DO NOTHING`,
                  [log.txSignature, log.slot, log.logMessages]
                );
              } catch {
                // _tx_logs table might not exist yet for older schemas — skip
              }
            }
          }

          // Update _uho_state in subscriber's schema
          const allItems = [...enabledEvents, ...enabledInstructions];
          if (allItems.length > 0) {
            const latestSlot = Math.max(
              ...enabledEvents.map((e) => e.slot),
              ...enabledInstructions.map((ix) => ix.slot)
            );
            const currentState = await writer.getState(programId);
            await writer.updateState(programId, {
              lastSlot: latestSlot,
              eventsIndexed: (currentState?.eventsIndexed ?? 0) + count,
              lastPollAt: new Date(),
              status: 'running',
            });
          }

          return count;
        });

        result.perSubscriber[sub.userId] = written;
        result.totalWritten += written;
      } catch (err) {
        console.error(
          `[FanoutWriter] Error writing to ${sub.schemaName}: ${(err as Error).message}`
        );
        // Continue to other subscribers — don't let one failure block all
      }
    }

    // Send PG NOTIFY for WebSocket/webhook fanout
    if (result.totalWritten > 0) {
      await this.notifyNewEvents(programId, events, subscribers);
    }

    return result;
  }

  // ===========================================================================
  // Private — PG NOTIFY
  // ===========================================================================

  /**
   * Sends PG NOTIFY on the uho_events channel for WebSocket and webhook delivery.
   * Keeps payload small to fit within PG's ~8000 byte limit.
   */
  private async notifyNewEvents(
    programId: string,
    events: DecodedEvent[],
    subscribers: SubscriberInfo[]
  ): Promise<void> {
    try {
      const payload = JSON.stringify({
        programId,
        events: events.map((e) => ({
          eventName: e.eventName,
          slot: e.slot,
          txSignature: e.txSignature,
          data: e.data,
        })),
        subscribers: subscribers.map((s) => s.userId),
      });

      // PG NOTIFY has a ~8000 byte payload limit
      if (payload.length < 7500) {
        await this.pool.query("SELECT pg_notify('uho_events', $1)", [payload]);
      } else {
        // Split into individual event notifications
        for (const event of events) {
          const smallPayload = JSON.stringify({
            programId,
            events: [
              {
                eventName: event.eventName,
                slot: event.slot,
                txSignature: event.txSignature,
                data: event.data,
              },
            ],
            subscribers: subscribers.map((s) => s.userId),
          });
          await this.pool.query("SELECT pg_notify('uho_events', $1)", [smallPayload]);
        }
      }
    } catch (err) {
      console.error(`[FanoutWriter] Failed to send PG NOTIFY: ${(err as Error).message}`);
    }
  }

  // ===========================================================================
  // Private — Pool Wrapper
  // ===========================================================================

  /**
   * Creates a minimal pool-like wrapper around a PoolClient for use with EventWriter.
   * EventWriter expects a Pool, but we need to use a specific client with search_path set.
   */
  private createSchemaPool(client: pg.PoolClient): pg.Pool {
    // Create a proxy that routes pool.connect() to return this client
    // and pool.query() to use this client
    return {
      query: (sql: string, params?: unknown[]) => client.query(sql, params),
      connect: () => Promise.resolve({
        query: (sql: string, params?: unknown[]) => client.query(sql, params),
        release: () => {}, // No-op since we manage the real client
      }),
    } as unknown as pg.Pool;
  }
}
