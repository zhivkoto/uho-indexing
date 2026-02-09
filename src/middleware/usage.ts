/**
 * Uho — Usage Tracking Middleware
 *
 * Tracks API call counts per user per hour for usage metrics
 * and enforces free tier limits.
 */

import type { FastifyInstance } from 'fastify';
import type { UsageService } from '../services/usage-service.js';

// =============================================================================
// Usage Tracking
// =============================================================================

/**
 * Registers an onRequest hook that tracks API call counts for authenticated users.
 * Runs after auth middleware has set request.authPayload.
 */
export function registerUsageTracking(
  app: FastifyInstance,
  usageService: UsageService
): void {
  app.addHook('onResponse', async (request) => {
    const auth = request.authPayload;
    if (!auth) return;

    // Skip auth endpoints from usage tracking
    if (request.url.startsWith('/api/v1/auth/')) return;
    if (request.url === '/api/v1/health') return;

    // Fire-and-forget usage tracking (don't slow down the request)
    usageService.trackApiCall(auth.userId).catch(() => {});
  });
}
