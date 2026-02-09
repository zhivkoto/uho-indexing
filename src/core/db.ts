/**
 * Uho — Database Connection
 *
 * PostgreSQL connection pool management, database creation,
 * and query helpers. Uses the `pg` library with sensible defaults.
 */

import pg from 'pg';
import type { UhoConfig } from './types.js';

const { Pool } = pg;
export type { Pool } from 'pg';

// =============================================================================
// Connection Pool Creation
// =============================================================================

/**
 * Creates a PostgreSQL connection pool with sensible defaults.
 * Max 10 connections, 30s idle timeout.
 */
export function createPool(config: UhoConfig['database']): pg.Pool {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.name,
    user: config.user,
    password: config.password || undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

// =============================================================================
// Database Initialization
// =============================================================================

/**
 * Ensures the target database exists, creating it if necessary.
 * Connects to the default `postgres` database to run CREATE DATABASE.
 */
export async function ensureDatabase(config: UhoConfig['database']): Promise<void> {
  // Connect to the default 'postgres' database to check/create our target DB
  const adminPool = new Pool({
    host: config.host,
    port: config.port,
    database: 'postgres',
    user: config.user,
    password: config.password || undefined,
    max: 1,
  });

  try {
    const result = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [config.name]
    );

    if (result.rows.length === 0) {
      // Database doesn't exist — create it
      // Note: CREATE DATABASE can't run inside a transaction
      await adminPool.query(`CREATE DATABASE "${config.name}"`);
      console.log(`✅ Created database: ${config.name}`);
    }
  } finally {
    await adminPool.end();
  }
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Executes a parameterized SQL query and returns the rows.
 * Provides a simple typed wrapper around pool.query.
 */
export async function query<T extends Record<string, unknown>>(
  pool: pg.Pool,
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

/**
 * Executes a parameterized SQL query and returns the first row, or null.
 */
export async function queryOne<T extends Record<string, unknown>>(
  pool: pg.Pool,
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(pool, sql, params);
  return rows[0] ?? null;
}

/**
 * Tests the database connection by running a simple query.
 * Returns true if the connection is healthy.
 */
export async function testConnection(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Platform Mode — Schema-Aware Helpers
// =============================================================================

/**
 * Creates a PostgreSQL connection pool from a DATABASE_URL connection string.
 * Used in platform mode instead of the config-based createPool.
 */
export function createPoolFromUrl(url: string, max: number = 20): pg.Pool {
  return new Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Validates a user schema name to prevent SQL injection.
 * Schema names must match the pattern u_[8-12 hex chars].
 */
export function validateSchemaName(schemaName: string): boolean {
  return /^u_[a-f0-9]{8,12}$/.test(schemaName);
}

/**
 * Acquires a client from the pool with search_path set to the user's schema.
 * The caller MUST release the client when done.
 */
export async function withUserSchema(
  pool: pg.Pool,
  schemaName: string
): Promise<pg.PoolClient> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }
  const client = await pool.connect();
  await client.query(`SET search_path TO ${schemaName}, public`);
  return client;
}

/**
 * Executes a callback with the search_path set to the user's schema.
 * Automatically acquires and releases the client.
 */
export async function inUserSchema<T>(
  pool: pg.Pool,
  schemaName: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await withUserSchema(pool, schemaName);
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Creates a new PostgreSQL schema for a user.
 * Validates the name to prevent injection.
 */
export async function createUserSchema(pool: pg.Pool, schemaName: string): Promise<void> {
  if (!validateSchemaName(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
}
