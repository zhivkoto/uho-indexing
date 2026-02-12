/**
 * Uho — Data Routes (Platform Mode)
 *
 * User-scoped event data queries. Dynamically resolves programs and events
 * from the database instead of static IDL-based route registration.
 * Routes are under /api/v1/data/{program}/{event}.
 *
 * Features:
 * - S1.2: Field-level filtering with range operators (_gte, _lte, _gt, _lt)
 * - S1.5: order_by parameter (validated against known columns)
 * - S2.4: Cursor-based pagination (after_id + limit)
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { authMiddleware } from '../middleware/auth.js';
import { schemaMiddleware } from '../middleware/schema.js';
import { toSnakeCase, parseIDL } from '../core/idl-parser.js';
import { eventTableName, instructionTableName, quoteIdent } from '../core/schema-generator.js';
import type { AnchorIDL, ParsedEvent, ParsedInstruction, ParsedField } from '../core/types.js';
import { NotFoundError, ValidationError, AppError } from '../core/errors.js';

/** Reserved query params that are not field filters */
const RESERVED_PARAMS = new Set([
  'limit', 'offset', 'order_by', 'orderBy', 'order',
  'from', 'to', 'slotFrom', 'slotTo',
  'after_id', 'afterId',
]);

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Registers dynamic data routes for platform mode.
 * These routes resolve the user's programs from the DB and query their schema.
 */
export function registerDataRoutes(app: FastifyInstance, pool: pg.Pool): void {
  const preHandlers = [authMiddleware, schemaMiddleware];

  // -----------------------------------------------------------------------
  // GET /api/v1/data/all — List all events across all programs (paginated)
  //
  // Supports optional ?program=name filter and ?event=name filter.
  // Returns a unified view with event_type and program_name columns.
  // -----------------------------------------------------------------------
  app.get('/api/v1/data/all', { preHandler: preHandlers }, async (request, reply) => {
    const auth = request.authPayload!;
    const client = request.schemaClient!;
    const query = request.query as Record<string, string>;

    const limit = Math.min(Math.max(parseInt(query.limit || '50', 10), 1), 1000);
    const offset = Math.max(parseInt(query.offset || '0', 10), 0);
    const order = query.order === 'asc' ? 'ASC' : 'DESC';
    const filterProgram = query.program || '';
    const filterEvent = query.event || '';

    try {
      // Get all user programs
      const programsResult = await pool.query(
        `SELECT id, name, program_id, idl FROM user_programs WHERE user_id = $1 AND status != 'archived'`,
        [auth.userId]
      );

      if (programsResult.rows.length === 0) {
        return { data: [], pagination: { limit, offset, total: 0 } };
      }

      const { parseIDL } = await import('../core/idl-parser.js');
      const { eventTableName, instructionTableName } = await import('../core/schema-generator.js');

      // Build UNION ALL query across all enabled event + instruction tables
      const unions: string[] = [];
      const unionParams: unknown[] = [];
      let paramIdx = 1;
      for (const row of programsResult.rows) {
        if (filterProgram && row.name !== filterProgram) continue;

        const parsedIdl = parseIDL(row.idl);
        const idlProgramName = parsedIdl.programName;

        // Get enabled events AND instructions from user_program_events
        const eventsResult = await pool.query(
          `SELECT event_name, event_type FROM user_program_events WHERE user_program_id = $1 AND enabled = true`,
          [row.id]
        );

        for (const evt of eventsResult.rows) {
          if (filterEvent && evt.event_name !== filterEvent) continue;
          const tableName = evt.event_type === 'instruction'
            ? instructionTableName(idlProgramName, evt.event_name)
            : eventTableName(idlProgramName, evt.event_name);
          unionParams.push(row.name, evt.event_name);
          unions.push(
            `SELECT slot, tx_signature, block_time, $${paramIdx}::text as program_name, $${paramIdx + 1}::text as event_type FROM ${tableName}`
          );
          paramIdx += 2;
        }
      }

      if (unions.length === 0) {
        return { data: [], pagination: { limit, offset, total: 0 } };
      }

      const unionSql = unions.join(' UNION ALL ');
      unionParams.push(limit, offset);
      const dataSql = `SELECT * FROM (${unionSql}) combined ORDER BY slot ${order} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      const dataResult = await client.query(dataSql, unionParams);

      // Count total (uses same params minus limit/offset)
      const countParams = unionParams.slice(0, -2);
      const countSql = `SELECT COUNT(*)::int as count FROM (${unionSql}) combined`;
      const countResult = await client.query(countSql, countParams);
      const total = countResult.rows[0]?.count ?? 0;

      return {
        data: dataResult.rows,
        pagination: { limit, offset, total },
      };
    } catch (err) {
      console.error('[Data/all] Error:', (err as Error).message);
      return reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to query events' },
      });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/data/:program/:event — List events (paginated, filterable)
  //
  // S1.2: Field-level filtering — ?field=value, ?field_gte=N, ?field_lte=N
  // S1.5: order_by parameter — ?order_by=block_time&order=desc
  // S2.4: Cursor-based pagination — ?after_id=123&limit=50
  // -----------------------------------------------------------------------
  app.get('/api/v1/data/:program/:event', { preHandler: preHandlers }, async (request, reply) => {
    const auth = request.authPayload!;
    const client = request.schemaClient!;
    const { program, event } = request.params as { program: string; event: string };
    const query = request.query as Record<string, string>;

    const limit = Math.min(Math.max(parseInt(query.limit || '50', 10), 1), 1000);
    const offset = Math.max(parseInt(query.offset || '0', 10), 0);

    // S2.4 — Cursor-based pagination: after_id takes priority over offset
    const afterId = query.after_id || query.afterId;
    const useCursor = afterId !== undefined;

    try {
      const { tableName, knownFields, validOrderColumns, numericFields } = await resolveTable(
        pool, auth.userId, program, event
      );

      // S1.5 — Validate order_by against known columns
      const rawOrderBy = query.order_by || query.orderBy || '';
      const orderBy = validOrderColumns.has(rawOrderBy) ? rawOrderBy : 'slot';
      const order = query.order === 'asc' ? 'ASC' : 'DESC';

      const { whereClauses, params } = buildWhereClause(query, knownFields, numericFields);

      // S2.4 — Cursor: add id > or id < after_id condition based on order direction
      // When order=desc (default), we want id < after_id to get older records
      // When order=asc, we want id > after_id to get newer records
      const cursorDirection = order === 'ASC' ? '>' : '<';
      if (useCursor && afterId) {
        const parsedAfterId = parseInt(afterId, 10);
        if (isNaN(parsedAfterId)) {
          throw new ValidationError('after_id must be a valid integer');
        }
        params.push(parsedAfterId);
        whereClauses.push(`"id" ${cursorDirection} $${params.length}`);
      }

      const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
      const paramOffset = params.length;

      // For cursor pagination, order by id in the requested direction
      const effectiveOrderBy = useCursor ? '"id"' : quoteIdent(orderBy);
      const effectiveOrder = useCursor ? order : order;

      const dataSql = `
        SELECT * FROM ${tableName}
        ${whereStr}
        ORDER BY ${effectiveOrderBy} ${effectiveOrder}
        LIMIT $${paramOffset + 1}${useCursor ? '' : ` OFFSET $${paramOffset + 2}`}
      `;

      const dataParams = useCursor
        ? [...params, limit]
        : [...params, limit, offset];

      const dataResult = await client.query(dataSql, dataParams);

      // Build pagination response
      const rows = dataResult.rows.map(serializeRow);
      const lastRow = rows[rows.length - 1];
      const nextCursor = rows.length === limit && lastRow ? (lastRow.id as number) : undefined;

      if (useCursor) {
        // Cursor pagination response — no total count (expensive with cursor)
        return {
          data: rows,
          pagination: {
            limit,
            ...(nextCursor !== undefined ? { next_cursor: nextCursor } : {}),
            has_more: rows.length === limit,
          },
        };
      }

      // Offset pagination response — includes total count
      const countSql = `SELECT COUNT(*) as total FROM ${tableName} ${whereStr}`;
      const countResult = await client.query(countSql, params);

      return {
        data: rows,
        pagination: {
          limit,
          offset,
          total: parseInt(countResult.rows[0].total as string, 10),
          ...(nextCursor !== undefined ? { next_cursor: nextCursor } : {}),
        },
      };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      // Handle missing table (event not enabled) gracefully
      if ((err as { code?: string })?.code === '42P01') {
        return { data: [], pagination: { limit, offset, total: 0 } };
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/data/:program/:event/count — Count events (with filtering)
  // -----------------------------------------------------------------------
  app.get('/api/v1/data/:program/:event/count', { preHandler: preHandlers }, async (request, reply) => {
    const auth = request.authPayload!;
    const client = request.schemaClient!;
    const { program, event } = request.params as { program: string; event: string };
    const query = request.query as Record<string, string>;

    try {
      const { tableName, knownFields, numericFields } = await resolveTable(pool, auth.userId, program, event);
      const { whereClauses, params } = buildWhereClause(query, knownFields, numericFields);

      const sql = `
        SELECT COUNT(*) as total FROM ${tableName}
        ${whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''}
      `;
      const result = await client.query(sql, params);
      return { count: parseInt(result.rows[0].total as string, 10) };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      // Handle missing table (event not enabled) gracefully
      if ((err as { code?: string })?.code === '42P01') {
        return { count: 0 };
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/data/:program/:event/:txSignature — Events by transaction
  // -----------------------------------------------------------------------
  app.get('/api/v1/data/:program/:event/:txSignature', { preHandler: preHandlers }, async (request, reply) => {
    const auth = request.authPayload!;
    const client = request.schemaClient!;
    const { program, event, txSignature } = request.params as {
      program: string; event: string; txSignature: string;
    };

    try {
      const { tableName } = await resolveTable(pool, auth.userId, program, event);
      const result = await client.query(
        `SELECT * FROM ${tableName} WHERE tx_signature = $1 ORDER BY ix_index`,
        [txSignature]
      );
      return { data: result.rows.map(serializeRow) };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      // Handle missing table (event not enabled) gracefully
      if ((err as { code?: string })?.code === '42P01') {
        return { data: [] };
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/tx-logs/:txSignature — Transaction log messages
  // -----------------------------------------------------------------------
  app.get('/api/v1/tx-logs/:txSignature', { preHandler: preHandlers }, async (request, reply) => {
    const client = request.schemaClient!;
    const { txSignature } = request.params as { txSignature: string };

    try {
      const result = await client.query(
        'SELECT tx_signature, slot, log_messages, indexed_at FROM _tx_logs WHERE tx_signature = $1',
        [txSignature]
      );
      if (result.rows.length === 0) {
        return { data: null };
      }
      return { data: result.rows[0] };
    } catch (err) {
      // Table might not exist for older schemas
      if ((err as { code?: string })?.code === '42P01') {
        return { data: null };
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/data/:program/views/:viewName — Query a custom view
  // -----------------------------------------------------------------------
  app.get('/api/v1/data/:program/views/:viewName', { preHandler: preHandlers }, async (request, reply) => {
    const auth = request.authPayload!;
    const client = request.schemaClient!;
    const { viewName } = request.params as { program: string; viewName: string };
    const query = request.query as Record<string, string>;

    try {
      // Verify the view exists for this user
      const viewResult = await pool.query(
        `SELECT id, name FROM user_views WHERE user_id = $1 AND name = $2 AND status = 'active'`,
        [auth.userId, viewName]
      );
      if (viewResult.rows.length === 0) {
        throw new NotFoundError('View not found');
      }

      const safeViewName = quoteIdent(`v_${viewName.replace(/[^a-z0-9_]/g, '')}`);
      const limit = Math.min(Math.max(parseInt(query.limit || '50', 10), 1), 1000);
      const offset = Math.max(parseInt(query.offset || '0', 10), 0);
      const order = query.order === 'asc' ? 'ASC' : 'DESC';

      // Validate orderBy column name (alphanumeric + underscore only)
      const orderByCol = query.orderBy && /^[a-z_][a-z0-9_]*$/i.test(query.orderBy)
        ? quoteIdent(query.orderBy)
        : '1';
      const dataSql = `SELECT * FROM ${safeViewName} ORDER BY ${orderByCol} ${order} LIMIT $1 OFFSET $2`;
      const countSql = `SELECT COUNT(*) as total FROM ${safeViewName}`;

      const [dataResult, countResult] = await Promise.all([
        client.query(dataSql, [limit, offset]),
        client.query(countSql),
      ]);

      return {
        data: dataResult.rows.map(serializeRow),
        pagination: {
          limit,
          offset,
          total: parseInt(countResult.rows[0].total as string, 10),
        },
      };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });
}

// =============================================================================
// Helpers
// =============================================================================

/** Metadata about a resolved table's fields */
export interface ResolvedTable {
  tableName: string;
  knownFields: Set<string>;
  validOrderColumns: Set<string>;
  /** Set of field names that are numeric (support range operators) */
  numericFields: Set<string>;
  /** Full parsed field details for schema introspection */
  fieldDetails: ParsedField[];
}

/**
 * Resolves a program + event name to a table name and field metadata.
 * Looks up the user's program in the DB and parses the stored IDL.
 */
export async function resolveTable(
  pool: pg.Pool,
  userId: string,
  programName: string,
  eventName: string
): Promise<ResolvedTable> {
  // Find the user's program by name
  const result = await pool.query(
    `SELECT idl, name FROM user_programs WHERE user_id = $1 AND name = $2 AND status != 'archived'`,
    [userId, programName]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError(`Program '${programName}' not found`);
  }

  const storedIdl = result.rows[0].idl as Record<string, unknown>;

  // Check if this is an instruction (ends with _ix)
  const isInstruction = eventName.endsWith('_ix');
  const actualEventName = isInstruction ? eventName.slice(0, -3) : eventName;

  // Parse the IDL to get field info — use the IDL's program name for table names
  // because provisionTables() creates tables using parsedIdl.programName (from IDL metadata)
  const parsedIdl = parseIDL(storedIdl as unknown as AnchorIDL);
  const idlProgramName = parsedIdl.programName;

  let tableName: string;
  let fields: string[];
  let fieldDetails: ParsedField[];

  if (isInstruction) {
    // Accept both snake_case and original names
    const instruction = parsedIdl.instructions.find(
      (ix) => toSnakeCase(ix.name) === actualEventName || ix.name === actualEventName
    );
    if (!instruction) {
      throw new NotFoundError(`Instruction '${eventName}' not found in program '${programName}'`);
    }
    tableName = instructionTableName(idlProgramName, instruction.name);
    fields = [
      ...instruction.args.map((f) => f.name),
      ...instruction.accounts.map((a) => toSnakeCase(a)),
    ];
    fieldDetails = instruction.args;
  } else {
    // Accept both snake_case and original names — try events first, then instructions
    const event = parsedIdl.events.find(
      (e) => toSnakeCase(e.name) === eventName || e.name === eventName
    );
    if (event) {
      tableName = eventTableName(idlProgramName, event.name);
      fields = event.fields.map((f) => f.name);
      fieldDetails = event.fields;
    } else {
      // Fall back to instruction lookup (frontend may omit _ix suffix)
      const instruction = parsedIdl.instructions.find(
        (ix) => toSnakeCase(ix.name) === eventName || ix.name === eventName
      );
      if (!instruction) {
        throw new NotFoundError(`Event '${eventName}' not found in program '${programName}'`);
      }
      tableName = instructionTableName(idlProgramName, instruction.name);
      fields = [
        ...instruction.args.map((f) => f.name),
        ...instruction.accounts.map((a) => toSnakeCase(a)),
      ];
      fieldDetails = instruction.args;
    }
  }

  const knownFields = new Set([
    'slot', 'block_time', 'tx_signature', 'ix_index', 'inner_ix_index',
    ...fields,
  ]);

  const validOrderColumns = new Set([
    'id', 'slot', 'block_time', 'tx_signature', 'indexed_at',
    ...fields,
  ]);

  // Determine which fields are numeric (support range operators _gte, _lte, _gt, _lt)
  const NUMERIC_SQL_TYPES = new Set(['INTEGER', 'BIGINT', 'NUMERIC(39,0)', 'DOUBLE PRECISION']);
  const numericFields = new Set<string>([
    'id', 'slot', 'ix_index', 'inner_ix_index', // Built-in numeric metadata fields
    ...fieldDetails
      .filter((f) => NUMERIC_SQL_TYPES.has(f.sqlType))
      .map((f) => f.name),
  ]);

  return { tableName, knownFields, validOrderColumns, numericFields, fieldDetails };
}

/** Range operator suffixes for numeric fields (S1.2) */
const RANGE_SUFFIXES = ['_gte', '_lte', '_gt', '_lt'] as const;
const RANGE_OPERATORS: Record<string, string> = {
  '_gte': '>=',
  '_lte': '<=',
  '_gt': '>',
  '_lt': '<',
};

/**
 * Builds parameterized WHERE clauses from query parameters.
 *
 * S1.2: Supports field-level filtering:
 * - Exact match: ?field=value (strings, booleans, pubkeys)
 * - Range operators: ?field_gte=N, ?field_lte=N, ?field_gt=N, ?field_lt=N (numeric fields)
 *
 * All field names are validated against the known fields whitelist to prevent SQL injection.
 */
function buildWhereClause(
  query: Record<string, string>,
  knownFields: Set<string>,
  numericFields: Set<string> = new Set()
): { whereClauses: string[]; params: unknown[] } {
  const whereClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  // Built-in time range filters
  if (query.from) {
    whereClauses.push(`"block_time" >= $${paramIdx++}`);
    params.push(query.from);
  }
  if (query.to) {
    whereClauses.push(`"block_time" <= $${paramIdx++}`);
    params.push(query.to);
  }
  if (query.slotFrom) {
    whereClauses.push(`"slot" >= $${paramIdx++}`);
    params.push(parseInt(query.slotFrom, 10));
  }
  if (query.slotTo) {
    whereClauses.push(`"slot" <= $${paramIdx++}`);
    params.push(parseInt(query.slotTo, 10));
  }

  // S1.2 — Field-level filtering (exact match + range operators)
  for (const [key, value] of Object.entries(query)) {
    if (RESERVED_PARAMS.has(key)) continue;
    // Skip built-in time range params
    if (['from', 'to', 'slotFrom', 'slotTo'].includes(key)) continue;

    // Check for range operator suffix (e.g., sol_amount_gte)
    let matchedRange = false;
    for (const suffix of RANGE_SUFFIXES) {
      if (key.endsWith(suffix)) {
        const baseKey = key.slice(0, -suffix.length);
        const snakeKey = toSnakeCase(baseKey);
        if (knownFields.has(snakeKey) && numericFields.has(snakeKey)) {
          const op = RANGE_OPERATORS[suffix];
          whereClauses.push(`${quoteIdent(snakeKey)} ${op} $${paramIdx++}`);
          params.push(parseNumericValue(value));
          matchedRange = true;
        }
        break;
      }
    }
    if (matchedRange) continue;

    // Exact match filter
    const snakeKey = toSnakeCase(key);
    if (knownFields.has(snakeKey)) {
      // Parse boolean values
      if (value === 'true' || value === 'false') {
        whereClauses.push(`${quoteIdent(snakeKey)} = $${paramIdx++}`);
        params.push(value === 'true');
      } else {
        whereClauses.push(`${quoteIdent(snakeKey)} = $${paramIdx++}`);
        params.push(value);
      }
    }
  }

  return { whereClauses, params };
}

/**
 * Parses a numeric value from a query string, handling both integers and decimals.
 */
function parseNumericValue(value: string): number | string {
  // For very large numbers (u64, u128), keep as string for Postgres NUMERIC/BIGINT
  if (value.length > 15) return value;
  const num = Number(value);
  return isNaN(num) ? value : num;
}

/**
 * Serializes a database row for JSON response.
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
