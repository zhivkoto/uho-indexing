/**
 * Uho — User Routes
 *
 * User profile management and API key CRUD operations.
 * Routes are under /api/v1/user/*.
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { UserService } from '../services/user-service.js';
import { authMiddleware, jwtOnlyMiddleware } from '../middleware/auth.js';
import { generateApiKey, hashApiKey } from '../auth/api-keys.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../auth/passwords.js';
import { AppError, ValidationError, NotFoundError, ForbiddenError } from '../core/errors.js';
import { FREE_TIER_LIMITS } from '../core/platform-config.js';

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Registers all user management routes.
 */
export function registerUserRoutes(
  app: FastifyInstance,
  userService: UserService,
  pool: pg.Pool
): void {
  // -----------------------------------------------------------------------
  // GET /api/v1/user/me — Get user profile
  // -----------------------------------------------------------------------
  app.get('/api/v1/user/me', { preHandler: authMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;

    try {
      const user = await userService.getUserById(auth.userId);
      if (!user) {
        return reply.status(404).send(new NotFoundError('User not found').toResponse());
      }

      const usage = await userService.getUsageStats(auth.userId);

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        verified: user.verified,
        createdAt: user.createdAt.toISOString(),
        usage,
      };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v1/user/me — Update user profile
  // -----------------------------------------------------------------------
  app.patch('/api/v1/user/me', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const body = request.body as {
      displayName?: string;
      currentPassword?: string;
      newPassword?: string;
    } | null;

    try {
      const updates: { displayName?: string; passwordHash?: string } = {};

      if (body?.displayName !== undefined) {
        updates.displayName = body.displayName;
      }

      if (body?.newPassword) {
        if (!body.currentPassword) {
          throw new ValidationError('Current password is required to change password');
        }

        const user = await userService.getUserById(auth.userId);
        if (!user) {
          throw new NotFoundError('User not found');
        }

        const valid = await verifyPassword(body.currentPassword, user.passwordHash);
        if (!valid) {
          throw new ValidationError('Current password is incorrect');
        }

        const strength = validatePasswordStrength(body.newPassword);
        if (!strength.valid) {
          throw new ValidationError(strength.message ?? 'Password too weak');
        }

        updates.passwordHash = await hashPassword(body.newPassword);
      }

      const updated = await userService.updateUser(auth.userId, updates);

      return {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        updatedAt: updated.updatedAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/user/api-keys — List API keys (masked)
  // -----------------------------------------------------------------------
  app.get('/api/v1/user/api-keys', { preHandler: jwtOnlyMiddleware }, async (request) => {
    const auth = request.authPayload!;

    const result = await pool.query(
      `SELECT id, key_prefix, label, last_used, created_at
       FROM api_keys
       WHERE user_id = $1 AND revoked = false
       ORDER BY created_at DESC`,
      [auth.userId]
    );

    return {
      data: result.rows.map((row) => ({
        id: row.id as string,
        keyPrefix: row.key_prefix as string,
        label: (row.label ?? '') as string,
        lastUsed: row.last_used ? new Date(row.last_used as string).toISOString() : null,
        createdAt: new Date(row.created_at as string).toISOString(),
      })),
    };
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/user/api-keys — Generate new API key
  // -----------------------------------------------------------------------
  app.post('/api/v1/user/api-keys', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const body = request.body as { label?: string } | null;

    try {
      // Check limit
      const countResult = await pool.query(
        `SELECT COUNT(*)::int as count FROM api_keys WHERE user_id = $1 AND revoked = false`,
        [auth.userId]
      );
      if (countResult.rows[0].count >= FREE_TIER_LIMITS.apiKeys) {
        throw new ForbiddenError('API key limit reached for your tier');
      }

      const { key, hash, prefix } = generateApiKey();
      const label = body?.label ?? '';

      const result = await pool.query(
        `INSERT INTO api_keys (user_id, key_hash, key_prefix, label, key_full)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [auth.userId, hash, prefix, label, key]
      );

      return reply.status(201).send({
        id: result.rows[0].id as string,
        key, // Full key — shown only once
        keyPrefix: prefix,
        label,
        createdAt: new Date(result.rows[0].created_at as string).toISOString(),
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/user/api-keys/:id/reveal — Reveal full API key
  // -----------------------------------------------------------------------
  app.get('/api/v1/user/api-keys/:id/reveal', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { id } = request.params as { id: string };

    const result = await pool.query(
      `SELECT key_full FROM api_keys WHERE id = $1 AND user_id = $2 AND revoked = false`,
      [id, auth.userId]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send(new NotFoundError('API key not found').toResponse());
    }

    const keyFull = result.rows[0].key_full;
    if (!keyFull) {
      return reply.status(404).send({ error: { code: 'NOT_AVAILABLE', message: 'Full key not available for keys created before this feature' } });
    }

    return { key: keyFull };
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/user/api-keys/:id — Revoke an API key
  // -----------------------------------------------------------------------
  app.delete('/api/v1/user/api-keys/:id', { preHandler: jwtOnlyMiddleware }, async (request, reply) => {
    const auth = request.authPayload!;
    const { id } = request.params as { id: string };

    const result = await pool.query(
      `UPDATE api_keys SET revoked = true WHERE id = $1 AND user_id = $2 AND revoked = false RETURNING id`,
      [id, auth.userId]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send(new NotFoundError('API key not found').toResponse());
    }

    return { message: 'API key revoked' };
  });
}
