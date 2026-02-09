/**
 * Uho — Schema Middleware
 *
 * Sets the PostgreSQL search_path to the authenticated user's schema
 * before data queries run. Acquires a pool client and releases it on response.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import type pg from 'pg';
import { withUserSchema } from '../core/db.js';
import { AppError } from '../core/errors.js';

// =============================================================================
// Module State
// =============================================================================

let _pool: pg.Pool;

/**
 * Initializes the schema middleware with the database pool.
 */
export function initSchemaMiddleware(pool: pg.Pool): void {
  _pool = pool;
}

// =============================================================================
// Schema Middleware
// =============================================================================

/**
 * Acquires a pool client with search_path set to the user's schema.
 * Attaches it to request.schemaClient. Must run AFTER auth middleware.
 * The client is automatically released in the onResponse hook.
 */
export async function schemaMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const auth = request.authPayload;
  if (!auth) {
    const error = new AppError('UNAUTHORIZED', 401, 'Authentication required for data access');
    return reply.status(401).send(error.toResponse());
  }

  try {
    const client = await withUserSchema(_pool, auth.schemaName);
    request.schemaClient = client;
  } catch (err) {
    const error = new AppError('INTERNAL_ERROR', 500, `Failed to set user schema: ${(err as Error).message}`);
    return reply.status(500).send(error.toResponse());
  }
}

/**
 * Registers the onResponse hook to release schema clients.
 * Call this once during server setup.
 */
export function registerSchemaCleanup(app: FastifyInstance): void {
  app.addHook('onResponse', async (request) => {
    if (request.schemaClient) {
      request.schemaClient.release();
      request.schemaClient = undefined;
    }
  });
}
