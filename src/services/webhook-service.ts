/**
 * Uho — Webhook Service
 *
 * Manages webhook CRUD operations, event delivery with HMAC signing,
 * and exponential-backoff retry logic.
 */

import type pg from 'pg';
import crypto from 'crypto';
import type { WebhookRecord, PgNotifyPayload } from '../core/types.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../core/errors.js';
import { FREE_TIER_LIMITS } from '../core/platform-config.js';

// =============================================================================
// Constants
// =============================================================================

/** Retry delays in milliseconds: immediate, 30s, 2min, 10min, 1hr */
const RETRY_DELAYS = [0, 30_000, 120_000, 600_000, 3_600_000];

/** HTTP timeout for webhook delivery attempts */
const DELIVERY_TIMEOUT_MS = 10_000;

/** Auto-disable webhook after this many consecutive failures */
const MAX_FAILURE_COUNT = 10;

// =============================================================================
// Types
// =============================================================================

interface CreateWebhookInput {
  userProgramId: string;
  url: string;
  events?: string[];
  filters?: Record<string, unknown>;
}

interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  filters?: Record<string, unknown>;
  active?: boolean;
}

/** An indexed event ready for webhook delivery */
export interface IndexedEventForDelivery {
  programId: string;
  eventName: string;
  slot: number;
  txSignature: string;
  data: Record<string, unknown>;
  subscribers: string[];
}

// =============================================================================
// Webhook Service
// =============================================================================

export class WebhookService {
  constructor(private pool: pg.Pool) {}

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * Creates a new webhook subscription.
   * Returns the full record including the HMAC signing secret (shown once).
   */
  async create(userId: string, input: CreateWebhookInput): Promise<WebhookRecord> {
    // Check free tier limit
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int as count FROM webhooks WHERE user_id = $1 AND active = true`,
      [userId]
    );
    if (countResult.rows[0].count >= FREE_TIER_LIMITS.webhooks) {
      throw new ForbiddenError('Webhook limit reached for your tier');
    }

    // Validate URL
    if (!this.isValidWebhookUrl(input.url)) {
      throw new ValidationError('Webhook URL must be a valid HTTPS URL');
    }

    // Validate program ownership
    const programResult = await this.pool.query(
      'SELECT id FROM user_programs WHERE id = $1 AND user_id = $2',
      [input.userProgramId, userId]
    );
    if (programResult.rows.length === 0) {
      throw new NotFoundError('Program not found');
    }

    // Generate HMAC signing secret
    const secret = crypto.randomBytes(32).toString('hex');

    const result = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO webhooks (user_id, user_program_id, url, secret, events, filters, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING *`,
      [
        userId,
        input.userProgramId,
        input.url,
        secret,
        input.events ?? [],
        JSON.stringify(input.filters ?? {}),
      ]
    );

    return this.mapWebhookRow(result.rows[0]);
  }

  /**
   * Lists all webhooks for a user.
   */
  async list(userId: string): Promise<WebhookRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows.map((row) => this.mapWebhookRow(row));
  }

  /**
   * Updates a webhook's configuration.
   */
  async update(userId: string, webhookId: string, updates: UpdateWebhookInput): Promise<WebhookRecord> {
    // Verify ownership
    const existing = await this.pool.query(
      'SELECT id FROM webhooks WHERE id = $1 AND user_id = $2',
      [webhookId, userId]
    );
    if (existing.rows.length === 0) {
      throw new NotFoundError('Webhook not found');
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.url !== undefined) {
      if (!this.isValidWebhookUrl(updates.url)) {
        throw new ValidationError('Webhook URL must be a valid HTTPS URL');
      }
      setClauses.push(`url = $${idx++}`);
      values.push(updates.url);
    }
    if (updates.events !== undefined) {
      setClauses.push(`events = $${idx++}`);
      values.push(updates.events);
    }
    if (updates.filters !== undefined) {
      setClauses.push(`filters = $${idx++}`);
      values.push(JSON.stringify(updates.filters));
    }
    if (updates.active !== undefined) {
      setClauses.push(`active = $${idx++}`);
      values.push(updates.active);
      // Reset failure count when re-enabling
      if (updates.active) {
        setClauses.push('failure_count = 0');
      }
    }
    setClauses.push('updated_at = now()');
    values.push(webhookId);

    const result = await this.pool.query(
      `UPDATE webhooks SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    return this.mapWebhookRow(result.rows[0]);
  }

  /**
   * Deletes a webhook.
   */
  async delete(userId: string, webhookId: string): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM webhooks WHERE id = $1 AND user_id = $2 RETURNING id',
      [webhookId, userId]
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('Webhook not found');
    }
  }

  // ===========================================================================
  // Event Delivery
  // ===========================================================================

  /**
   * Delivers an indexed event to all matching webhooks.
   * Called from the PG LISTEN handler.
   */
  async deliverEvent(event: IndexedEventForDelivery): Promise<void> {
    // Load all active webhooks for subscribers of this program
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT w.* FROM webhooks w
       JOIN user_programs up ON up.id = w.user_program_id
       WHERE up.program_id = $1
         AND w.active = true
         AND w.user_id = ANY($2)`,
      [event.programId, event.subscribers]
    );

    for (const row of result.rows) {
      const webhook = this.mapWebhookRow(row);

      // Check event name filter
      if (webhook.events.length > 0 && !webhook.events.includes(event.eventName)) {
        continue;
      }

      // Check field filters
      if (!this.matchesFilters(event.data, webhook.filters)) {
        continue;
      }

      // Deliver asynchronously (don't block other deliveries)
      this.deliverToWebhook(webhook, event).catch((err) => {
        console.error(`[WebhookService] Delivery error for webhook ${webhook.id}: ${(err as Error).message}`);
      });
    }
  }

  /**
   * Retries failed webhook deliveries.
   * Called periodically by the background job.
   */
  async retryFailedDeliveries(): Promise<void> {
    // Find deliveries that failed and are eligible for retry
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT wd.*, w.url, w.secret, w.active
       FROM webhook_deliveries wd
       JOIN webhooks w ON w.id = wd.webhook_id
       WHERE wd.success = false
         AND wd.attempt < $1
         AND w.active = true
       ORDER BY wd.delivered_at ASC
       LIMIT 100`,
      [RETRY_DELAYS.length]
    );

    for (const row of result.rows) {
      const attempt = row.attempt as number;
      const deliveredAt = new Date(row.delivered_at as string);
      const retryDelay = RETRY_DELAYS[attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
      const retryAfter = new Date(deliveredAt.getTime() + retryDelay);

      if (new Date() < retryAfter) continue;

      const payload = row.payload as Record<string, unknown>;
      const url = row.url as string;
      const secret = row.secret as string;
      const webhookId = row.webhook_id as string;

      try {
        const success = await this.sendWebhook(url, secret, payload, row.event_type as string);
        await this.logDelivery(webhookId, row.event_type as string, payload, success ? 200 : 0, attempt + 1, success);
        if (success) {
          await this.pool.query('UPDATE webhooks SET failure_count = 0, last_triggered = now() WHERE id = $1', [webhookId]);
        }
      } catch {
        await this.logDelivery(webhookId, row.event_type as string, payload, 0, attempt + 1, false);
      }
    }
  }

  // ===========================================================================
  // Private — Delivery
  // ===========================================================================

  /**
   * Delivers a single event to a webhook with retry logic.
   */
  private async deliverToWebhook(
    webhook: WebhookRecord,
    event: IndexedEventForDelivery
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      id: `del_${crypto.randomUUID().slice(0, 12)}`,
      event: event.eventName,
      programId: event.programId,
      data: event.data,
      slot: event.slot,
      txSignature: event.txSignature,
      timestamp: new Date().toISOString(),
    };

    const success = await this.sendWebhook(webhook.url, webhook.secret, payload, event.eventName);

    await this.logDelivery(webhook.id, event.eventName, payload, success ? 200 : 0, 1, success);

    if (success) {
      await this.pool.query(
        'UPDATE webhooks SET failure_count = 0, last_triggered = now(), updated_at = now() WHERE id = $1',
        [webhook.id]
      );
    } else {
      await this.pool.query(
        `UPDATE webhooks SET failure_count = failure_count + 1, updated_at = now() WHERE id = $1`,
        [webhook.id]
      );

      // Auto-disable after too many failures
      const updated = await this.pool.query(
        'SELECT failure_count FROM webhooks WHERE id = $1',
        [webhook.id]
      );
      if (updated.rows.length > 0 && (updated.rows[0].failure_count as number) >= MAX_FAILURE_COUNT) {
        await this.pool.query(
          'UPDATE webhooks SET active = false, updated_at = now() WHERE id = $1',
          [webhook.id]
        );
        console.warn(`[WebhookService] Auto-disabled webhook ${webhook.id} after ${MAX_FAILURE_COUNT} failures`);
      }
    }
  }

  /**
   * Sends an HTTP POST to a webhook URL with HMAC signature.
   */
  private async sendWebhook(
    url: string,
    secret: string,
    payload: Record<string, unknown>,
    eventType: string
  ): Promise<boolean> {
    const body = JSON.stringify(payload);
    const signature = this.signPayload(body, secret);
    const deliveryId = crypto.randomUUID();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Uho-Signature': `sha256=${signature}`,
          'X-Uho-Event': eventType,
          'X-Uho-Delivery-Id': deliveryId,
          'X-Uho-Timestamp': String(Math.floor(Date.now() / 1000)),
          'User-Agent': 'Uho-Webhook/1.0',
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Signs a payload with HMAC-SHA256 using the webhook secret.
   */
  private signPayload(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  // ===========================================================================
  // Private — Logging
  // ===========================================================================

  /**
   * Logs a webhook delivery attempt.
   */
  private async logDelivery(
    webhookId: string,
    eventType: string,
    payload: Record<string, unknown>,
    responseStatus: number,
    attempt: number,
    success: boolean
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO webhook_deliveries (webhook_id, event_type, payload, response_status, attempt, success)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [webhookId, eventType, JSON.stringify(payload), responseStatus, attempt, success]
      );
    } catch (err) {
      console.error(`[WebhookService] Failed to log delivery: ${(err as Error).message}`);
    }
  }

  // ===========================================================================
  // Private — Helpers
  // ===========================================================================

  /**
   * Checks if event data matches a webhook's field-level filters.
   */
  private matchesFilters(data: Record<string, unknown>, filters: Record<string, unknown>): boolean {
    if (!filters || Object.keys(filters).length === 0) return true;

    for (const [key, value] of Object.entries(filters)) {
      if (data[key] !== value) return false;
    }
    return true;
  }

  /**
   * Validates a webhook URL.
   * In production, only HTTPS is allowed.
   * In development, HTTP is also permitted for local testing.
   */
  private isValidWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') return true;
      // Allow HTTP only in non-production environments
      if (parsed.protocol === 'http:' && process.env.NODE_ENV !== 'production') return true;
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Maps a database row to a WebhookRecord object.
   */
  private mapWebhookRow(row: Record<string, unknown>): WebhookRecord {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      userProgramId: row.user_program_id as string,
      url: row.url as string,
      secret: row.secret as string,
      events: (row.events ?? []) as string[],
      filters: (typeof row.filters === 'string' ? JSON.parse(row.filters as string) : row.filters ?? {}) as Record<string, unknown>,
      active: row.active as boolean,
      lastTriggered: row.last_triggered ? new Date(row.last_triggered as string) : null,
      failureCount: (row.failure_count ?? 0) as number,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
