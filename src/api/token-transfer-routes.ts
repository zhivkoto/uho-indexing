/**
 * Uho — Token Transfer API Routes
 *
 * REST API endpoints for querying token transfer data.
 * Registered when a program has tokenTransfers enabled.
 *
 * Routes:
 * - GET /api/v1/transfers          — List transfers (paginated, filterable)
 * - GET /api/v1/transfers/count    — Count transfers
 * - GET /api/v1/transfers/:txSig   — Get transfers by transaction
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { toSnakeCase } from '../core/idl-parser.js';

// =============================================================================
// Token Transfer Routes (CLI Mode)
// =============================================================================

/** Known filterable fields for _token_transfers */
const KNOWN_FIELDS = new Set([
  'program_id', 'instruction_type', 'source', 'destination',
  'authority', 'mint', 'amount', 'decimals', 'slot',
  'block_time', 'tx_signature', 'ix_index', 'inner_ix_index',
]);

const VALID_ORDER_COLUMNS = new Set([
  'id', 'slot', 'block_time', 'tx_signature', 'amount',
  'instruction_type', 'indexed_at',
]);

/**
 * Registers token transfer REST routes for CLI (single-user) mode.
 */
export function registerTokenTransferRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
): void {
  const basePath = '/api/v1/transfers';

  // -----------------------------------------------------------------------
  // GET /api/v1/transfers — List transfers (paginated, filterable)
  // -----------------------------------------------------------------------
  app.get(basePath, async (request) => {
    const query = request.query as Record<string, string>;
    const limit = Math.min(Math.max(parseInt(query.limit || '50', 10), 1), 1000);
    const offset = Math.max(parseInt(query.offset || '0', 10), 0);
    const orderBy = VALID_ORDER_COLUMNS.has(query.orderBy ?? '') ? query.orderBy : 'slot';
    const order = query.order === 'asc' ? 'ASC' : 'DESC';

    const { whereClauses, params } = buildTransferWhereClause(query);
    const paramOffset = params.length;

    const sql = `
      SELECT * FROM _token_transfers
      ${whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''}
      ORDER BY "${orderBy}" ${order}
      LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}
    `;

    const countSql = `
      SELECT COUNT(*) as total FROM _token_transfers
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
  // GET /api/v1/transfers/count — Count transfers
  // -----------------------------------------------------------------------
  app.get(`${basePath}/count`, async (request) => {
    const query = request.query as Record<string, string>;
    const { whereClauses, params } = buildTransferWhereClause(query);

    const sql = `
      SELECT COUNT(*) as total FROM _token_transfers
      ${whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''}
    `;

    const result = await pool.query(sql, params);
    return { count: parseInt(result.rows[0].total, 10) };
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/transfers/:txSignature — Get transfers by transaction
  // -----------------------------------------------------------------------
  app.get(`${basePath}/:txSignature`, async (request) => {
    const { txSignature } = request.params as { txSignature: string };
    const sql = `SELECT * FROM _token_transfers WHERE tx_signature = $1 ORDER BY ix_index, inner_ix_index`;
    const result = await pool.query(sql, [txSignature]);
    return { data: result.rows.map(serializeRow) };
  });
}

// =============================================================================
// Query Building
// =============================================================================

function buildTransferWhereClause(
  query: Record<string, string>
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

  // Field-specific filters
  for (const [key, value] of Object.entries(query)) {
    if (['limit', 'offset', 'orderBy', 'order', 'from', 'to', 'slotFrom', 'slotTo'].includes(key)) {
      continue;
    }

    const snakeKey = toSnakeCase(key);
    if (KNOWN_FIELDS.has(snakeKey)) {
      whereClauses.push(`"${snakeKey}" = $${paramIdx++}`);
      params.push(value);
    }
  }

  return { whereClauses, params };
}

// =============================================================================
// Response Serialization
// =============================================================================

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
