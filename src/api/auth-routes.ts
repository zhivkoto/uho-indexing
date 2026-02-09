/**
 * Uho — Auth Routes
 *
 * Registration, login, verification, token refresh, logout, and password reset.
 * All routes are under /api/v1/auth/*.
 */

import type { FastifyInstance } from 'fastify';
import type { UserService } from '../services/user-service.js';
import { AppError } from '../core/errors.js';
import { REFRESH_TOKEN_EXPIRY_SECONDS } from '../auth/jwt.js';
import type { PlatformConfig } from '../core/platform-config.js';
import { loginRateLimit, registerRateLimit, verifyRateLimit } from '../middleware/rate-limit.js';

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Registers all authentication routes.
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  userService: UserService,
  config: PlatformConfig
): void {
  const cookieOptions = {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax' as const,
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_EXPIRY_SECONDS,
  };

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/register — 3 req/min per IP
  // -----------------------------------------------------------------------
  app.post('/api/v1/auth/register', { config: registerRateLimit }, async (request, reply) => {
    const body = request.body as { email?: string; password?: string } | null;
    if (!body?.email || !body?.password) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
      });
    }

    try {
      const result = await userService.createUser(body.email, body.password);
      return reply.status(201).send({
        message: 'Verification email sent',
        userId: result.userId,
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/verify — 5 req/min per IP
  // -----------------------------------------------------------------------
  app.post('/api/v1/auth/verify', { config: verifyRateLimit }, async (request, reply) => {
    const body = request.body as { email?: string; code?: string } | null;
    if (!body?.email || !body?.code) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'Email and code are required' },
      });
    }

    try {
      const result = await userService.verifyEmail(body.email, body.code);
      reply.setCookie('uho_refresh', result.refreshToken, cookieOptions);
      return reply.status(200).send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/login — 5 req/min per IP
  // -----------------------------------------------------------------------
  app.post('/api/v1/auth/login', { config: loginRateLimit }, async (request, reply) => {
    const body = request.body as { email?: string; password?: string } | null;
    if (!body?.email || !body?.password) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
      });
    }

    try {
      const result = await userService.login(body.email, body.password);
      reply.setCookie('uho_refresh', result.refreshToken, cookieOptions);
      return reply.status(200).send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/refresh
  // -----------------------------------------------------------------------
  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const body = request.body as { refreshToken?: string } | null;
    const cookieToken = (request.cookies as Record<string, string | undefined>)?.uho_refresh;
    const token = body?.refreshToken || cookieToken;

    if (!token) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Refresh token required' },
      });
    }

    try {
      const result = await userService.refreshTokens(token);
      reply.setCookie('uho_refresh', result.refreshToken, cookieOptions);
      return reply.status(200).send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/logout
  // -----------------------------------------------------------------------
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const auth = request.authPayload;
    if (auth) {
      await userService.revokeUserTokens(auth.userId);
    }
    reply.clearCookie('uho_refresh', { path: '/api/v1/auth' });
    return reply.status(200).send({ message: 'Logged out' });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/forgot-password
  // -----------------------------------------------------------------------
  app.post('/api/v1/auth/forgot-password', async (request, reply) => {
    const body = request.body as { email?: string } | null;
    if (!body?.email) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'Email is required' },
      });
    }

    await userService.forgotPassword(body.email);
    return reply.status(200).send({
      message: 'If the email exists, a reset link has been sent',
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/auth/reset-password
  // -----------------------------------------------------------------------
  app.post('/api/v1/auth/reset-password', async (request, reply) => {
    const body = request.body as { token?: string; password?: string } | null;
    if (!body?.token || !body?.password) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'Token and password are required' },
      });
    }

    try {
      await userService.resetPassword(body.token, body.password);
      return reply.status(200).send({ message: 'Password reset successfully' });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });
}
