/**
 * Uho — Usage Service
 *
 * Tracks API calls, events indexed, WebSocket messages, and webhook deliveries.
 * Provides usage statistics and limit checking.
 */

import type pg from 'pg';
import { FREE_TIER_LIMITS } from '../core/platform-config.js';

// =============================================================================
// Usage Service
// =============================================================================

export class UsageService {
  constructor(private pool: pg.Pool) {}

  /**
   * Tracks an API call for a user in the current hour bucket.
   */
  async trackApiCall(userId: string): Promise<void> {
    await this.increment(userId, 'api_call');
  }

  /**
   * Tracks events indexed for a user.
   */
  async trackEventIndexed(userId: string, count: number): Promise<void> {
    await this.increment(userId, 'event_indexed', count);
  }

  /**
   * Tracks a WebSocket message for a user.
   */
  async trackWsMessage(userId: string): Promise<void> {
    await this.increment(userId, 'ws_message');
  }

  /**
   * Tracks a webhook delivery for a user.
   */
  async trackWebhookDelivery(userId: string): Promise<void> {
    await this.increment(userId, 'webhook_delivery');
  }

  /**
   * Gets usage statistics for a user.
   */
  async getUsage(userId: string): Promise<{
    apiCalls: number;
    eventsIndexed: number;
    programs: number;
  }> {
    const apiResult = await this.pool.query(
      `SELECT COALESCE(SUM(count), 0)::bigint as total FROM usage_metrics
       WHERE user_id = $1 AND metric_type = 'api_call'
       AND period_start >= date_trunc('month', now())`,
      [userId]
    );

    const eventResult = await this.pool.query(
      `SELECT COALESCE(SUM(count), 0)::bigint as total FROM usage_metrics
       WHERE user_id = $1 AND metric_type = 'event_indexed'`,
      [userId]
    );

    const programResult = await this.pool.query(
      `SELECT COUNT(*)::int as count FROM user_programs
       WHERE user_id = $1 AND status != 'archived'`,
      [userId]
    );

    return {
      apiCalls: Number(apiResult.rows[0].total),
      eventsIndexed: Number(eventResult.rows[0].total),
      programs: programResult.rows[0].count as number,
    };
  }

  /**
   * Checks if a user has exceeded a specific limit.
   */
  async checkLimit(
    userId: string,
    metric: 'api_call' | 'event_indexed' | 'programs'
  ): Promise<{ allowed: boolean; current: number; limit: number }> {
    if (metric === 'programs') {
      const result = await this.pool.query(
        `SELECT COUNT(*)::int as count FROM user_programs
         WHERE user_id = $1 AND status != 'archived'`,
        [userId]
      );
      const current = result.rows[0].count as number;
      return {
        allowed: current < FREE_TIER_LIMITS.programs,
        current,
        limit: FREE_TIER_LIMITS.programs,
      };
    }

    if (metric === 'api_call') {
      const result = await this.pool.query(
        `SELECT COALESCE(SUM(count), 0)::bigint as total FROM usage_metrics
         WHERE user_id = $1 AND metric_type = 'api_call'
         AND period_start >= date_trunc('month', now())`,
        [userId]
      );
      const current = Number(result.rows[0].total);
      return {
        allowed: current < FREE_TIER_LIMITS.apiCallsPerMonth,
        current,
        limit: FREE_TIER_LIMITS.apiCallsPerMonth,
      };
    }

    // event_indexed
    const result = await this.pool.query(
      `SELECT COALESCE(SUM(count), 0)::bigint as total FROM usage_metrics
       WHERE user_id = $1 AND metric_type = 'event_indexed'`,
      [userId]
    );
    const current = Number(result.rows[0].total);
    return {
      allowed: current < FREE_TIER_LIMITS.eventsIndexed,
      current,
      limit: FREE_TIER_LIMITS.eventsIndexed,
    };
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  /**
   * Increments a usage metric for the current hour bucket.
   * Uses UPSERT for atomic increment.
   */
  private async increment(
    userId: string,
    metricType: string,
    count: number = 1
  ): Promise<void> {
    const periodStart = new Date();
    periodStart.setMinutes(0, 0, 0); // Truncate to hour
    const periodEnd = new Date(periodStart.getTime() + 60 * 60 * 1000);

    await this.pool.query(
      `INSERT INTO usage_metrics (user_id, metric_type, count, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, metric_type, period_start)
       DO UPDATE SET count = usage_metrics.count + $3`,
      [userId, metricType, count, periodStart, periodEnd]
    );
  }
}
