/**
 * Uho — View Service
 *
 * Manages custom aggregation views: creation, materialization, querying, and refresh.
 * Views are defined declaratively and compiled to SQL MATERIALIZED VIEWs in user schemas.
 */

import type pg from 'pg';
import type { UserView, ViewDefinition, ViewAggregate, AnchorIDL } from '../core/types.js';
import { parseIDL, toSnakeCase } from '../core/idl-parser.js';
import { eventTableName, instructionTableName, quoteIdent } from '../core/schema-generator.js';
import { inUserSchema } from '../core/db.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../core/errors.js';
import { FREE_TIER_LIMITS } from '../core/platform-config.js';

// =============================================================================
// Types
// =============================================================================

interface CreateViewInput {
  userProgramId: string;
  name: string;
  source: string;
  definition: {
    groupBy: string | string[];
    select: Record<string, string | ViewAggregate>;
    where?: Record<string, unknown>;
  };
  materialized?: boolean;
  refreshIntervalMs?: number;
}

// =============================================================================
// View Service
// =============================================================================

export class ViewService {
  constructor(private pool: pg.Pool) {}

  /**
   * Creates a new custom view in the user's schema.
   */
  async createView(
    userId: string,
    schemaName: string,
    input: CreateViewInput
  ): Promise<UserView> {
    // Check free tier limit
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int as count FROM user_views WHERE user_id = $1 AND status != 'disabled'`,
      [userId]
    );
    if (countResult.rows[0].count >= FREE_TIER_LIMITS.customViews) {
      throw new ForbiddenError('Custom view limit reached for your tier');
    }

    // Validate name format
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(input.name)) {
      throw new ValidationError('View name must be lowercase alphanumeric with underscores, starting with a letter');
    }

    // Check uniqueness
    const existing = await this.pool.query(
      'SELECT id FROM user_views WHERE user_id = $1 AND name = $2',
      [userId, input.name]
    );
    if (existing.rows.length > 0) {
      throw new ValidationError('A view with this name already exists');
    }

    // Load program info and IDL
    const programResult = await this.pool.query(
      'SELECT idl, name FROM user_programs WHERE id = $1 AND user_id = $2',
      [input.userProgramId, userId]
    );
    if (programResult.rows.length === 0) {
      throw new NotFoundError('Program not found');
    }

    const storedIdl = programResult.rows[0].idl as Record<string, unknown>;
    const parsedIdl = parseIDL(storedIdl as unknown as AnchorIDL);
    // Use the IDL's program name for table references (tables are created using IDL name)
    const idlProgramName = parsedIdl.programName;

    // Build full definition with source
    const fullDefinition: ViewDefinition = {
      source: input.source,
      groupBy: input.definition.groupBy,
      select: input.definition.select,
      where: input.definition.where,
    };

    // Validate definition against IDL
    this.validateDefinition(fullDefinition, parsedIdl, idlProgramName);

    // Generate the SQL for the materialized view
    const viewSql = this.generateViewSQL(fullDefinition, idlProgramName, parsedIdl, input.name);

    const materialized = input.materialized !== false;
    const refreshIntervalMs = input.refreshIntervalMs ?? 60_000;

    // Insert the view record
    const result = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO user_views (user_id, user_program_id, name, definition, materialized, refresh_interval_ms, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [userId, input.userProgramId, input.name, JSON.stringify(fullDefinition), materialized, refreshIntervalMs]
    );

    // Apply the view in the user's schema
    try {
      await inUserSchema(this.pool, schemaName, async (client) => {
        await client.query(viewSql);
        if (materialized) {
          const safeName = quoteIdent(`v_${input.name.replace(/[^a-z0-9_]/g, '')}`);
          await client.query(`REFRESH MATERIALIZED VIEW ${safeName}`);
        }
      });

      // Update status to active
      await this.pool.query(
        `UPDATE user_views SET status = 'active', last_refreshed = now(), updated_at = now() WHERE id = $1`,
        [result.rows[0].id]
      );
    } catch (err) {
      // Mark as error
      await this.pool.query(
        `UPDATE user_views SET status = 'error', error = $1, updated_at = now() WHERE id = $2`,
        [(err as Error).message, result.rows[0].id]
      );
      throw new ValidationError(`Failed to create view: ${(err as Error).message}`);
    }

    return this.mapViewRow(result.rows[0]);
  }

  /**
   * Lists all views for a user.
   */
  async listViews(userId: string): Promise<UserView[]> {
    const result = await this.pool.query(
      `SELECT uv.*, up.name as program_name
       FROM user_views uv
       JOIN user_programs up ON up.id = uv.user_program_id
       WHERE uv.user_id = $1
       ORDER BY uv.created_at DESC`,
      [userId]
    );
    return result.rows.map((row) => this.mapViewRow(row));
  }

  /**
   * Deletes a custom view.
   */
  async deleteView(userId: string, schemaName: string, viewId: string): Promise<void> {
    const result = await this.pool.query(
      'SELECT name FROM user_views WHERE id = $1 AND user_id = $2',
      [viewId, userId]
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('View not found');
    }

    const viewName = result.rows[0].name as string;
    const safeName = quoteIdent(`v_${viewName.replace(/[^a-z0-9_]/g, '')}`);

    // Drop the view from user schema
    try {
      await inUserSchema(this.pool, schemaName, async (client) => {
        await client.query(`DROP MATERIALIZED VIEW IF EXISTS ${safeName}`);
        await client.query(`DROP VIEW IF EXISTS ${safeName}`);
      });
    } catch {
      // Ignore drop errors — view might not exist in schema
    }

    // Delete the record
    await this.pool.query('DELETE FROM user_views WHERE id = $1', [viewId]);
  }

  /**
   * Refreshes a materialized view in the user's schema.
   */
  async refreshView(schemaName: string, viewName: string): Promise<void> {
    const safeName = quoteIdent(`v_${viewName.replace(/[^a-z0-9_]/g, '')}`);
    await inUserSchema(this.pool, schemaName, async (client) => {
      await client.query(`REFRESH MATERIALIZED VIEW ${safeName}`);
    });
  }

  /**
   * Refreshes all materialized views that are due for a refresh.
   * Called periodically by the API service.
   */
  async refreshDueViews(): Promise<void> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT uv.id, uv.name, uv.refresh_interval_ms, u.schema_name
       FROM user_views uv
       JOIN users u ON u.id = uv.user_id
       WHERE uv.status = 'active'
         AND uv.materialized = true
         AND (uv.last_refreshed IS NULL OR
              uv.last_refreshed + (uv.refresh_interval_ms || ' milliseconds')::interval < now())`,
    );

    for (const row of result.rows) {
      try {
        await this.refreshView(
          row.schema_name as string,
          row.name as string
        );
        await this.pool.query(
          'UPDATE user_views SET last_refreshed = now(), updated_at = now() WHERE id = $1',
          [row.id]
        );
      } catch (err) {
        await this.pool.query(
          `UPDATE user_views SET status = 'error', error = $1, updated_at = now() WHERE id = $2`,
          [(err as Error).message, row.id]
        );
      }
    }
  }

  // ===========================================================================
  // Private — SQL Generation
  // ===========================================================================

  /**
   * Generates safe SQL for a MATERIALIZED VIEW from a declarative definition.
   * All field names are validated against the parsed IDL.
   */
  private generateViewSQL(
    definition: ViewDefinition,
    programName: string,
    parsedIdl: ReturnType<typeof parseIDL>,
    viewName: string
  ): string {
    const sourceEvent = parsedIdl.events.find(
      (e) => toSnakeCase(e.name) === definition.source || e.name === definition.source
    );
    const sourceInstruction = !sourceEvent
      ? parsedIdl.instructions.find(
          (ix) => toSnakeCase(ix.name) === definition.source || ix.name === definition.source
        )
      : undefined;
    if (!sourceEvent && !sourceInstruction) {
      throw new ValidationError(`Source event/instruction '${definition.source}' not found in program IDL`);
    }

    const sourceTable = sourceEvent
      ? eventTableName(programName, sourceEvent.name)
      : instructionTableName(programName, sourceInstruction!.name);
    const safeName = quoteIdent(`v_${viewName.replace(/[^a-z0-9_]/g, '')}`);

    // Build SELECT columns
    const selectCols: string[] = [];
    for (const [alias, expr] of Object.entries(definition.select)) {
      const safeAlias = quoteIdent(alias.replace(/[^a-z0-9_]/g, ''));
      if (typeof expr === 'string') {
        // Direct field reference
        const safeField = quoteIdent(expr.replace(/[^a-z0-9_]/g, ''));
        selectCols.push(`${safeField} AS ${safeAlias}`);
      } else {
        // Aggregate expression
        const aggSql = this.buildAggregate(expr);
        selectCols.push(`${aggSql} AS ${safeAlias}`);
      }
    }

    // Build GROUP BY
    const groupByFields = Array.isArray(definition.groupBy)
      ? definition.groupBy
      : [definition.groupBy];
    const safeGroupBy = groupByFields.map((f) => quoteIdent(f.replace(/[^a-z0-9_]/g, '')));

    // Build WHERE (optional) — use parameterized values embedded as literals
    // Since CREATE MATERIALIZED VIEW doesn't support $1 params, we escape properly
    let whereClause = '';
    if (definition.where && Object.keys(definition.where).length > 0) {
      const conditions: string[] = [];
      for (const [field, value] of Object.entries(definition.where)) {
        const safeField = quoteIdent(field.replace(/[^a-z0-9_]/g, ''));
        // Only support simple equality for now — use proper escaping
        if (typeof value === 'string') {
          // Escape single quotes and backslashes using PostgreSQL dollar quoting for safety
          const escaped = value.replace(/'/g, "''");
          conditions.push(`${safeField} = '${escaped}'`);
        } else if (typeof value === 'number') {
          // Validate it's actually a number to prevent injection
          if (!Number.isFinite(value)) continue;
          conditions.push(`${safeField} = ${value}`);
        } else if (typeof value === 'boolean') {
          conditions.push(`${safeField} = ${value}`);
        }
      }
      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }
    }

    return `CREATE MATERIALIZED VIEW IF NOT EXISTS ${safeName} AS
SELECT ${selectCols.join(', ')}
FROM ${sourceTable}
${whereClause}
GROUP BY ${safeGroupBy.join(', ')};`;
  }

  /**
   * Builds a SQL aggregate expression from a ViewAggregate descriptor.
   */
  private buildAggregate(agg: ViewAggregate): string {
    if (agg.$count !== undefined) {
      if (agg.$count === '*') return 'COUNT(*)';
      const safeField = quoteIdent(agg.$count.replace(/[^a-z0-9_]/g, ''));
      return `COUNT(${safeField})`;
    }
    if (agg.$sum !== undefined) {
      const safeField = quoteIdent(agg.$sum.replace(/[^a-z0-9_]/g, ''));
      return `SUM(${safeField})`;
    }
    if (agg.$avg !== undefined) {
      const safeField = quoteIdent(agg.$avg.replace(/[^a-z0-9_]/g, ''));
      return `AVG(${safeField})`;
    }
    if (agg.$min !== undefined) {
      const safeField = quoteIdent(agg.$min.replace(/[^a-z0-9_]/g, ''));
      return `MIN(${safeField})`;
    }
    if (agg.$max !== undefined) {
      const safeField = quoteIdent(agg.$max.replace(/[^a-z0-9_]/g, ''));
      return `MAX(${safeField})`;
    }
    if (agg.$first !== undefined) {
      const safeField = quoteIdent(agg.$first.replace(/[^a-z0-9_]/g, ''));
      return `(ARRAY_AGG(${safeField} ORDER BY slot ASC))[1]`;
    }
    if (agg.$last !== undefined) {
      const safeField = quoteIdent(agg.$last.replace(/[^a-z0-9_]/g, ''));
      return `(ARRAY_AGG(${safeField} ORDER BY slot DESC))[1]`;
    }
    throw new ValidationError('Invalid aggregate expression: no recognized operator');
  }

  // ===========================================================================
  // Private — Validation
  // ===========================================================================

  /**
   * Validates a view definition against the source event's fields.
   */
  private validateDefinition(
    definition: ViewDefinition,
    parsedIdl: ReturnType<typeof parseIDL>,
    programName: string
  ): void {
    const sourceEvent = parsedIdl.events.find(
      (e) => toSnakeCase(e.name) === definition.source || e.name === definition.source
    );
    const sourceInstruction = !sourceEvent
      ? parsedIdl.instructions.find(
          (ix) => toSnakeCase(ix.name) === definition.source || ix.name === definition.source
        )
      : undefined;
    if (!sourceEvent && !sourceInstruction) {
      throw new ValidationError(`Source event/instruction '${definition.source}' not found in program '${programName}'`);
    }

    // Instruction tables have account columns + arg columns; event tables have field columns
    const fieldNames = sourceEvent
      ? sourceEvent.fields.map((f) => f.name)
      : [...sourceInstruction!.accounts, ...sourceInstruction!.args.map((a) => a.name)];

    // Accept both camelCase (IDL) and snake_case (DB column) field names
    const knownFields = new Set([
      'slot', 'block_time', 'tx_signature', 'ix_index', 'inner_ix_index', 'indexed_at',
      ...fieldNames,
      ...fieldNames.map((f) => toSnakeCase(f)),
    ]);

    // Normalize field to snake_case for DB; validate it exists
    const resolveField = (field: string): string => {
      if (knownFields.has(field)) return toSnakeCase(field);
      const snake = toSnakeCase(field);
      if (knownFields.has(snake)) return snake;
      return ''; // not found
    };

    // Validate groupBy fields and normalize to snake_case
    const groupByFields = Array.isArray(definition.groupBy)
      ? definition.groupBy
      : [definition.groupBy];
    for (const field of groupByFields) {
      if (!resolveField(field)) {
        throw new ValidationError(`groupBy field '${field}' does not exist in event '${definition.source}'`);
      }
    }
    // Normalize groupBy to snake_case
    definition.groupBy = groupByFields.map((f) => resolveField(f) || f);

    // Validate select expressions and normalize field refs to snake_case
    for (const [, expr] of Object.entries(definition.select)) {
      if (typeof expr === 'string') {
        if (!resolveField(expr)) {
          throw new ValidationError(`Select field '${expr}' does not exist in event '${definition.source}'`);
        }
      } else {
        // Validate aggregate field references
        const fieldRef = expr.$count ?? expr.$sum ?? expr.$avg ?? expr.$min ?? expr.$max ?? expr.$first ?? expr.$last;
        if (fieldRef && fieldRef !== '*' && !resolveField(fieldRef)) {
          throw new ValidationError(`Aggregate field '${fieldRef}' does not exist in event '${definition.source}'`);
        }
      }
    }
    // Normalize select field refs to snake_case
    for (const [alias, expr] of Object.entries(definition.select)) {
      if (typeof expr === 'string') {
        definition.select[alias] = resolveField(expr) || expr;
      } else {
        const aggKey = (['$count', '$sum', '$avg', '$min', '$max', '$first', '$last'] as const)
          .find((k) => (expr as Record<string, unknown>)[k]);
        if (aggKey) {
          const val = (expr as Record<string, string>)[aggKey];
          if (val && val !== '*') {
            (expr as Record<string, string>)[aggKey] = resolveField(val) || val;
          }
        }
      }
    }
  }

  // ===========================================================================
  // Private — Row Mapping
  // ===========================================================================

  /**
   * Maps a database row to a UserView object.
   */
  private mapViewRow(row: Record<string, unknown>): UserView {
    const def = typeof row.definition === 'string'
      ? JSON.parse(row.definition as string)
      : row.definition;

    return {
      id: row.id as string,
      userId: row.user_id as string,
      userProgramId: row.user_program_id as string,
      name: row.name as string,
      definition: def as ViewDefinition,
      materialized: row.materialized as boolean,
      refreshIntervalMs: row.refresh_interval_ms as number,
      lastRefreshed: row.last_refreshed ? new Date(row.last_refreshed as string) : null,
      status: row.status as UserView['status'],
      error: (row.error as string | null) ?? null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
