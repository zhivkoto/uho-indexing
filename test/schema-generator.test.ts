/**
 * Uho — Schema Generator Tests
 *
 * Tests for DDL generation from parsed IDL definitions.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseIDL } from '../src/core/idl-parser.js';
import {
  generateDDL,
  generateEventTable,
  generateMetadataTable,
  eventTableName,
} from '../src/core/schema-generator.js';
import type { AnchorIDL, ProgramConfig } from '../src/core/types.js';

// Load fixture IDL
const swapIdl: AnchorIDL = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/swap-idl.json'), 'utf-8')
);
const parsed = parseIDL(swapIdl);

const programConfig: ProgramConfig = {
  name: 'sample_dex',
  programId: 'DEXSwap111111111111111111111111111111111111',
  idl: './fixtures/swap-idl.json',
};

// =============================================================================
// eventTableName
// =============================================================================

describe('eventTableName', () => {
  it('generates correct table names', () => {
    expect(eventTableName('sample_dex', 'SwapEvent')).toBe('sample_dex_swap_event');
    expect(eventTableName('sample_dex', 'LiquidityEvent')).toBe('sample_dex_liquidity_event');
    expect(eventTableName('counter', 'IncrementEvent')).toBe('counter_increment_event');
  });
});

// =============================================================================
// generateMetadataTable
// =============================================================================

describe('generateMetadataTable', () => {
  it('generates valid _uho_state DDL', () => {
    const ddl = generateMetadataTable();
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS _uho_state');
    expect(ddl).toContain('program_id');
    expect(ddl).toContain('program_name');
    expect(ddl).toContain('last_slot');
    expect(ddl).toContain('last_signature');
    expect(ddl).toContain('events_indexed');
    expect(ddl).toContain('status');
    expect(ddl).toContain('updated_at');
  });
});

// =============================================================================
// generateEventTable
// =============================================================================

describe('generateEventTable', () => {
  it('generates valid DDL for SwapEvent', () => {
    const swapEvent = parsed.events[0];
    const ddl = generateEventTable(parsed.programName, swapEvent);

    // Table creation
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS sample_dex_swap_event');

    // Standard columns
    expect(ddl).toContain('id');
    expect(ddl).toContain('BIGSERIAL PRIMARY KEY');
    expect(ddl).toContain('slot');
    expect(ddl).toContain('block_time');
    expect(ddl).toContain('tx_signature');
    expect(ddl).toContain('ix_index');
    expect(ddl).toContain('inner_ix_index');

    // IDL fields
    expect(ddl).toContain('amm');
    expect(ddl).toContain('input_mint');
    expect(ddl).toContain('input_amount');
    expect(ddl).toContain('output_mint');
    expect(ddl).toContain('output_amount');
    expect(ddl).toContain('fee');
    expect(ddl).toContain('timestamp');

    // Metadata column
    expect(ddl).toContain('indexed_at');

    // Indexes
    expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_sample_dex_swap_event_slot');
    expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_sample_dex_swap_event_tx');
    expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_sample_dex_swap_event_block_time');

    // Unique constraint
    expect(ddl).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_sample_dex_swap_event_tx');
  });

  it('generates correct SQL types for fields', () => {
    const swapEvent = parsed.events[0];
    const ddl = generateEventTable(parsed.programName, swapEvent);

    // pubkey fields → TEXT (column names are quoted identifiers)
    expect(ddl).toContain('"amm"');
    expect(ddl).toContain('TEXT NOT NULL');
    expect(ddl).toContain('"input_mint"');

    // u64 fields → BIGINT
    expect(ddl).toContain('"input_amount"');
    expect(ddl).toContain('BIGINT NOT NULL');
    expect(ddl).toContain('"output_amount"');
  });

  it('generates DDL for LiquidityEvent', () => {
    const liqEvent = parsed.events[1];
    const ddl = generateEventTable(parsed.programName, liqEvent);

    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS sample_dex_liquidity_event');
    expect(ddl).toContain('pool');
    expect(ddl).toContain('provider');
    expect(ddl).toContain('token_a_amount');
    expect(ddl).toContain('action');
  });
});

// =============================================================================
// generateDDL (full)
// =============================================================================

describe('generateDDL', () => {
  it('generates DDL for all events plus metadata table', () => {
    const ddl = generateDDL(parsed, programConfig);

    // Should include metadata table + 2 event tables + 2 instruction tables
    expect(ddl.length).toBe(5);
    expect(ddl[0]).toContain('_uho_state');
    expect(ddl[1]).toContain('sample_dex_swap_event');
    expect(ddl[2]).toContain('sample_dex_liquidity_event');
    expect(ddl[3]).toContain('sample_dex_swap_ix');
    expect(ddl[4]).toContain('sample_dex_add_liquidity_ix');
  });

  it('respects event whitelist filter', () => {
    const filteredConfig: ProgramConfig = {
      ...programConfig,
      events: ['SwapEvent'], // Only index SwapEvent
    };
    const ddl = generateDDL(parsed, filteredConfig);

    // Metadata + 1 event table + 2 instruction tables
    expect(ddl.length).toBe(4);
    expect(ddl[0]).toContain('_uho_state');
    expect(ddl[1]).toContain('sample_dex_swap_event');
    expect(ddl[2]).toContain('sample_dex_swap_ix');
    expect(ddl[3]).toContain('sample_dex_add_liquidity_ix');
  });

  it('handles IF NOT EXISTS for idempotent schema application', () => {
    const ddl = generateDDL(parsed, programConfig);
    for (const sql of ddl) {
      expect(sql).toContain('IF NOT EXISTS');
    }
  });
});
