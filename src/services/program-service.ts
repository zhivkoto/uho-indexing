/**
 * Uho — Program Service
 *
 * Manages program lifecycle: add, list, get, update, archive, pause, resume.
 * Handles table provisioning in user schemas and indexer notifications.
 */

import type pg from 'pg';
import type { UserProgram, UserProgramEvent, AnchorIDL } from '../core/types.js';
import { parseIDL, toSnakeCase } from '../core/idl-parser.js';
import { generateEventTable, generateInstructionTable, generateMetadataTable, applySchema } from '../core/schema-generator.js';
import { inUserSchema } from '../core/db.js';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../core/errors.js';
import { FREE_TIER_LIMITS } from '../core/platform-config.js';

// =============================================================================
// Types
// =============================================================================

interface AddProgramInput {
  programId: string;
  name?: string;
  idl: Record<string, unknown>;
  chain?: string;
  events?: Array<{ name: string; type: 'event' | 'instruction'; enabled: boolean }>;
  config?: {
    pollIntervalMs?: number;
    batchSize?: number;
    startSlot?: number;
  };
}

interface UserProgramWithEvents extends UserProgram {
  events: Array<{
    name: string;
    type: string;
    enabled: boolean;
    count: number;
  }>;
}

// =============================================================================
// Program Service
// =============================================================================

export class ProgramService {
  constructor(private pool: pg.Pool) {}

  /**
   * Adds a new program for a user to index.
   */
  async addProgram(
    userId: string,
    schemaName: string,
    input: AddProgramInput
  ): Promise<UserProgram> {
    // Validate program ID format
    if (!isValidProgramId(input.programId)) {
      throw new ValidationError('Invalid Solana program ID');
    }

    // Check for duplicate first — more informative error than "limit reached"
    const existing = await this.pool.query(
      'SELECT id FROM user_programs WHERE user_id = $1 AND program_id = $2',
      [userId, input.programId]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError('You are already indexing this program');
    }

    // Check free tier limit
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int as count FROM user_programs
       WHERE user_id = $1 AND status != 'archived'`,
      [userId]
    );
    if (countResult.rows[0].count >= FREE_TIER_LIMITS.programs) {
      throw new ForbiddenError('Program limit reached for your tier');
    }

    // Parse the IDL to validate it
    let parsedIdl;
    try {
      parsedIdl = parseIDL(input.idl as unknown as AnchorIDL);
    } catch (err) {
      throw new ValidationError(`Invalid IDL: ${(err as Error).message}`);
    }

    // Determine program name
    const programName = input.name || parsedIdl.programName;
    const chain = input.chain || 'solana-mainnet';
    const config = input.config || {};

    // Insert user_programs record
    const result = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO user_programs (user_id, program_id, name, idl, chain, status, config)
       VALUES ($1, $2, $3, $4, $5, 'provisioning', $6)
       RETURNING *`,
      [userId, input.programId, programName, JSON.stringify(input.idl), chain, JSON.stringify(config)]
    );
    const program = this.mapProgramRow(result.rows[0]);

    // Create user_program_events records
    const eventEntries = input.events || [
      ...parsedIdl.events.map((e) => ({ name: e.name, type: 'event' as const, enabled: true })),
      ...parsedIdl.instructions.map((ix) => ({ name: ix.name, type: 'instruction' as const, enabled: true })),
    ];

    for (const entry of eventEntries) {
      await this.pool.query(
        `INSERT INTO user_program_events (user_program_id, event_name, event_type, enabled)
         VALUES ($1, $2, $3, $4)`,
        [program.id, entry.name, entry.type, entry.enabled]
      );
    }

    // Provision tables in user schema
    await this.provisionTables(schemaName, program, parsedIdl, eventEntries);

    // Update status to running
    await this.pool.query(
      `UPDATE user_programs SET status = 'running', updated_at = now() WHERE id = $1`,
      [program.id]
    );
    program.status = 'running';

    // Refresh materialized view
    await this.refreshActiveSubscriptions();

    return program;
  }

  /**
   * Lists all programs for a user with event information.
   */
  async listPrograms(userId: string): Promise<(UserProgramWithEvents & { eventsIndexed: number; lastSlot: number })[]> {
    const result = await this.pool.query(
      `SELECT * FROM user_programs WHERE user_id = $1 AND status != 'archived' ORDER BY created_at DESC`,
      [userId]
    );

    // Get user's schema name for fetching event counts
    const userResult = await this.pool.query('SELECT schema_name FROM users WHERE id = $1', [userId]);
    const schemaName = userResult.rows[0]?.schema_name as string | undefined;

    const programs: (UserProgramWithEvents & { eventsIndexed: number })[] = [];
    for (const row of result.rows) {
      const program = this.mapProgramRow(row);
      const events = await this.getProgramEvents(program.id, schemaName, program.name);
      
      // Fetch events_indexed and last_slot from user schema
      let eventsIndexed = 0;
      let lastSlot = 0;
      if (schemaName) {
        try {
          const stateResult = await inUserSchema(this.pool, schemaName, async (client) => {
            const res = await client.query(
              'SELECT events_indexed, last_slot FROM _uho_state WHERE program_id = $1',
              [program.programId]
            );
            return res.rows[0];
          });
          eventsIndexed = Number(stateResult?.events_indexed ?? 0);
          lastSlot = Number(stateResult?.last_slot ?? 0);
        } catch {
          // Schema or table might not exist yet
        }
      }
      
      programs.push({ ...program, events, eventsIndexed, lastSlot });
    }

    return programs;
  }

  /**
   * Gets detailed information about a single program.
   */
  async getProgram(userId: string, programId: string): Promise<UserProgramWithEvents & { state: Record<string, unknown> | null }> {
    const result = await this.pool.query(
      'SELECT * FROM user_programs WHERE id = $1 AND user_id = $2',
      [programId, userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Program not found');
    }

    const program = this.mapProgramRow(result.rows[0]);

    // Get user's schema name
    const user = await this.pool.query('SELECT schema_name FROM users WHERE id = $1', [userId]);
    const schemaName = user.rows[0]?.schema_name as string | undefined;

    // Get events with counts
    const events = await this.getProgramEvents(program.id, schemaName, program.name);
    let state: Record<string, unknown> | null = null;

    if (schemaName) {
      try {
        state = await inUserSchema(this.pool, schemaName, async (client) => {
          const stateResult = await client.query(
            'SELECT * FROM _uho_state WHERE program_id = $1',
            [program.programId]
          );
          if (stateResult.rows.length === 0) return null;
          const row = stateResult.rows[0];
          return {
            lastSlot: Number(row.last_slot),
            eventsIndexed: Number(row.events_indexed),
            lastPollAt: row.last_poll_at ? new Date(row.last_poll_at as string).toISOString() : null,
            error: row.error ?? null,
          };
        });
      } catch {
        // Schema might not have _uho_state yet
      }
    }

    return { ...program, events, state };
  }

  /**
   * Updates a program's configuration.
   */
  async updateProgram(
    userId: string,
    programId: string,
    updates: {
      name?: string;
      events?: Array<{ name: string; type: string; enabled: boolean; fieldConfig?: Record<string, unknown> }>;
      config?: Record<string, unknown>;
    }
  ): Promise<UserProgram> {
    // Verify ownership
    const existing = await this.pool.query(
      'SELECT * FROM user_programs WHERE id = $1 AND user_id = $2',
      [programId, userId]
    );
    if (existing.rows.length === 0) {
      throw new NotFoundError('Program not found');
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.config !== undefined) {
      setClauses.push(`config = $${idx++}`);
      values.push(JSON.stringify(updates.config));
    }
    setClauses.push('updated_at = now()');
    values.push(programId);

    const result = await this.pool.query(
      `UPDATE user_programs SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    // Update events if provided
    if (updates.events) {
      const row = existing.rows[0];
      const idl = typeof row.idl === 'string' ? JSON.parse(row.idl) : row.idl;
      const parsedIdl = parseIDL(idl as unknown as AnchorIDL);
      
      // Get user's schema name
      const userResult = await this.pool.query(
        'SELECT schema_name FROM users WHERE id = $1',
        [userId]
      );
      const schemaName = userResult.rows[0]?.schema_name as string;

      for (const event of updates.events) {
        // Update the enabled flag
        await this.pool.query(
          `UPDATE user_program_events SET enabled = $1, field_config = $2
           WHERE user_program_id = $3 AND event_name = $4 AND event_type = $5`,
          [event.enabled, JSON.stringify(event.fieldConfig || {}), programId, event.name, event.type]
        );

        // If enabling, ensure table exists
        if (event.enabled && schemaName) {
          await this.ensureEventTable(schemaName, parsedIdl, event.name, event.type);
        }
      }
    }

    await this.refreshActiveSubscriptions();
    return this.mapProgramRow(result.rows[0]);
  }

  /**
   * Archives a program (stops indexing, keeps data).
   */
  async archiveProgram(userId: string, programId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE user_programs SET status = 'archived', updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [programId, userId]
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('Program not found');
    }
    await this.refreshActiveSubscriptions();
  }

  /**
   * Pauses indexing for a program.
   */
  async pauseProgram(userId: string, programId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE user_programs SET status = 'paused', updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status = 'running' RETURNING id`,
      [programId, userId]
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('Program not found or not running');
    }
    await this.refreshActiveSubscriptions();
  }

  /**
   * Resumes indexing for a paused program.
   */
  async resumeProgram(userId: string, programId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE user_programs SET status = 'running', updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status = 'paused' RETURNING id`,
      [programId, userId]
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('Program not found or not paused');
    }
    await this.refreshActiveSubscriptions();
  }

  /**
   * Refreshes the active_program_subscriptions materialized view.
   */
  async refreshActiveSubscriptions(): Promise<void> {
    try {
      await this.pool.query('SELECT refresh_active_subscriptions()');
    } catch {
      // View might not exist yet (first migration); safe to ignore
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Provisions tables in a user's schema for a new program.
   */
  private async provisionTables(
    schemaName: string,
    program: UserProgram,
    parsedIdl: ReturnType<typeof parseIDL>,
    events: Array<{ name: string; type: string; enabled: boolean }>
  ): Promise<void> {
    const ddl: string[] = [];

    // Always create _uho_state
    ddl.push(generateMetadataTable());

    // Create event tables for enabled events
    const enabledEvents = new Set(events.filter((e) => e.enabled && e.type === 'event').map((e) => e.name));
    for (const event of parsedIdl.events) {
      if (enabledEvents.has(event.name)) {
        ddl.push(generateEventTable(parsedIdl.programName, event));
      }
    }

    // Create instruction tables for enabled instructions
    const enabledInstructions = new Set(events.filter((e) => e.enabled && e.type === 'instruction').map((e) => e.name));
    for (const instruction of parsedIdl.instructions) {
      if (enabledInstructions.has(instruction.name)) {
        ddl.push(generateInstructionTable(parsedIdl.programName, instruction));
      }
    }

    // Apply DDL within the user's schema
    await inUserSchema(this.pool, schemaName, async (client) => {
      for (const sql of ddl) {
        await client.query(sql);
      }
    });
  }

  /**
   * Ensures a single event/instruction table exists in the user's schema.
   * Called when enabling a previously disabled event.
   */
  private async ensureEventTable(
    schemaName: string,
    parsedIdl: ReturnType<typeof parseIDL>,
    eventName: string,
    eventType: string
  ): Promise<void> {
    let ddl: string | null = null;

    if (eventType === 'event') {
      const eventDef = parsedIdl.events.find((e) => e.name === eventName);
      if (eventDef) {
        ddl = generateEventTable(parsedIdl.programName, eventDef);
      }
    } else if (eventType === 'instruction') {
      const ixDef = parsedIdl.instructions.find((ix) => ix.name === eventName);
      if (ixDef) {
        ddl = generateInstructionTable(parsedIdl.programName, ixDef);
      }
    }

    if (ddl) {
      await inUserSchema(this.pool, schemaName, async (client) => {
        await client.query(ddl as string);
      });
    }
  }

  /**
   * Gets event/instruction configuration for a program with counts.
   */
  private async getProgramEvents(
    userProgramId: string,
    schemaName?: string,
    programName?: string
  ): Promise<Array<{ name: string; type: string; enabled: boolean; count: number }>> {
    const result = await this.pool.query(
      `SELECT event_name, event_type, enabled FROM user_program_events
       WHERE user_program_id = $1 ORDER BY event_type, event_name`,
      [userProgramId]
    );
    
    const events = result.rows.map((row) => ({
      name: row.event_name as string,
      type: row.event_type as string,
      enabled: row.enabled as boolean,
      count: 0,
    }));

    // Fetch actual counts if schema and program name are provided
    if (schemaName && programName) {
      for (const evt of events) {
        if (evt.enabled) {
          try {
            const tableName = evt.type === 'event'
              ? `${programName}_${toSnakeCase(evt.name)}`
              : `${programName}_${toSnakeCase(evt.name)}_ix`;
            
            const countResult = await inUserSchema(this.pool, schemaName, async (client) => {
              const res = await client.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
              return res.rows[0]?.cnt ?? 0;
            });
            evt.count = Number(countResult);
          } catch {
            // Table might not exist yet
          }
        }
      }
    }

    return events;
  }

  /**
   * Maps a database row to a UserProgram object.
   */
  private mapProgramRow(row: Record<string, unknown>): UserProgram {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      programId: row.program_id as string,
      name: row.name as string,
      idl: (typeof row.idl === 'string' ? JSON.parse(row.idl as string) : row.idl) as Record<string, unknown>,
      chain: row.chain as string,
      status: row.status as UserProgram['status'],
      config: (typeof row.config === 'string' ? JSON.parse(row.config as string) : row.config ?? {}) as Record<string, unknown>,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Validates a Solana program ID (base58, 32-44 chars).
 */
function isValidProgramId(id: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id);
}
