/**
 * Uho — Schema Command
 *
 * Generates PostgreSQL DDL from configured IDLs and optionally applies it.
 * Useful for inspecting what Uho will create without starting the indexer.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { loadConfig } from '../core/config.js';
import { parseIDL, isShankIDL, parseShankIDL } from '../core/idl-parser.js';
import { generateDDL, applySchema } from '../core/schema-generator.js';
import { createPool, ensureDatabase } from '../core/db.js';
import type { AnchorIDL, ShankIDL } from '../core/types.js';

// =============================================================================
// Schema Command
// =============================================================================

export async function schemaCommand(options: {
  config?: string;
  apply?: boolean;
}): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Load configuration
  // -------------------------------------------------------------------------
  let config;
  try {
    config = loadConfig(options.config);
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // 2. Parse IDLs and generate DDL
  // -------------------------------------------------------------------------
  const allDdl: string[] = [];

  for (const programConfig of config.programs) {
    const idlPath = resolve(programConfig.idl);
    if (!existsSync(idlPath)) {
      console.error(`❌ IDL file not found: ${idlPath}`);
      process.exit(1);
    }

    const rawJson = JSON.parse(readFileSync(idlPath, 'utf-8'));

    const parsed = isShankIDL(rawJson)
      ? parseShankIDL(rawJson as ShankIDL)
      : parseIDL(rawJson as AnchorIDL);

    const ddl = generateDDL(parsed, programConfig);
    allDdl.push(...ddl);

    console.log(`\n📐 Schema for program: ${programConfig.name}${isShankIDL(rawJson) ? ' [shank]' : ''}`);
    console.log(`   Events: ${parsed.events.map((e) => e.name).join(', ') || '(none)'}`);
    console.log(`   Instructions: ${parsed.instructions.map((ix) => ix.name).join(', ') || '(none)'}`);
  }

  // -------------------------------------------------------------------------
  // 3. Print DDL
  // -------------------------------------------------------------------------
  console.log('\n-- Generated DDL:\n');
  for (const sql of allDdl) {
    console.log(sql);
    console.log('');
  }

  // -------------------------------------------------------------------------
  // 4. Apply if --apply flag is set
  // -------------------------------------------------------------------------
  if (options.apply) {
    console.log('📦 Applying schema to database...');
    let pool;
    try {
      await ensureDatabase(config.database);
      pool = createPool(config.database);
    } catch (err) {
      console.error(`❌ Database connection failed: ${(err as Error).message}`);
      process.exit(1);
    }

    try {
      await applySchema(pool, allDdl);
      console.log('✅ Schema applied successfully!');
    } catch (err) {
      console.error(`❌ Failed to apply schema: ${(err as Error).message}`);
      process.exit(1);
    } finally {
      await pool.end();
    }
  } else {
    console.log('ℹ️  Dry run. Use --apply to execute against the database.');
  }
}
