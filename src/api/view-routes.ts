/**
 * Uho — View Routes
 *
 * CRUD routes for custom aggregation views.
 * Routes are under /api/v1/views/*.
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { ViewService } from '../services/view-service.js';
import type { ViewAggregate } from '../core/types.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppError } from '../core/errors.js';

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Registers all custom view routes.
 */
export function registerViewRoutes(
  app: FastifyInstance,
  viewService: ViewService,
  pool: pg.Pool
): void {
  // -----------------------------------------------------------------------
  // GET /api/v1/views — List user's custom views
  // -----------------------------------------------------------------------
  app.get('/api/v1/views', { preHandler: authMiddleware }, async (request) => {
    const auth = request.authPayload!;
    const views = await viewService.listViews(auth.userId);

    return {
      data: views.map((v) => ({
        id: v.id,
        name: v.name,
        userProgramId: v.userProgramId,
        definition: v.definition,
        materialized: v.materialized,
        refreshIntervalMs: v.refreshIntervalMs,
        lastRefreshed: v.lastRefreshed ? v.lastRefreshed.toISOString() : null,
        status: v.status,
        error: v.error,
        createdAt: v.createdAt.toISOString(),
      })),
    };
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/views — Create a custom view
  // -----------------------------------------------------------------------
  app.post('/api/v1/views', { preHandler: authMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const body = request.body as {
      userProgramId?: string;
      name?: string;
      source?: string;
      definition?: {
        groupBy?: string | string[];
        select?: Record<string, string | ViewAggregate>;
        where?: Record<string, unknown>;
      };
      materialized?: boolean;
      refreshIntervalMs?: number;
    } | null;

    if (!body?.userProgramId || !body?.name || !body?.source || !body?.definition) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'userProgramId, name, source, and definition are required' },
      });
    }

    if (!body.definition.groupBy || !body.definition.select) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'definition must include groupBy and select' },
      });
    }

    try {
      const view = await viewService.createView(auth.userId, auth.schemaName, {
        userProgramId: body.userProgramId,
        name: body.name,
        source: body.source,
        definition: {
          groupBy: body.definition.groupBy,
          select: body.definition.select,
          where: body.definition.where,
        },
        materialized: body.materialized,
        refreshIntervalMs: body.refreshIntervalMs,
      });

      return reply.status(201).send({
        id: view.id,
        name: view.name,
        status: view.status,
        createdAt: view.createdAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/views/:id — Delete a custom view
  // -----------------------------------------------------------------------
  app.delete('/api/v1/views/:id', { preHandler: authMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { id } = request.params as { id: string };

    try {
      await viewService.deleteView(auth.userId, auth.schemaName, id);
      return { message: 'View deleted' };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });
}
