/**
 * Uho — Fastify Type Augmentations
 *
 * Extends Fastify's request interface with platform-specific properties.
 */

import type pg from 'pg';
import type { AuthPayload } from './core/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated user payload (set by auth middleware) */
    authPayload?: AuthPayload;
    /** Schema-scoped database client (set by schema middleware, released on response) */
    schemaClient?: pg.PoolClient;
  }
}
