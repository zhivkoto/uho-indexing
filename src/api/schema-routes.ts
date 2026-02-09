/**
 * Uho — Schema Introspection Routes (S2.2)
 *
 * Provides endpoints for discovering program event schemas programmatically.
 * - GET /api/v1/schema/:program — List all events with their schemas
 * - GET /api/v1/schema/:program/:event — Get a single event's field schema
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { authMiddleware } from '../middleware/auth.js';
import { parseIDL, toSnakeCase } from '../core/idl-parser.js';
import type { AnchorIDL, ParsedField } from '../core/types.js';
import { NotFoundError, AppError } from '../core/errors.js';

// =============================================================================
// Type Mapping: SQL → JSON-friendly type names
// =============================================================================

const SQL_TO_JSON_TYPE: Record<string, string> = {
  'INTEGER': 'number',
  'BIGINT': 'string',          // BigInt serialized as string
  'NUMERIC(39,0)': 'string',   // u128/i128 serialized as string
  'DOUBLE PRECISION': 'number',
  'BOOLEAN': 'boolean',
  'TEXT': 'string',
  'BYTEA': 'string',           // base64 encoded
  'JSONB': 'object',
  'TIMESTAMPTZ': 'string',     // ISO 8601
};

function sqlTypeToJsonType(sqlType: string): string {
  return SQL_TO_JSON_TYPE[sqlType] || 'string';
}

// =============================================================================
// Metadata fields added by Uho to every table
// =============================================================================

const METADATA_FIELDS: Array<{
  name: string;
  type: string;
  jsonType: string;
  nullable: boolean;
  description: string;
}> = [
  { name: 'id', type: 'BIGSERIAL', jsonType: 'number', nullable: false, description: 'Auto-incrementing row ID' },
  { name: 'slot', type: 'BIGINT', jsonType: 'string', nullable: false, description: 'Solana slot number' },
  { name: 'block_time', type: 'TIMESTAMPTZ', jsonType: 'string', nullable: true, description: 'Block timestamp (ISO 8601)' },
  { name: 'tx_signature', type: 'TEXT', jsonType: 'string', nullable: false, description: 'Transaction signature (base58)' },
  { name: 'ix_index', type: 'INTEGER', jsonType: 'number', nullable: false, description: 'Instruction index within the transaction' },
  { name: 'inner_ix_index', type: 'INTEGER', jsonType: 'number', nullable: true, description: 'Inner instruction index (null if top-level)' },
  { name: 'indexed_at', type: 'TIMESTAMPTZ', jsonType: 'string', nullable: true, description: 'When this record was indexed by Uho' },
];

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Registers schema introspection routes.
 */
export function registerSchemaRoutes(app: FastifyInstance, pool: pg.Pool): void {
  // -----------------------------------------------------------------------
  // GET /api/v1/schema/:program — List all events with schemas
  // -----------------------------------------------------------------------
  app.get('/api/v1/schema/:program', { preHandler: authMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { program } = request.params as { program: string };

    try {
      const result = await pool.query(
        `SELECT idl, name FROM user_programs WHERE user_id = $1 AND name = $2 AND status != 'archived'`,
        [auth.userId, program]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError(`Program '${program}' not found`);
      }

      const storedIdl = result.rows[0].idl as Record<string, unknown>;
      const parsedIdl = parseIDL(storedIdl as unknown as AnchorIDL);

      const events = parsedIdl.events.map((event) => ({
        name: toSnakeCase(event.name),
        originalName: event.name,
        fields: [
          ...METADATA_FIELDS.map((m) => ({
            name: m.name,
            type: m.jsonType,
            sqlType: m.type,
            nullable: m.nullable,
            description: m.description,
            source: 'metadata' as const,
          })),
          ...event.fields.map((f) => ({
            name: f.name,
            type: sqlTypeToJsonType(f.sqlType),
            sqlType: f.sqlType,
            nullable: f.nullable,
            description: `IDL field: ${f.type}`,
            source: 'idl' as const,
          })),
        ],
      }));

      const instructions = parsedIdl.instructions.map((ix) => ({
        name: `${toSnakeCase(ix.name)}_ix`,
        originalName: ix.name,
        type: 'instruction',
        args: ix.args.map((f) => ({
          name: f.name,
          type: sqlTypeToJsonType(f.sqlType),
          sqlType: f.sqlType,
          nullable: f.nullable,
          description: `IDL arg: ${f.type}`,
        })),
        accounts: ix.accounts.map((a) => toSnakeCase(a)),
      }));

      return {
        program: program,
        programId: parsedIdl.programId,
        events,
        instructions,
      };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/schema/:program/:event — Single event schema
  // -----------------------------------------------------------------------
  app.get('/api/v1/schema/:program/:event', { preHandler: authMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { program, event: eventName } = request.params as { program: string; event: string };

    try {
      const result = await pool.query(
        `SELECT idl, name FROM user_programs WHERE user_id = $1 AND name = $2 AND status != 'archived'`,
        [auth.userId, program]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError(`Program '${program}' not found`);
      }

      const storedIdl = result.rows[0].idl as Record<string, unknown>;
      const parsedIdl = parseIDL(storedIdl as unknown as AnchorIDL);

      // Check if this is an instruction (ends with _ix)
      const isInstruction = eventName.endsWith('_ix');
      const actualName = isInstruction ? eventName.slice(0, -3) : eventName;

      if (isInstruction) {
        const instruction = parsedIdl.instructions.find(
          (ix) => toSnakeCase(ix.name) === actualName || ix.name === actualName
        );
        if (!instruction) {
          throw new NotFoundError(`Instruction '${eventName}' not found in program '${program}'`);
        }

        return {
          program,
          event: eventName,
          type: 'instruction',
          fields: [
            ...METADATA_FIELDS.filter((m) => m.name !== 'inner_ix_index').map((m) => ({
              name: m.name,
              type: m.jsonType,
              sqlType: m.type,
              nullable: m.nullable,
              description: m.description,
              source: 'metadata' as const,
            })),
            ...instruction.args.map((f) => ({
              name: f.name,
              type: sqlTypeToJsonType(f.sqlType),
              sqlType: f.sqlType,
              nullable: f.nullable,
              description: `IDL arg: ${f.type}`,
              source: 'idl' as const,
            })),
            ...instruction.accounts.map((a) => ({
              name: toSnakeCase(a),
              type: 'string' as const,
              sqlType: 'TEXT',
              nullable: false,
              description: `Account: ${a}`,
              source: 'idl' as const,
            })),
          ],
        };
      }

      // Event schema
      const event = parsedIdl.events.find(
        (e) => toSnakeCase(e.name) === eventName || e.name === eventName
      );
      if (!event) {
        throw new NotFoundError(`Event '${eventName}' not found in program '${program}'`);
      }

      return {
        program,
        event: toSnakeCase(event.name),
        type: 'event',
        fields: [
          ...METADATA_FIELDS.map((m) => ({
            name: m.name,
            type: m.jsonType,
            sqlType: m.type,
            nullable: m.nullable,
            description: m.description,
            source: 'metadata' as const,
          })),
          ...event.fields.map((f) => ({
            name: f.name,
            type: sqlTypeToJsonType(f.sqlType),
            sqlType: f.sqlType,
            nullable: f.nullable,
            description: `IDL field: ${f.type}`,
            source: 'idl' as const,
          })),
        ],
      };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });
}
