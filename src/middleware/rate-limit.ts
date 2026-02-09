/**
 * Uho — Rate Limiting Middleware
 *
 * Per-IP and per-user rate limiting using @fastify/rate-limit.
 * Includes stricter per-route limits for auth endpoints.
 */

import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';

// =============================================================================
// Rate Limit Registration
// =============================================================================

/**
 * Registers the rate limiting plugin with default global limits.
 * Route-specific limits can be applied via route options.
 */
export async function registerRateLimiting(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    max: 100,           // Default: 100 requests per minute
    timeWindow: 60_000, // 1 minute window
    keyGenerator: (request) => {
      // Use authenticated userId if available, otherwise IP
      const auth = request.authPayload;
      if (auth) return `user:${auth.userId}`;
      return request.ip;
    },
    // Skip rate limiting for CORS preflight requests
    allowList: (request) => request.method === 'OPTIONS',
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Retry after ${Math.ceil((context.ttl ?? 0) / 1000)} seconds.`,
      },
    }),
  });
}

// =============================================================================
// Auth Route Rate Limits
// =============================================================================

/**
 * Rate limit config for the login endpoint: 5 requests per minute per IP.
 */
export const loginRateLimit: RouteShorthandOptions['config'] = {
  rateLimit: {
    max: 5,
    timeWindow: 60_000,
    keyGenerator: (request: { ip: string }) => `login:${request.ip}`,
  },
};

/**
 * Rate limit config for the register endpoint: 3 requests per minute per IP.
 */
export const registerRateLimit: RouteShorthandOptions['config'] = {
  rateLimit: {
    max: 3,
    timeWindow: 60_000,
    keyGenerator: (request: { ip: string }) => `register:${request.ip}`,
  },
};

/**
 * Rate limit config for the verify endpoint: 5 requests per minute per IP.
 */
export const verifyRateLimit: RouteShorthandOptions['config'] = {
  rateLimit: {
    max: 5,
    timeWindow: 60_000,
    keyGenerator: (request: { ip: string }) => `verify:${request.ip}`,
  },
};
