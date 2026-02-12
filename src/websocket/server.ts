/**
 * Uho — WebSocket Server
 *
 * Fastify-based WebSocket server using @fastify/websocket.
 * Handles authentication (JWT or API key), subscription management,
 * and PG LISTEN → client fanout.
 */

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import type pg from 'pg';
import type WebSocket from 'ws';
import crypto from 'crypto';
import type { PlatformConfig } from '../core/platform-config.js';
import type { AuthPayload, WsSubscription, PgNotifyPayload } from '../core/types.js';
import { verifyAccessToken } from '../auth/jwt.js';
import { hashApiKey, isValidApiKeyFormat } from '../auth/api-keys.js';
import { SubscriptionManager } from './subscription-manager.js';
import { WebhookService, type IndexedEventForDelivery } from '../services/webhook-service.js';
import { FREE_TIER_LIMITS } from '../core/platform-config.js';

// =============================================================================
// Types
// =============================================================================

/** Client → Server WebSocket message */
interface WsClientMessage {
  action: 'subscribe' | 'unsubscribe' | 'ping' | 'auth';
  id?: string;
  programs?: string[];
  events?: string[];
  filters?: Record<string, unknown>;
  token?: string;
  apiKey?: string;
}

// =============================================================================
// WebSocket Server Factory
// =============================================================================

/**
 * Creates and configures the Fastify WebSocket server for platform mode.
 * Includes PG LISTEN for real-time event fanout and webhook delivery.
 */
export async function createWsServer(
  pool: pg.Pool,
  config: PlatformConfig
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        config.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            }
          : undefined,
    },
  });

  await app.register(websocket);

  // ---------------------------------------------------------------------------
  // Subscription Manager
  // ---------------------------------------------------------------------------
  const subscriptionManager = new SubscriptionManager();

  // ---------------------------------------------------------------------------
  // PG LISTEN for Events → WebSocket + Webhook Fanout
  // ---------------------------------------------------------------------------
  const webhookService = new WebhookService(pool);

  const pgListenerClient = await connectWithRetry(pool, 5, 2000);
  await pgListenerClient.query('LISTEN uho_events');

  pgListenerClient.on('notification', async (msg) => {
    if (msg.channel !== 'uho_events' || !msg.payload) return;

    try {
      const notification = JSON.parse(msg.payload) as PgNotifyPayload;

      // Fan out to WebSocket clients
      subscriptionManager.broadcast(notification);

      // Fan out to webhooks
      for (const eventData of notification.events) {
        const deliveryEvent: IndexedEventForDelivery = {
          programId: notification.programId,
          eventName: eventData.eventName,
          slot: eventData.slot,
          txSignature: eventData.txSignature,
          data: eventData.data,
          subscribers: notification.subscribers,
        };
        webhookService.deliverEvent(deliveryEvent).catch((err) => {
          console.error(`[WS] Webhook delivery error: ${(err as Error).message}`);
        });
      }
    } catch (err) {
      console.error(`[WS] Error processing PG notification: ${(err as Error).message}`);
    }
  });

  pgListenerClient.on('error', (err) => {
    console.error(`[WS] PG listener error: ${err.message}`);
  });

  // ---------------------------------------------------------------------------
  // Health endpoint
  // ---------------------------------------------------------------------------
  app.get('/health', async () => ({
    status: 'ok',
    clients: subscriptionManager.getClientCount(),
    timestamp: new Date().toISOString(),
  }));

  // ---------------------------------------------------------------------------
  // WebSocket endpoint
  // ---------------------------------------------------------------------------
  app.get('/ws', { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    handleWsConnection(socket, request, pool, config, subscriptionManager);
  });

  // Cleanup on server close
  app.addHook('onClose', async () => {
    try {
      await pgListenerClient.query('UNLISTEN uho_events');
      pgListenerClient.release();
    } catch {
      // Ignore
    }
  });

  return app;
}

// =============================================================================
// Connection Handler
// =============================================================================

/**
 * Handles a new WebSocket connection.
 * Supports auth via query params (token/apiKey) or first message.
 */
function handleWsConnection(
  socket: WebSocket,
  request: FastifyRequest,
  pool: pg.Pool,
  config: PlatformConfig,
  manager: SubscriptionManager
): void {
  const query = request.query as Record<string, string | undefined>;
  let auth: AuthPayload | null = null;

  // Try query param auth
  if (query.token) {
    try {
      auth = verifyAccessToken(query.token, config.jwtSecret);
    } catch {
      // Invalid token
    }
  }

  if (!auth && query.apiKey && isValidApiKeyFormat(query.apiKey)) {
    // API key auth is async — handle inline
    validateApiKey(pool, query.apiKey).then((result) => {
      if (result) {
        setupAuthenticatedConnection(socket, result, manager);
      } else {
        sendMessage(socket, { type: 'error', message: 'Invalid API key' });
        socket.close(4001, 'Authentication failed');
      }
    }).catch(() => {
      socket.close(4001, 'Authentication error');
    });
    return;
  }

  if (auth) {
    setupAuthenticatedConnection(socket, auth, manager);
    return;
  }

  // No query auth — wait for first message
  const timeout = setTimeout(() => {
    sendMessage(socket, { type: 'error', message: 'Authentication timeout' });
    socket.close(4001, 'Authentication timeout');
  }, 10_000);

  const onFirstMessage = async (data: Buffer | ArrayBuffer | Buffer[]) => {
    clearTimeout(timeout);
    socket.removeListener('message', onFirstMessage);

    try {
      const msg = JSON.parse(data.toString()) as WsClientMessage;
      if (msg.action === 'auth') {
        let authResult: AuthPayload | null = null;

        if (msg.token) {
          try {
            authResult = verifyAccessToken(msg.token, config.jwtSecret);
          } catch {
            // Invalid
          }
        } else if (msg.apiKey && isValidApiKeyFormat(msg.apiKey)) {
          authResult = await validateApiKey(pool, msg.apiKey);
        }

        if (authResult) {
          setupAuthenticatedConnection(socket, authResult, manager);
          return;
        }
      }
    } catch {
      // Parse error
    }

    sendMessage(socket, { type: 'error', message: 'Invalid credentials' });
    socket.close(4001, 'Authentication failed');
  };

  socket.on('message', onFirstMessage);
}

/**
 * Sets up a fully authenticated WebSocket connection.
 * Handles subscriptions, pings, and cleanup.
 */
function setupAuthenticatedConnection(
  socket: WebSocket,
  auth: AuthPayload,
  manager: SubscriptionManager
): void {
  const clientId = crypto.randomUUID();

  // Check concurrent connection limit
  if (manager.getUserClientCount(auth.userId) >= FREE_TIER_LIMITS.wsConnections) {
    sendMessage(socket, { type: 'error', message: 'Connection limit reached' });
    socket.close(4002, 'Too many connections');
    return;
  }

  manager.addClient(clientId, auth.userId, socket);
  sendMessage(socket, { type: 'authenticated', clientId });

  // Handle messages
  socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      const msg = JSON.parse(data.toString()) as WsClientMessage;
      handleClientMessage(clientId, msg, manager, socket);
    } catch {
      sendMessage(socket, { type: 'error', message: 'Invalid message format' });
    }
  });

  // Cleanup on disconnect
  socket.on('close', () => {
    manager.removeClient(clientId);
    clearInterval(pingInterval);
  });

  socket.on('error', () => {
    manager.removeClient(clientId);
    clearInterval(pingInterval);
  });

  // Heartbeat: ping every 30s
  const pingInterval = setInterval(() => {
    if (socket.readyState === 1 /* OPEN */) {
      socket.ping();
    }
  }, 30_000);
}

// =============================================================================
// Message Handler
// =============================================================================

/**
 * Handles an incoming message from an authenticated client.
 */
function handleClientMessage(
  clientId: string,
  msg: WsClientMessage,
  manager: SubscriptionManager,
  socket: WebSocket
): void {
  switch (msg.action) {
    case 'subscribe': {
      const sub: WsSubscription = {
        programs: msg.programs,
        events: msg.events,
        filters: msg.filters,
      };
      const subId = manager.subscribe(clientId, sub);
      sendMessage(socket, { type: 'subscribed', subscriptionId: subId });
      break;
    }

    case 'unsubscribe': {
      if (msg.id) {
        const removed = manager.unsubscribe(clientId, msg.id);
        if (removed) {
          sendMessage(socket, { type: 'unsubscribed', subscriptionId: msg.id });
        } else {
          sendMessage(socket, { type: 'error', message: 'Subscription not found' });
        }
      } else {
        sendMessage(socket, { type: 'error', message: 'Subscription id required' });
      }
      break;
    }

    case 'ping': {
      sendMessage(socket, { type: 'pong', timestamp: new Date().toISOString() });
      break;
    }

    default: {
      sendMessage(socket, { type: 'error', message: `Unknown action: ${msg.action}` });
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Validates an API key against the database and returns user info.
 */
async function validateApiKey(pool: pg.Pool, key: string): Promise<AuthPayload | null> {
  const hash = hashApiKey(key);
  const result = await pool.query<{ user_id: string; email: string; schema_name: string }>(
    `SELECT ak.user_id, u.email, u.schema_name
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.key_hash = $1 AND ak.revoked = false`,
    [hash]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    userId: row.user_id,
    email: row.email,
    schemaName: row.schema_name,
  };
}

/**
 * Connects to PG with retry + exponential backoff.
 */
async function connectWithRetry(
  pool: pg.Pool,
  maxRetries: number,
  baseDelayMs: number
): Promise<pg.PoolClient> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await pool.connect();
    } catch (err) {
      console.warn(
        `[WS] PG connect attempt ${attempt}/${maxRetries} failed: ${(err as Error).message}`
      );
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
    }
  }
  throw new Error('Unreachable');
}

/**
 * Sends a JSON message to a WebSocket client.
 */
function sendMessage(socket: WebSocket, message: Record<string, unknown>): void {
  try {
    if (socket.readyState === 1 /* OPEN */) {
      socket.send(JSON.stringify(message));
    }
  } catch {
    // Ignore send errors
  }
}
