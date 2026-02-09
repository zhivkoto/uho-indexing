/**
 * Uho — Program Routes
 *
 * CRUD routes for managing user programs (indexer configurations).
 * Includes IDL discovery, pause/resume, and archival.
 */

import type { FastifyInstance } from 'fastify';
import type { ProgramService } from '../services/program-service.js';
import type { IdlDiscoveryService } from '../services/idl-discovery.js';
import { authMiddleware, jwtOnlyMiddleware } from '../middleware/auth.js';
import { AppError } from '../core/errors.js';

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Registers all program management routes.
 */
export function registerProgramRoutes(
  app: FastifyInstance,
  programService: ProgramService,
  idlDiscoveryService: IdlDiscoveryService | null
): void {
  // -----------------------------------------------------------------------
  // GET /api/v1/programs — List user's programs
  // -----------------------------------------------------------------------
  app.get('/api/v1/programs', { preHandler: authMiddleware }, async (request) => {
    const auth = request.authPayload!;
    const programs = await programService.listPrograms(auth.userId);
    // Exclude IDL from list response to reduce payload size.
    // Full IDL is available via GET /api/v1/programs/:id.
    const data = programs.map(({ idl, ...rest }) => rest);
    return { data };
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/programs — Add a new program
  // -----------------------------------------------------------------------
  app.post('/api/v1/programs', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const body = request.body as {
      programId?: string;
      name?: string;
      idl?: Record<string, unknown>;
      chain?: string;
      events?: Array<{ name: string; type: 'event' | 'instruction'; enabled: boolean }>;
      config?: { pollIntervalMs?: number; batchSize?: number; startSlot?: number };
    } | null;

    if (!body?.programId || !body?.idl) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'programId and idl are required' },
      });
    }

    try {
      const program = await programService.addProgram(auth.userId, auth.schemaName, {
        programId: body.programId,
        name: body.name,
        idl: body.idl,
        chain: body.chain,
        events: body.events,
        config: body.config,
      });
      return reply.status(201).send({
        id: program.id,
        programId: program.programId,
        name: program.name,
        status: program.status,
        createdAt: program.createdAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/programs/:id — Get program detail
  // -----------------------------------------------------------------------
  app.get('/api/v1/programs/:id', { preHandler: authMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { id } = request.params as { id: string };

    try {
      const program = await programService.getProgram(auth.userId, id);
      return program;
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v1/programs/:id — Update program config
  // -----------------------------------------------------------------------
  app.patch('/api/v1/programs/:id', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      events?: Array<{ name: string; type: string; enabled: boolean; fieldConfig?: Record<string, unknown> }>;
      config?: Record<string, unknown>;
    } | null;

    try {
      const program = await programService.updateProgram(auth.userId, id, body || {});
      return {
        id: program.id,
        name: program.name,
        config: program.config,
        updatedAt: program.updatedAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/programs/:id — Archive program
  // -----------------------------------------------------------------------
  app.delete('/api/v1/programs/:id', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { id } = request.params as { id: string };

    try {
      await programService.archiveProgram(auth.userId, id);
      return { message: 'Program archived' };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/programs/:id/pause
  // -----------------------------------------------------------------------
  app.post('/api/v1/programs/:id/pause', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { id } = request.params as { id: string };

    try {
      await programService.pauseProgram(auth.userId, id);
      return { message: 'Indexer paused' };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/programs/:id/resume
  // -----------------------------------------------------------------------
  app.post('/api/v1/programs/:id/resume', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { id } = request.params as { id: string };

    try {
      await programService.resumeProgram(auth.userId, id);
      return { message: 'Indexer resumed' };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/programs/discover-idl
  // -----------------------------------------------------------------------
  app.post('/api/v1/programs/discover-idl', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const body = request.body as { programId?: string } | null;
    if (!body?.programId) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'programId is required' },
      });
    }

    if (!idlDiscoveryService) {
      return reply.status(200).send({
        found: false,
        source: 'manual-required',
        message: 'IDL discovery not configured. Please upload manually.',
      });
    }

    try {
      const result = await idlDiscoveryService.discover(body.programId);
      return result;
    } catch (err) {
      return reply.status(200).send({
        found: false,
        source: 'manual-required',
        message: `IDL discovery failed: ${(err as Error).message}. Please upload manually.`,
      });
    }
  });
}
