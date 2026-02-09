/**
 * Uho — Auto-Generated REST Routes
 *
 * Dynamically generates REST API endpoints from parsed IDL event definitions.
 * Each event type gets list, detail, and count endpoints with filtering support.
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { UhoConfig, ParsedIDL, ParsedEvent, ParsedInstruction } from '../core/types.js';
import { eventTableName, instructionTableName } from '../core/schema-generator.js';
import { toSnakeCase } from '../core/idl-parser.js';

// =============================================================================
// Health & Status Routes
// =============================================================================

/**
 * Registers the /api/v1/health endpoint.
 */
export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/api/v1/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}

/**
 * Registers the /api/v1/status endpoint.
 * Returns indexer status for all configured programs.
 */
export function registerStatusRoute(
  app: FastifyInstance,
  pool: pg.Pool,
  config: UhoConfig,
  parsedIdls?: ParsedIDL[]
): void {
  // Build a lookup of events/instructions per program from parsed IDLs
  const programMeta = new Map<string, { events: string[]; instructions: string[] }>();
  if (parsedIdls) {
    for (const idl of parsedIdls) {
      programMeta.set(idl.programId, {
        events: idl.events.map((e) => toSnakeCase(e.name)),
        instructions: idl.instructions.map((ix) => toSnakeCase(ix.name)),
      });
    }
  }

  app.get('/api/v1/status', async () => {
    try {
      const result = await pool.query('SELECT * FROM _uho_state ORDER BY program_name');

      // Only include programs that are in the current config
      const configProgramIds = new Set(config.programs.map((p) => p.programId));
      const filteredRows = result.rows.filter((row) => configProgramIds.has(row.program_id));

      // Build per-event/instruction counts for programs that have them
      const programsWithCounts = await Promise.all(
        filteredRows.map(async (row) => {
          const meta = programMeta.get(row.program_id);
          const events = meta?.events ?? [];
          const instructions = meta?.instructions ?? [];

          // Build eventCounts by querying each table
          const eventCounts: Record<string, number> = {};
          const programName = row.program_name;

          for (const eventName of events) {
            const tableName = eventTableName(programName, eventName);
            try {
              const countResult = await pool.query(`SELECT COUNT(*)::int as count FROM "${tableName}"`);
              eventCounts[eventName] = countResult.rows[0]?.count ?? 0;
            } catch {
              eventCounts[eventName] = 0;
            }
          }

          for (const ixName of instructions) {
            const tableName = instructionTableName(programName, ixName);
            const apiName = ixName + '_ix';
            try {
              const countResult = await pool.query(`SELECT COUNT(*)::int as count FROM "${tableName}"`);
              eventCounts[apiName] = countResult.rows[0]?.count ?? 0;
            } catch {
              eventCounts[apiName] = 0;
            }
          }

          // API route names: events use snake_case name, instructions use name_ix
          const apiEventNames = [...events, ...instructions.map((ix) => ix + '_ix')];

          return {
            name: row.program_name,
            programId: row.program_id,
            status: row.status,
            events: apiEventNames,
            eventCounts,
            lastSlot: Number(row.last_slot),
            eventsIndexed: Number(row.events_indexed),
            lastPollAt: row.last_poll_at ? new Date(row.last_poll_at).toISOString() : null,
            error: row.error ?? null,
          };
        })
      );

      // Get the current slot from the most recently polled program
      const currentSlot = filteredRows.reduce(
        (max, row) => Math.max(max, Number(row.last_slot)),
        0
      );

      return {
        indexer: {
          status: 'running',
          currentSlot,
          version: '0.1.0',
        },
        chain: {
          name: config.chain,
        },
        programs: programsWithCounts,
      };
    } catch {
      return {
        indexer: {
          status: 'starting',
          currentSlot: 0,
        },
        chain: {
          name: config.chain,
        },
        programs: [],
      };
    }
  });
}

// =============================================================================
// Event Routes (Auto-Generated)
// =============================================================================

/**
 * Registers all REST routes for a single event type:
 * - GET /api/v1/{program}/{event} — list events (paginated, filterable)
 * - GET /api/v1/{program}/{event}/count — count events
 * - GET /api/v1/{program}/{event}/:txSignature — get events by transaction
 */
export function registerEventRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
  programName: string,
  event: ParsedEvent
): void {
  const eventSnake = toSnakeCase(event.name);
  const tableName = eventTableName(programName, event.name);
  const basePath = `/api/v1/${programName}/${eventSnake}`;

  // Known field names for safe filtering (prevents SQL injection)
  const knownFields = new Set([
    'slot', 'block_time', 'tx_signature', 'ix_index', 'inner_ix_index',
    ...event.fields.map((f) => f.name),
  ]);

  // All valid column names for orderBy
  const validOrderColumns = new Set([
    'id', 'slot', 'block_time', 'tx_signature', 'indexed_at',
    ...event.fields.map((f) => f.name),
  ]);

  // -----------------------------------------------------------------------
  // GET /api/v1/{program}/{event} — List events
  // -----------------------------------------------------------------------
  app.get(basePath, async (request) => {
    const query = request.query as Record<string, string>;

    // Pagination
    const limit = Math.min(Math.max(parseInt(query.limit || '50', 10), 1), 1000);
    const offset = Math.max(parseInt(query.offset || '0', 10), 0);

    // Ordering
    const orderBy = validOrderColumns.has(query.orderBy ?? '') ? query.orderBy : 'slot';
    const order = query.order === 'asc' ? 'ASC' : 'DESC';

    // Build WHERE clauses from query parameters
    const { whereClauses, params } = buildWhereClause(query, knownFields);

    // Execute query
    const paramOffset = params.length;
    const sql = `
      SELECT * FROM ${tableName}
      ${whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''}
      ORDER BY ${orderBy} ${order}
      LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}
    `;

    // Count query (for pagination metadata)
    const countSql = `
      SELECT COUNT(*) as total FROM ${tableName}
      ${whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''}
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(sql, [...params, limit, offset]),
      pool.query(countSql, params),
    ]);

    return {
      data: dataResult.rows.map(serializeRow),
      pagination: {
        limit,
        offset,
        total: parseInt(countResult.rows[0].total, 10),
      },
    };
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/{program}/{event}/count — Count events
  // -----------------------------------------------------------------------
  app.get(`${basePath}/count`, async (request) => {
    const query = request.query as Record<string, string>;
    const { whereClauses, params } = buildWhereClause(query, knownFields);

    const sql = `
      SELECT COUNT(*) as total FROM ${tableName}
      ${whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''}
    `;

    const result = await pool.query(sql, params);
    return { count: parseInt(result.rows[0].total, 10) };
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/{program}/{event}/:txSignature — Get events by tx signature
  // -----------------------------------------------------------------------
  app.get(`${basePath}/:txSignature`, async (request) => {
    const { txSignature } = request.params as { txSignature: string };

    const sql = `SELECT * FROM ${tableName} WHERE tx_signature = $1 ORDER BY ix_index, inner_ix_index`;
    const result = await pool.query(sql, [txSignature]);

    return {
      data: result.rows.map(serializeRow),
    };
  });
}

// =============================================================================
// Instruction Routes (Auto-Generated)
// =============================================================================

/**
 * Registers all REST routes for a single instruction type:
 * - GET /api/v1/{program}/{instruction}_ix — list instructions (paginated, filterable)
 * - GET /api/v1/{program}/{instruction}_ix/count — count instructions
 * - GET /api/v1/{program}/{instruction}_ix/:txSignature — get instructions by transaction
 */
export function registerInstructionRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
  programName: string,
  instruction: ParsedInstruction
): void {
  const ixSnake = toSnakeCase(instruction.name);
  const tableName = instructionTableName(programName, instruction.name);
  const basePath = `/api/v1/${programName}/${ixSnake}_ix`;

  // Known field names for safe filtering
  const knownFields = new Set([
    'slot', 'block_time', 'tx_signature', 'ix_index',
    ...instruction.args.map((f) => f.name),
    ...instruction.accounts.map((a) => toSnakeCase(a)),
  ]);

  const validOrderColumns = new Set([
    'id', 'slot', 'block_time', 'tx_signature', 'indexed_at',
    ...instruction.args.map((f) => f.name),
    ...instruction.accounts.map((a) => toSnakeCase(a)),
  ]);

  // GET /api/v1/{program}/{instruction}_ix — List instructions
  app.get(basePath, async (request) => {
    const query = request.query as Record<string, string>;
    const limit = Math.min(Math.max(parseInt(query.limit || '50', 10), 1), 1000);
    const offset = Math.max(parseInt(query.offset || '0', 10), 0);
    const orderBy = validOrderColumns.has(query.orderBy ?? '') ? query.orderBy : 'slot';
    const order = query.order === 'asc' ? 'ASC' : 'DESC';

    const { whereClauses, params } = buildWhereClause(query, knownFields);
    const paramOffset = params.length;

    const sql = `
      SELECT * FROM ${tableName}
      ${whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''}
      ORDER BY ${orderBy} ${order}
      LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}
    `;
    const countSql = `
      SELECT COUNT(*) as total FROM ${tableName}
      ${whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''}
    `;

    const [dataResult, countResult] = await Promise.all([
      pool.query(sql, [...params, limit, offset]),
      pool.query(countSql, params),
    ]);

    return {
      data: dataResult.rows.map(serializeRow),
      pagination: {
        limit,
        offset,
        total: parseInt(countResult.rows[0].total, 10),
      },
    };
  });

  // GET /api/v1/{program}/{instruction}_ix/count — Count instructions
  app.get(`${basePath}/count`, async (request) => {
    const query = request.query as Record<string, string>;
    const { whereClauses, params } = buildWhereClause(query, knownFields);

    const sql = `
      SELECT COUNT(*) as total FROM ${tableName}
      ${whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''}
    `;

    const result = await pool.query(sql, params);
    return { count: parseInt(result.rows[0].total, 10) };
  });

  // GET /api/v1/{program}/{instruction}_ix/:txSignature — Get instructions by tx
  app.get(`${basePath}/:txSignature`, async (request) => {
    const { txSignature } = request.params as { txSignature: string };
    const sql = `SELECT * FROM ${tableName} WHERE tx_signature = $1 ORDER BY ix_index`;
    const result = await pool.query(sql, [txSignature]);
    return { data: result.rows.map(serializeRow) };
  });
}

// =============================================================================
// Query Building Helpers
// =============================================================================

/**
 * Builds parameterized WHERE clauses from query parameters.
 * Only includes filters for known field names (SQL injection prevention).
 */
function buildWhereClause(
  query: Record<string, string>,
  knownFields: Set<string>
): { whereClauses: string[]; params: unknown[] } {
  const whereClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  // Time range filters
  if (query.from) {
    whereClauses.push(`block_time >= $${paramIdx++}`);
    params.push(query.from);
  }
  if (query.to) {
    whereClauses.push(`block_time <= $${paramIdx++}`);
    params.push(query.to);
  }

  // Slot range filters
  if (query.slotFrom) {
    whereClauses.push(`slot >= $${paramIdx++}`);
    params.push(parseInt(query.slotFrom, 10));
  }
  if (query.slotTo) {
    whereClauses.push(`slot <= $${paramIdx++}`);
    params.push(parseInt(query.slotTo, 10));
  }

  // Field-specific exact match filters
  for (const [key, value] of Object.entries(query)) {
    // Skip pagination/ordering/range params
    if (['limit', 'offset', 'orderBy', 'order', 'from', 'to', 'slotFrom', 'slotTo'].includes(key)) {
      continue;
    }

    // Only allow filtering on known fields
    const snakeKey = toSnakeCase(key);
    if (knownFields.has(snakeKey)) {
      whereClauses.push(`${snakeKey} = $${paramIdx++}`);
      params.push(value);
    }
  }

  return { whereClauses, params };
}

// =============================================================================
// Response Serialization
// =============================================================================

/**
 * Serializes a database row for JSON response.
 * Converts BigInt values to strings and formats timestamps.
 */
function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') {
      serialized[key] = value.toString();
    } else if (value instanceof Date) {
      serialized[key] = value.toISOString();
    } else {
      serialized[key] = value;
    }
  }

  return serialized;
}
