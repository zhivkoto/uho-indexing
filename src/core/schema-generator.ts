/**
 * Uho — Schema Generator
 *
 * Generates PostgreSQL DDL (CREATE TABLE, CREATE INDEX) from parsed IDL definitions.
 * Each event type gets its own table with auto-generated columns matching the IDL fields,
 * plus standard metadata columns (slot, block_time, tx_signature, etc.).
 */

import type { Pool } from 'pg';
import type { ParsedIDL, ParsedEvent, ParsedField, ParsedInstruction, ProgramConfig, UserProgramEvent } from './types.js';
import { toSnakeCase } from './idl-parser.js';

// =============================================================================
// Identifier Quoting
// =============================================================================

/**
 * Quotes a PostgreSQL identifier (table name, column name) by wrapping it in
 * double quotes and escaping any internal double quotes by doubling them.
 * This prevents SQL injection via identifier names.
 */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Validates that an IDL name (program, event, instruction) is safe.
 * Must start with a letter and contain only alphanumeric + underscore, max 63 chars.
 */
export const IDL_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/;

export function validateIdlName(name: string, label: string): void {
  if (!IDL_NAME_REGEX.test(name)) {
    throw new Error(`Invalid ${label} name: '${name}'. Must match /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/`);
  }
}

// =============================================================================
// Table Name Generation
// =============================================================================

/**
 * Generates the raw (unquoted) PostgreSQL table name for a given program + event.
 * Convention: {program_name}_{snake_case_event_name}
 * Example: "sample_dex" + "SwapEvent" → "sample_dex_swap_event"
 */
export function eventTableNameRaw(programName: string, eventName: string): string {
  return `${programName}_${toSnakeCase(eventName)}`;
}

/**
 * Generates the quoted PostgreSQL table name for a given program + event.
 */
export function eventTableName(programName: string, eventName: string): string {
  return quoteIdent(eventTableNameRaw(programName, eventName));
}

// =============================================================================
// Metadata Table
// =============================================================================

/**
 * Generates DDL for the _uho_state metadata table.
 * This table tracks indexer state per program (last slot, event count, status, etc.).
 */
export function generateMetadataTable(): string {
  return `
CREATE TABLE IF NOT EXISTS _uho_state (
    id              SERIAL PRIMARY KEY,
    program_id      TEXT NOT NULL UNIQUE,
    program_name    TEXT NOT NULL,
    last_slot       BIGINT DEFAULT 0,
    last_signature  TEXT,
    events_indexed  BIGINT DEFAULT 0,
    status          TEXT DEFAULT 'stopped',
    started_at      TIMESTAMPTZ,
    last_poll_at    TIMESTAMPTZ,
    error           TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);`.trim();
}

/**
 * Generates DDL for the _tx_logs table.
 * Stores raw Solana transaction log messages per tx signature.
 */
export function generateTxLogsTable(): string {
  return `
CREATE TABLE IF NOT EXISTS _tx_logs (
    tx_signature    TEXT PRIMARY KEY,
    slot            BIGINT NOT NULL,
    log_messages    TEXT[] NOT NULL,
    indexed_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tx_logs_slot ON _tx_logs (slot);`.trim();
}

// =============================================================================
// Event Table Generation
// =============================================================================

/**
 * Generates a column definition string for a parsed field.
 * Example: "input_amount BIGINT NOT NULL"
 */
function fieldToColumn(field: ParsedField): string {
  // Event fields are always nullable — decoded data may not contain all fields
  // (e.g. IDL upgrades adding new fields to existing events)
  const snakeName = toSnakeCase(field.name);
  const quotedName = `"${snakeName}"`;
  return `    ${quotedName.padEnd(22)} ${field.sqlType}`;
}

/**
 * Generates the full CREATE TABLE DDL for a single event type.
 * Includes standard metadata columns, IDL-derived columns, and indexes.
 */
export function generateEventTable(programName: string, event: ParsedEvent): string {
  const tableNameQuoted = eventTableName(programName, event.name);
  const tableNameRaw = eventTableNameRaw(programName, event.name);

  // Build the column definitions for IDL fields
  const fieldColumns = event.fields.map(fieldToColumn);

  // Combine all actual column definitions (no comments or blank lines inside SQL)
  const columns = [
    '    id                   BIGSERIAL PRIMARY KEY',
    '    slot                 BIGINT NOT NULL',
    '    block_time           TIMESTAMPTZ',
    '    tx_signature         TEXT NOT NULL',
    '    ix_index             INTEGER NOT NULL',
    '    inner_ix_index       INTEGER',
    ...fieldColumns,
    '    indexed_at            TIMESTAMPTZ DEFAULT NOW()',
  ];

  const createTable = `CREATE TABLE IF NOT EXISTS ${tableNameQuoted} (\n${columns.join(',\n')}\n);`;

  // Generate indexes for common query patterns (index names use raw name, table refs use quoted)
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_${tableNameRaw}_slot ON ${tableNameQuoted}(slot);`,
    `CREATE INDEX IF NOT EXISTS idx_${tableNameRaw}_tx ON ${tableNameQuoted}(tx_signature);`,
    `CREATE INDEX IF NOT EXISTS idx_${tableNameRaw}_block_time ON ${tableNameQuoted}(block_time);`,
    // Unique constraint to prevent duplicate event inserts
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_${tableNameRaw}_tx ON ${tableNameQuoted}(tx_signature, ix_index, COALESCE(inner_ix_index, -1));`,
  ];

  return [createTable, '', ...indexes].join('\n');
}

// =============================================================================
// Instruction Table Generation
// =============================================================================

/**
 * Generates the PostgreSQL table name for a given program + instruction.
 * Convention: {program_name}_{snake_case_instruction_name}_ix
 * Example: "solfi_v2" + "swap" → "solfi_v2_swap_ix"
 */
/**
 * Generates the raw (unquoted) PostgreSQL table name for a given program + instruction.
 */
export function instructionTableNameRaw(programName: string, instructionName: string): string {
  return `${programName}_${toSnakeCase(instructionName)}_ix`;
}

/**
 * Generates the quoted PostgreSQL table name for a given program + instruction.
 */
export function instructionTableName(programName: string, instructionName: string): string {
  return quoteIdent(instructionTableNameRaw(programName, instructionName));
}

/**
 * Generates the full CREATE TABLE DDL for a single instruction type.
 * Includes metadata columns, arg columns, and account pubkey columns.
 */
/**
 * Wraps a column name in double quotes to handle PostgreSQL reserved words.
 */
function quoteCol(name: string): string {
  return `"${name}"`;
}

export function generateInstructionTable(programName: string, instruction: ParsedInstruction): string {
  const tableNameQuoted = instructionTableName(programName, instruction.name);
  const tableNameRaw = instructionTableNameRaw(programName, instruction.name);

  // Build arg columns (snake_case and quoted to handle reserved words)
  const argColumns = instruction.args.map((field) => {
    const snakeName = toSnakeCase(field.name);
    return `    ${quoteCol(snakeName).padEnd(22)} ${field.sqlType}`;
  });

  // Build account columns (all TEXT for pubkeys, quoted) — deduplicate
  const seenColumns = new Set([
    'id', 'slot', 'block_time', 'tx_signature', 'ix_index', 'indexed_at',
    ...instruction.args.map((f) => toSnakeCase(f.name)),
  ]);
  const accountColumns: string[] = [];
  for (const accName of instruction.accounts) {
    const colName = toSnakeCase(accName);
    if (seenColumns.has(colName)) continue; // skip duplicates
    seenColumns.add(colName);
    accountColumns.push(`    ${quoteCol(colName).padEnd(22)} TEXT NOT NULL`);
  }

  const columns = [
    '    "id"                   BIGSERIAL PRIMARY KEY',
    '    "slot"                 BIGINT NOT NULL',
    '    "block_time"           TIMESTAMPTZ',
    '    "tx_signature"         TEXT NOT NULL',
    '    "ix_index"             INTEGER NOT NULL',
    ...argColumns,
    ...accountColumns,
    '    "indexed_at"            TIMESTAMPTZ DEFAULT NOW()',
  ];

  const createTable = `CREATE TABLE IF NOT EXISTS ${tableNameQuoted} (\n${columns.join(',\n')}\n);`;

  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_${tableNameRaw}_slot ON ${tableNameQuoted}("slot");`,
    `CREATE INDEX IF NOT EXISTS idx_${tableNameRaw}_tx ON ${tableNameQuoted}("tx_signature");`,
    `CREATE INDEX IF NOT EXISTS idx_${tableNameRaw}_block_time ON ${tableNameQuoted}("block_time");`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_${tableNameRaw}_tx ON ${tableNameQuoted}("tx_signature", "ix_index");`,
  ];

  return [createTable, '', ...indexes].join('\n');
}

// =============================================================================
// Full DDL Generation
// =============================================================================

/**
 * Generates all DDL statements for a parsed IDL and its configured programs.
 * Returns an array of SQL strings to execute in order.
 *
 * @param parsed - The normalized parsed IDL
 * @param config - The program configuration (used for event whitelist filtering)
 */
export function generateDDL(parsed: ParsedIDL, config: ProgramConfig): string[] {
  const ddl: string[] = [];

  // Always include the metadata state table + tx logs table
  ddl.push(generateMetadataTable());
  ddl.push(generateTxLogsTable());

  // Filter events if a whitelist is configured
  const events = config.events
    ? parsed.events.filter((e) => config.events!.includes(e.name))
    : parsed.events;

  // Generate a table for each event type
  for (const event of events) {
    ddl.push(generateEventTable(parsed.programName, event));
  }

  // Generate a table for each instruction type
  for (const instruction of parsed.instructions) {
    ddl.push(generateInstructionTable(parsed.programName, instruction));
  }

  return ddl;
}

// =============================================================================
// Schema Application
// =============================================================================

// =============================================================================
// Platform Mode — Schema-Prefixed DDL Generation
// =============================================================================

/**
 * Generates DDL for a user schema, creating tables inside the specified schema.
 * Filters by enabled events from user_program_events.
 *
 * @param schemaName - The PostgreSQL schema (e.g., 'u_a1b2c3d4')
 * @param parsed - The normalized parsed IDL
 * @param enabledEvents - Which events/instructions the user has enabled
 */
export function generateUserSchemaDDL(
  schemaName: string,
  parsed: ParsedIDL,
  enabledEvents: UserProgramEvent[]
): string[] {
  const ddl: string[] = [];

  // Set search_path for this schema
  ddl.push(`SET search_path TO ${quoteIdent(schemaName)}, public`);

  // Always include metadata + tx logs tables
  ddl.push(generateMetadataTable());
  ddl.push(generateTxLogsTable());

  // Filter events by enabled status
  const enabledEventNames = new Set(
    enabledEvents
      .filter((e) => e.enabled && e.eventType === 'event')
      .map((e) => e.eventName)
  );

  for (const event of parsed.events) {
    if (enabledEventNames.has(event.name)) {
      ddl.push(generateEventTable(parsed.programName, event));
    }
  }

  // Filter instructions by enabled status
  const enabledInstructionNames = new Set(
    enabledEvents
      .filter((e) => e.enabled && e.eventType === 'instruction')
      .map((e) => e.eventName)
  );

  for (const instruction of parsed.instructions) {
    if (enabledInstructionNames.has(instruction.name)) {
      ddl.push(generateInstructionTable(parsed.programName, instruction));
    }
  }

  // Reset search_path
  ddl.push('SET search_path TO public');

  return ddl;
}

// =============================================================================
// Schema Application
// =============================================================================

/**
 * Applies an array of DDL statements to the database.
 * Each statement is executed sequentially within a single transaction.
 */
export async function applySchema(pool: Pool, ddl: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sql of ddl) {
      await client.query(sql);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`Schema application failed: ${(err as Error).message}`);
  } finally {
    client.release();
  }
}
