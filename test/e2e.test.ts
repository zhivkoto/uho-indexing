/**
 * Uho — End-to-End Integration Tests
 *
 * Tests the full pipeline: config → IDL parsing → schema generation →
 * database writes → API queries. Uses a real PostgreSQL database.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { parseIDL } from '../src/core/idl-parser.js';
import { generateDDL, applySchema, eventTableName } from '../src/core/schema-generator.js';
import { createPool, ensureDatabase, query } from '../src/core/db.js';
import { EventWriter } from '../src/ingestion/writer.js';
import { createServer } from '../src/api/server.js';
import { validateConfig } from '../src/core/config.js';
import type { AnchorIDL, DecodedEvent, UhoConfig, ProgramConfig } from '../src/core/types.js';

// =============================================================================
// Test Setup
// =============================================================================

const TEST_DB_NAME = 'uho_test';

const testDbConfig: UhoConfig['database'] = {
  host: 'localhost',
  port: 5432,
  name: TEST_DB_NAME,
  user: 'zhivkoto',
  password: '',
};

const testConfig: UhoConfig = {
  version: 1,
  name: 'test-indexer',
  chain: 'solana-devnet',
  database: testDbConfig,
  programs: [
    {
      name: 'sample_dex',
      programId: 'DEXSwap111111111111111111111111111111111111',
      idl: resolve(__dirname, '../fixtures/swap-idl.json'),
    },
  ],
  api: { port: 3999, host: '127.0.0.1' },
  ingestion: { pollIntervalMs: 2000, batchSize: 25 },
};

const swapIdl: AnchorIDL = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/swap-idl.json'), 'utf-8')
);
const parsed = parseIDL(swapIdl);

let pool: pg.Pool;

beforeAll(async () => {
  // Create test database
  await ensureDatabase(testDbConfig);
  pool = createPool(testDbConfig);

  // Drop existing tables for clean test
  await pool.query('DROP TABLE IF EXISTS sample_dex_swap_event CASCADE');
  await pool.query('DROP TABLE IF EXISTS sample_dex_liquidity_event CASCADE');
  await pool.query('DROP TABLE IF EXISTS _uho_state CASCADE');

  // Apply schema
  const ddl = generateDDL(parsed, testConfig.programs[0]);
  await applySchema(pool, ddl);
});

afterAll(async () => {
  if (pool) {
    // Clean up test tables
    await pool.query('DROP TABLE IF EXISTS sample_dex_swap_event CASCADE');
    await pool.query('DROP TABLE IF EXISTS sample_dex_liquidity_event CASCADE');
    await pool.query('DROP TABLE IF EXISTS _uho_state CASCADE');
    await pool.end();
  }
});

// =============================================================================
// Schema Tests
// =============================================================================

describe('Schema Application', () => {
  it('creates event tables', async () => {
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('sample_dex_swap_event', 'sample_dex_liquidity_event', '_uho_state')
      ORDER BY table_name
    `);

    const tableNames = result.rows.map((r: any) => r.table_name);
    expect(tableNames).toContain('_uho_state');
    expect(tableNames).toContain('sample_dex_swap_event');
    expect(tableNames).toContain('sample_dex_liquidity_event');
  });

  it('creates correct columns on swap_event table', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'sample_dex_swap_event'
      ORDER BY ordinal_position
    `);

    const columns = result.rows.map((r: any) => r.column_name);
    expect(columns).toContain('id');
    expect(columns).toContain('slot');
    expect(columns).toContain('block_time');
    expect(columns).toContain('tx_signature');
    expect(columns).toContain('amm');
    expect(columns).toContain('input_mint');
    expect(columns).toContain('input_amount');
    expect(columns).toContain('output_amount');
    expect(columns).toContain('indexed_at');
  });

  it('creates indexes', async () => {
    const result = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'sample_dex_swap_event'
    `);

    const indexNames = result.rows.map((r: any) => r.indexname);
    expect(indexNames).toContain('idx_sample_dex_swap_event_slot');
    expect(indexNames).toContain('idx_sample_dex_swap_event_tx');
    expect(indexNames).toContain('idx_sample_dex_swap_event_block_time');
    expect(indexNames).toContain('uq_sample_dex_swap_event_tx');
  });

  it('schema application is idempotent', async () => {
    // Applying schema again should not throw
    const ddl = generateDDL(parsed, testConfig.programs[0]);
    await expect(applySchema(pool, ddl)).resolves.not.toThrow();
  });
});

// =============================================================================
// Event Writer Tests
// =============================================================================

describe('Event Writer', () => {
  it('writes and reads back events', async () => {
    const writer = new EventWriter(pool, parsed);

    const event: DecodedEvent = {
      eventName: 'SwapEvent',
      programId: 'DEXSwap111111111111111111111111111111111111',
      slot: 123456789,
      blockTime: 1720000000,
      txSignature: 'test-sig-001',
      ixIndex: 0,
      innerIxIndex: null,
      data: {
        amm: '11111111111111111111111111111111',
        inputMint: '22222222222222222222222222222222',
        inputAmount: 1000000,
        outputMint: '33333333333333333333333333333333',
        outputAmount: 500000,
        fee: 1000,
        timestamp: 1720000000,
      },
    };

    const written = await writer.writeEvents([event]);
    expect(written).toBe(1);

    // Query it back
    const rows = await query<Record<string, unknown>>(
      pool,
      'SELECT * FROM sample_dex_swap_event WHERE tx_signature = $1',
      ['test-sig-001']
    );

    expect(rows.length).toBe(1);
    expect(rows[0].amm).toBe('11111111111111111111111111111111');
    expect(Number(rows[0].input_amount)).toBe(1000000);
    expect(Number(rows[0].slot)).toBe(123456789);
  });

  it('handles duplicate events gracefully (ON CONFLICT)', async () => {
    const writer = new EventWriter(pool, parsed);

    const event: DecodedEvent = {
      eventName: 'SwapEvent',
      programId: 'DEXSwap111111111111111111111111111111111111',
      slot: 123456790,
      blockTime: 1720000001,
      txSignature: 'test-sig-duplicate',
      ixIndex: 0,
      innerIxIndex: null,
      data: {
        amm: '11111111111111111111111111111111',
        inputMint: '22222222222222222222222222222222',
        inputAmount: 2000000,
        outputMint: '33333333333333333333333333333333',
        outputAmount: 1000000,
        fee: 2000,
        timestamp: 1720000001,
      },
    };

    // Write twice — second should succeed without error
    await writer.writeEvents([event]);
    const written = await writer.writeEvents([event]);
    // The duplicate is skipped via ON CONFLICT DO NOTHING
    expect(written).toBe(0);
  });

  it('writes and reads indexer state', async () => {
    const writer = new EventWriter(pool, parsed);

    await writer.updateState('DEXSwap111111111111111111111111111111111111', {
      status: 'running',
      lastSlot: 99999,
      eventsIndexed: 42,
      startedAt: new Date('2025-07-12T00:00:00Z'),
    });

    const state = await writer.getState('DEXSwap111111111111111111111111111111111111');
    expect(state).not.toBeNull();
    expect(state!.status).toBe('running');
    expect(state!.lastSlot).toBe(99999);
    expect(state!.eventsIndexed).toBe(42);
  });
});

// =============================================================================
// API Tests
// =============================================================================

describe('API Server', () => {
  let app: any;

  beforeAll(async () => {
    app = await createServer(testConfig, pool, [parsed]);
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('serves health endpoint', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
  });

  it('serves status endpoint', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.indexer).toBeDefined();
    expect(body.indexer.status).toBeDefined();
    expect(body.indexer.version).toBe('0.1.0');
    expect(Array.isArray(body.programs)).toBe(true);
  });

  it('serves event list endpoint with pagination', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sample_dex/swap_event?limit=10',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('pagination');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination.limit).toBe(10);
  });

  it('serves event count endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sample_dex/swap_event/count',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(typeof body.count).toBe('number');
    expect(body.count).toBeGreaterThan(0); // We inserted events above
  });

  it('serves event by tx signature', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sample_dex/swap_event/test-sig-001',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(1);
    expect(body.data[0].tx_signature).toBe('test-sig-001');
  });

  it('supports field filtering', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sample_dex/swap_event?amm=11111111111111111111111111111111',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThan(0);
    for (const event of body.data) {
      expect(event.amm).toBe('11111111111111111111111111111111');
    }
  });
});

// =============================================================================
// Config Validation Tests
// =============================================================================

describe('Config Validation', () => {
  it('validates a correct config', () => {
    const config = validateConfig({
      name: 'test',
      programs: [
        { name: 'test', programId: '11111111111111111111111111111111111111111111', idl: './test.json' },
      ],
    });
    expect(config.name).toBe('test');
    expect(config.chain).toBe('solana-devnet'); // default
    expect(config.api.port).toBe(3000); // default
  });

  it('rejects config without programs', () => {
    expect(() => validateConfig({ name: 'test', programs: [] })).toThrow();
  });

  it('rejects config without name', () => {
    expect(() =>
      validateConfig({
        name: '',
        programs: [
          { name: 'test', programId: '11111111111111111111111111111111111111111111', idl: './test.json' },
        ],
      })
    ).toThrow();
  });

  it('rejects invalid chain', () => {
    expect(() =>
      validateConfig({
        name: 'test',
        chain: 'invalid-chain',
        programs: [
          { name: 'test', programId: '11111111111111111111111111111111111111111111', idl: './test.json' },
        ],
      })
    ).toThrow();
  });

  it('applies default values', () => {
    const config = validateConfig({
      name: 'test',
      programs: [
        { name: 'test', programId: '11111111111111111111111111111111111111111111', idl: './test.json' },
      ],
    });
    expect(config.database.host).toBe('localhost');
    expect(config.database.port).toBe(5432);
    expect(config.ingestion.pollIntervalMs).toBe(2000);
    expect(config.ingestion.batchSize).toBe(25);
  });
});
