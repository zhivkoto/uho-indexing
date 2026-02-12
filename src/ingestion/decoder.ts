/**
 * Uho — Event Decoder
 *
 * Decodes Anchor events from Solana transaction logs.
 * Uses @coral-xyz/anchor's BorshCoder and EventParser for battle-tested
 * discriminator matching and Borsh deserialization.
 */

import { BorshCoder, EventParser } from '@coral-xyz/anchor';
import { PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js';
import type { AnchorIDL, ParsedIDL, DecodedEvent, ParsedEvent } from '../core/types.js';

// =============================================================================
// Event Decoder
// =============================================================================

export class EventDecoder {
  private parsedIdl: ParsedIDL;
  private eventParser: EventParser;
  private eventNames: Set<string>;
  private debugCount?: number;

  /**
   * Creates a decoder from a parsed IDL.
   * Initializes the Anchor BorshCoder and EventParser for log parsing.
   *
   * @param parsedIdl - The normalized parsed IDL
   * @param rawIdl - The original Anchor IDL JSON (needed by BorshCoder)
   */
  constructor(parsedIdl: ParsedIDL, rawIdl: AnchorIDL) {
    this.parsedIdl = parsedIdl;

    // Create the Anchor BorshCoder from the raw IDL
    // Some IDLs reference types not defined in the types array (e.g., "entry"),
    // which causes BorshCoder to throw. We patch missing types as empty structs.
    let patchedIdl = rawIdl;
    try {
      new BorshCoder(rawIdl as any);
    } catch (err) {
      const msg = (err as Error).message || '';
      const match = msg.match(/Type not found: (\w+)/);
      if (match) {
        // Patch missing types iteratively
        patchedIdl = JSON.parse(JSON.stringify(rawIdl));
        const types = (patchedIdl as any).types ?? [];
        let attempts = 0;
        while (attempts < 10) {
          try {
            new BorshCoder(patchedIdl as any);
            break;
          } catch (retryErr) {
            const retryMsg = (retryErr as Error).message || '';
            const retryMatch = retryMsg.match(/Type not found: (\w+)/);
            if (retryMatch) {
              console.warn(`[EventDecoder] Patching missing IDL type: ${retryMatch[1]}`);
              types.push({ name: retryMatch[1], type: { kind: 'struct', fields: [] } });
              (patchedIdl as any).types = types;
              attempts++;
            } else {
              throw retryErr;
            }
          }
        }
      } else {
        throw err;
      }
    }

    const coder = new BorshCoder(patchedIdl as any);
    const programId = new PublicKey(parsedIdl.programId);
    this.eventParser = new EventParser(programId, coder);

    // Track known event names for quick lookup
    this.eventNames = new Set(parsedIdl.events.map((e) => e.name));
  }

  /**
   * Decodes all events from a single parsed transaction.
   * Returns an array of DecodedEvent objects with normalized field values.
   */
  decodeTransaction(tx: ParsedTransactionWithMeta): DecodedEvent[] {
    const logs = tx.meta?.logMessages;
    if (!logs || logs.length === 0) return [];

    const txSignature = tx.transaction.signatures[0];
    const slot = tx.slot;
    const blockTime = tx.blockTime ?? null;

    return this.decodeLogMessages(logs, {
      txSignature,
      slot,
      blockTime,
      programId: this.parsedIdl.programId,
    });
  }

  /**
   * Decodes events from raw log messages with transaction context.
   * Uses Anchor's EventParser to handle discriminator matching and deserialization.
   */
  decodeLogMessages(
    logs: string[],
    context: TxContext
  ): DecodedEvent[] {
    const events: DecodedEvent[] = [];
    let ixIndex = 0;

    try {
      // Use Anchor's EventParser to parse events from logs
      const parsedEvents = this.eventParser.parseLogs(logs);

      for (const event of parsedEvents) {
        // Log decoded event for debugging
        console.log(`  🎯 Decoded event: ${event.name}`);
        
        // Skip events not in our IDL (shouldn't happen but be safe)
        if (!this.eventNames.has(event.name)) continue;

        events.push({
          eventName: event.name,
          programId: context.programId,
          slot: context.slot,
          blockTime: context.blockTime,
          txSignature: context.txSignature,
          ixIndex: ixIndex,
          innerIxIndex: null,
          data: normalizeEventData(event.data as Record<string, unknown>),
        });

        ixIndex++;
      }
    } catch (err) {
      // Log parsing failures are not fatal — some transactions may have
      // events from other programs or malformed data
      console.warn(
        `[Decoder] Failed to parse logs for tx ${context.txSignature}: ${(err as Error).message}`
      );
      // Debug: show the error stack for the first few failures
      if (this.debugCount === undefined) this.debugCount = 0;
      if (this.debugCount < 3) {
        console.warn(`[Decoder] Stack: ${(err as Error).stack?.split('\n').slice(0, 3).join('\n')}`);
        this.debugCount++;
      }
    }

    return events;
  }

  /**
   * Returns the parsed event definition for a given event name, or null.
   */
  getEventDefinition(eventName: string): ParsedEvent | null {
    return this.parsedIdl.events.find((e) => e.name === eventName) ?? null;
  }
}

// =============================================================================
// Types
// =============================================================================

/** Context from the parent transaction, attached to each decoded event */
export interface TxContext {
  txSignature: string;
  slot: number;
  blockTime: number | null;
  programId: string;
}

// =============================================================================
// Data Normalization
// =============================================================================

/**
 * Normalizes decoded event data for storage:
 * - BN (big number) → string
 * - PublicKey → base58 string
 * - Buffer / Uint8Array → hex string
 * - Nested objects → recursively normalized
 */
function normalizeEventData(data: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    normalized[key] = normalizeValue(value);
  }

  return normalized;
}

/**
 * Normalizes a single value from Anchor's event decoder output.
 */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // Handle BN (Anchor uses BN.js)
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    const bn = value as { toString: () => string; toNumber: () => number };
    // Use string for large numbers to preserve precision
    try {
      const num = bn.toNumber();
      // Safe integer range
      if (Number.isSafeInteger(num)) return num;
      return bn.toString();
    } catch {
      return bn.toString();
    }
  }

  // Handle PublicKey
  if (typeof value === 'object' && value !== null && 'toBase58' in value) {
    return (value as { toBase58: () => string }).toBase58();
  }

  // Handle Buffer / Uint8Array
  if (Buffer.isBuffer(value)) {
    return '\\x' + value.toString('hex');
  }
  if (value instanceof Uint8Array) {
    return '\\x' + Buffer.from(value).toString('hex');
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  // Handle nested objects
  if (typeof value === 'object' && value !== null) {
    return normalizeEventData(value as Record<string, unknown>);
  }

  // Primitives pass through
  return value;
}
