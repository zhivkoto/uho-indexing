/**
 * Uho — IDL Parser Tests
 *
 * Tests for parsing Anchor v0.30 IDLs into normalized event/field definitions.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseIDL,
  parseEvent,
  parseField,
  anchorTypeToSql,
  toSnakeCase,
  computeEventDiscriminator,
} from '../src/core/idl-parser.js';
import type { AnchorIDL, AnchorEvent, AnchorField } from '../src/core/types.js';

// Load fixture IDLs
const swapIdl: AnchorIDL = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/swap-idl.json'), 'utf-8')
);
const counterIdl: AnchorIDL = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/counter-idl.json'), 'utf-8')
);

// =============================================================================
// toSnakeCase
// =============================================================================

describe('toSnakeCase', () => {
  it('converts camelCase to snake_case', () => {
    expect(toSnakeCase('inputAmount')).toBe('input_amount');
    expect(toSnakeCase('outputMint')).toBe('output_mint');
    expect(toSnakeCase('tokenAMint')).toBe('token_a_mint');
  });

  it('converts PascalCase to snake_case', () => {
    expect(toSnakeCase('SwapEvent')).toBe('swap_event');
    expect(toSnakeCase('LiquidityEvent')).toBe('liquidity_event');
  });

  it('handles already-snake_case names', () => {
    expect(toSnakeCase('already_snake')).toBe('already_snake');
  });

  it('handles single-word names', () => {
    expect(toSnakeCase('pool')).toBe('pool');
    expect(toSnakeCase('amm')).toBe('amm');
  });
});

// =============================================================================
// anchorTypeToSql
// =============================================================================

describe('anchorTypeToSql', () => {
  it('maps integer types correctly', () => {
    expect(anchorTypeToSql('u8')).toEqual({ sqlType: 'INTEGER', nullable: false });
    expect(anchorTypeToSql('u16')).toEqual({ sqlType: 'INTEGER', nullable: false });
    expect(anchorTypeToSql('u32')).toEqual({ sqlType: 'INTEGER', nullable: false });
    expect(anchorTypeToSql('i8')).toEqual({ sqlType: 'INTEGER', nullable: false });
    expect(anchorTypeToSql('i16')).toEqual({ sqlType: 'INTEGER', nullable: false });
    expect(anchorTypeToSql('i32')).toEqual({ sqlType: 'INTEGER', nullable: false });
  });

  it('maps 64-bit integers to BIGINT', () => {
    expect(anchorTypeToSql('u64')).toEqual({ sqlType: 'BIGINT', nullable: false });
    expect(anchorTypeToSql('i64')).toEqual({ sqlType: 'BIGINT', nullable: false });
  });

  it('maps 128-bit integers to NUMERIC', () => {
    expect(anchorTypeToSql('u128')).toEqual({ sqlType: 'NUMERIC(39,0)', nullable: false });
    expect(anchorTypeToSql('i128')).toEqual({ sqlType: 'NUMERIC(39,0)', nullable: false });
  });

  it('maps floating point types', () => {
    expect(anchorTypeToSql('f32')).toEqual({ sqlType: 'DOUBLE PRECISION', nullable: false });
    expect(anchorTypeToSql('f64')).toEqual({ sqlType: 'DOUBLE PRECISION', nullable: false });
  });

  it('maps bool to BOOLEAN', () => {
    expect(anchorTypeToSql('bool')).toEqual({ sqlType: 'BOOLEAN', nullable: false });
  });

  it('maps string to TEXT', () => {
    expect(anchorTypeToSql('string')).toEqual({ sqlType: 'TEXT', nullable: false });
  });

  it('maps pubkey/publicKey to TEXT', () => {
    expect(anchorTypeToSql('pubkey')).toEqual({ sqlType: 'TEXT', nullable: false });
    expect(anchorTypeToSql('publicKey')).toEqual({ sqlType: 'TEXT', nullable: false });
  });

  it('maps bytes to BYTEA', () => {
    expect(anchorTypeToSql('bytes')).toEqual({ sqlType: 'BYTEA', nullable: false });
  });

  it('maps Option<T> to nullable', () => {
    expect(anchorTypeToSql({ option: 'u64' })).toEqual({ sqlType: 'BIGINT', nullable: true });
    expect(anchorTypeToSql({ option: 'pubkey' })).toEqual({ sqlType: 'TEXT', nullable: true });
  });

  it('maps Vec<T> to JSONB', () => {
    expect(anchorTypeToSql({ vec: 'u64' })).toEqual({ sqlType: 'JSONB', nullable: false });
  });

  it('maps fixed array to JSONB', () => {
    expect(anchorTypeToSql({ array: ['u8', 32] })).toEqual({ sqlType: 'JSONB', nullable: false });
  });

  it('maps defined types to JSONB', () => {
    expect(anchorTypeToSql({ defined: { name: 'MyStruct' } })).toEqual({ sqlType: 'JSONB', nullable: false });
  });
});

// =============================================================================
// parseField
// =============================================================================

describe('parseField', () => {
  it('parses a u64 field', () => {
    const field: AnchorField = { name: 'inputAmount', type: 'u64' };
    const parsed = parseField(field);
    expect(parsed.name).toBe('input_amount');
    expect(parsed.type).toBe('u64');
    expect(parsed.sqlType).toBe('BIGINT');
    expect(parsed.nullable).toBe(false);
  });

  it('parses a pubkey field', () => {
    const field: AnchorField = { name: 'amm', type: 'pubkey' };
    const parsed = parseField(field);
    expect(parsed.name).toBe('amm');
    expect(parsed.type).toBe('pubkey');
    expect(parsed.sqlType).toBe('TEXT');
    expect(parsed.nullable).toBe(false);
  });

  it('parses an optional field', () => {
    const field: AnchorField = { name: 'maybeMint', type: { option: 'pubkey' } };
    const parsed = parseField(field);
    expect(parsed.name).toBe('maybe_mint');
    expect(parsed.sqlType).toBe('TEXT');
    expect(parsed.nullable).toBe(true);
  });
});

// =============================================================================
// parseEvent
// =============================================================================

describe('parseEvent', () => {
  it('parses SwapEvent from swap IDL', () => {
    const event = swapIdl.events[0];
    const parsed = parseEvent(event);
    expect(parsed.name).toBe('SwapEvent');
    expect(parsed.discriminator).toBeInstanceOf(Buffer);
    expect(parsed.discriminator.length).toBe(8);
    expect(parsed.fields.length).toBe(7); // amm, inputMint, inputAmount, outputMint, outputAmount, fee, timestamp
    expect(parsed.fields[0].name).toBe('amm');
    expect(parsed.fields[0].sqlType).toBe('TEXT');
    expect(parsed.fields[2].name).toBe('input_amount');
    expect(parsed.fields[2].sqlType).toBe('BIGINT');
  });

  it('uses discriminator from IDL when present', () => {
    const event = swapIdl.events[0];
    const parsed = parseEvent(event);
    const expected = Buffer.from([64, 198, 205, 232, 38, 8, 113, 226]);
    expect(parsed.discriminator).toEqual(expected);
  });
});

// =============================================================================
// computeEventDiscriminator
// =============================================================================

describe('computeEventDiscriminator', () => {
  it('computes a consistent 8-byte discriminator', () => {
    const disc = computeEventDiscriminator('SwapEvent');
    expect(disc).toBeInstanceOf(Buffer);
    expect(disc.length).toBe(8);
  });

  it('produces different discriminators for different names', () => {
    const disc1 = computeEventDiscriminator('SwapEvent');
    const disc2 = computeEventDiscriminator('LiquidityEvent');
    expect(disc1).not.toEqual(disc2);
  });

  it('is deterministic', () => {
    const disc1 = computeEventDiscriminator('TestEvent');
    const disc2 = computeEventDiscriminator('TestEvent');
    expect(disc1).toEqual(disc2);
  });
});

// =============================================================================
// parseIDL (full)
// =============================================================================

describe('parseIDL', () => {
  it('parses swap IDL with events', () => {
    const parsed = parseIDL(swapIdl);
    expect(parsed.programId).toBe('DEXSwap111111111111111111111111111111111111');
    expect(parsed.programName).toBe('sample_dex');
    expect(parsed.events.length).toBe(2);
    expect(parsed.events[0].name).toBe('SwapEvent');
    expect(parsed.events[1].name).toBe('LiquidityEvent');
    expect(parsed.instructions.length).toBe(2);
    expect(parsed.accounts.length).toBe(2);
  });

  it('parses counter IDL with one event', () => {
    const parsed = parseIDL(counterIdl);
    expect(parsed.programId).toBe('Coun1111111111111111111111111111111111111111');
    expect(parsed.programName).toBe('counter');
    expect(parsed.events.length).toBe(1);
    expect(parsed.events[0].name).toBe('IncrementEvent');
    expect(parsed.events[0].fields.length).toBe(3);
  });

  it('parses LiquidityEvent fields correctly', () => {
    const parsed = parseIDL(swapIdl);
    const liqEvent = parsed.events[1];
    expect(liqEvent.name).toBe('LiquidityEvent');
    expect(liqEvent.fields.length).toBe(8);

    const poolField = liqEvent.fields[0];
    expect(poolField.name).toBe('pool');
    expect(poolField.sqlType).toBe('TEXT');

    const actionField = liqEvent.fields[7];
    expect(actionField.name).toBe('action');
    expect(actionField.sqlType).toBe('INTEGER');
  });

  it('handles IDL with no events gracefully', () => {
    const noEventsIdl: AnchorIDL = {
      ...swapIdl,
      events: [],
    };
    const parsed = parseIDL(noEventsIdl);
    expect(parsed.events).toEqual([]);
  });
});
