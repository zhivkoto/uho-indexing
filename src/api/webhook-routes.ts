/**
 * Uho — Webhook Routes
 *
 * CRUD routes for webhook subscriptions.
 * Routes are under /api/v1/webhooks/*.
 */

import type { FastifyInstance } from 'fastify';
import type { WebhookService } from '../services/webhook-service.js';
import { authMiddleware, jwtOnlyMiddleware } from '../middleware/auth.js';
import { AppError } from '../core/errors.js';

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Registers all webhook management routes.
 */
export function registerWebhookRoutes(
  app: FastifyInstance,
  webhookService: WebhookService
): void {
  // -----------------------------------------------------------------------
  // GET /api/v1/webhooks — List user's webhooks
  // -----------------------------------------------------------------------
  app.get('/api/v1/webhooks', { preHandler: authMiddleware }, async (request) => {
    const auth = request.authPayload!;
    const webhooks = await webhookService.list(auth.userId);

    return {
      data: webhooks.map((w) => ({
        id: w.id,
        userProgramId: w.userProgramId,
        url: w.url,
        events: w.events,
        filters: w.filters,
        active: w.active,
        lastTriggered: w.lastTriggered ? w.lastTriggered.toISOString() : null,
        failureCount: w.failureCount,
        createdAt: w.createdAt.toISOString(),
      })),
    };
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/webhooks — Create a webhook
  // -----------------------------------------------------------------------
  app.post('/api/v1/webhooks', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const body = request.body as {
      userProgramId?: string;
      url?: string;
      events?: string[];
      filters?: Record<string, unknown>;
    } | null;

    if (!body?.userProgramId || !body?.url) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'userProgramId and url are required' },
      });
    }

    try {
      const webhook = await webhookService.create(auth.userId, {
        userProgramId: body.userProgramId,
        url: body.url,
        events: body.events,
        filters: body.filters,
      });

      return reply.status(201).send({
        id: webhook.id,
        url: webhook.url,
        secret: webhook.secret, // Shown only once
        events: webhook.events,
        active: webhook.active,
        createdAt: webhook.createdAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v1/webhooks/:id — Update a webhook
  // -----------------------------------------------------------------------
  app.patch('/api/v1/webhooks/:id', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { id } = request.params as { id: string };
    const body = request.body as {
      url?: string;
      events?: string[];
      filters?: Record<string, unknown>;
      active?: boolean;
    } | null;

    try {
      const webhook = await webhookService.update(auth.userId, id, body ?? {});

      return {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        filters: webhook.filters,
        active: webhook.active,
        updatedAt: webhook.updatedAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/webhooks/:id — Delete a webhook
  // -----------------------------------------------------------------------
  app.delete('/api/v1/webhooks/:id', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { id } = request.params as { id: string };

    try {
      await webhookService.delete(auth.userId, id);
      return { message: 'Webhook deleted' };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });
}
