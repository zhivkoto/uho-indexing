/**
 * Uho — Migration Runner
 *
 * Executes SQL migration files in order against the database.
 * Tracks applied migrations in a _uho_migrations table.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type pg from 'pg';

// =============================================================================
// Types
// =============================================================================

interface MigrationRecord {
  id: number;
  name: string;
  applied_at: Date;
}

// =============================================================================
// Migration Runner
// =============================================================================

/**
 * Runs all pending SQL migrations from the migrations directory.
 * Migrations are applied in filename order (001_, 002_, etc.).
 * Each migration runs inside a transaction.
 */
export async function runMigrations(pool: pg.Pool): Promise<void> {
  // Ensure the migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _uho_migrations (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Get already-applied migrations
  const applied = await pool.query<MigrationRecord>(
    'SELECT name FROM _uho_migrations ORDER BY name'
  );
  const appliedSet = new Set(applied.rows.map((r) => r.name));

  // Discover migration files
  const migrationsDir = getMigrationsDir();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO _uho_migrations (name) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`  ✅ Applied migration: ${file}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  if (count === 0) {
    console.log('  ℹ️  All migrations are up to date.');
  } else {
    console.log(`  ✅ Applied ${count} migration(s).`);
  }
}

/**
 * Returns the absolute path to the migrations directory.
 */
function getMigrationsDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return dirname(currentFile);
}
