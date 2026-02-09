/**
 * Uho — Event Decoder Tests
 *
 * Tests for decoding Anchor events from transaction logs.
 * Uses synthetic log messages to test the full decode pipeline.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseIDL } from '../src/core/idl-parser.js';
import { EventDecoder } from '../src/ingestion/decoder.js';
import type { AnchorIDL } from '../src/core/types.js';

// Load fixture IDLs
const swapIdl: AnchorIDL = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/swap-idl.json'), 'utf-8')
);
const counterIdl: AnchorIDL = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/counter-idl.json'), 'utf-8')
);

// =============================================================================
// EventDecoder Construction
// =============================================================================

describe('EventDecoder', () => {
  it('constructs from swap IDL without errors', () => {
    const parsed = parseIDL(swapIdl);
    const decoder = new EventDecoder(parsed, swapIdl);
    expect(decoder).toBeDefined();
  });

  it('constructs from counter IDL without errors', () => {
    const parsed = parseIDL(counterIdl);
    const decoder = new EventDecoder(parsed, counterIdl);
    expect(decoder).toBeDefined();
  });

  it('returns empty array for empty logs', () => {
    const parsed = parseIDL(swapIdl);
    const decoder = new EventDecoder(parsed, swapIdl);

    const events = decoder.decodeLogMessages([], {
      txSignature: 'test-sig',
      slot: 100,
      blockTime: 1000000,
      programId: swapIdl.address,
    });

    expect(events).toEqual([]);
  });

  it('returns empty array for logs with no events', () => {
    const parsed = parseIDL(swapIdl);
    const decoder = new EventDecoder(parsed, swapIdl);

    const logs = [
      `Program ${swapIdl.address} invoke [1]`,
      'Program log: Instruction: Swap',
      `Program ${swapIdl.address} consumed 50000 of 200000 compute units`,
      `Program ${swapIdl.address} success`,
    ];

    const events = decoder.decodeLogMessages(logs, {
      txSignature: 'test-sig',
      slot: 100,
      blockTime: 1000000,
      programId: swapIdl.address,
    });

    expect(events).toEqual([]);
  });

  it('gets event definition by name', () => {
    const parsed = parseIDL(swapIdl);
    const decoder = new EventDecoder(parsed, swapIdl);

    const swapDef = decoder.getEventDefinition('SwapEvent');
    expect(swapDef).not.toBeNull();
    expect(swapDef!.name).toBe('SwapEvent');
    expect(swapDef!.fields.length).toBe(7);

    const unknownDef = decoder.getEventDefinition('UnknownEvent');
    expect(unknownDef).toBeNull();
  });

  it('decodes transaction with null meta gracefully', () => {
    const parsed = parseIDL(swapIdl);
    const decoder = new EventDecoder(parsed, swapIdl);

    // Simulate a transaction with null meta
    const tx = {
      slot: 100,
      blockTime: 1000000,
      transaction: { signatures: ['test-sig'], message: {} as any },
      meta: null,
      version: undefined as any,
    };

    const events = decoder.decodeTransaction(tx as any);
    expect(events).toEqual([]);
  });
});
