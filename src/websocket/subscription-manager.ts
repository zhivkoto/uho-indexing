/**
 * Uho — Subscription Manager
 *
 * Manages WebSocket client connections and their event subscriptions.
 * Handles PG NOTIFY fanout by matching notifications against active subscriptions.
 */

import crypto from 'crypto';
import type WebSocket from 'ws';
import type { WsSubscription, PgNotifyPayload } from '../core/types.js';

// =============================================================================
// Types
// =============================================================================

/** Internal state for a connected WebSocket client */
interface ClientState {
  clientId: string;
  userId: string;
  ws: WebSocket;
  subscriptions: Map<string, WsSubscription>;
}

/** Server → Client message format */
interface WsServerMessage {
  type: 'event' | 'subscribed' | 'unsubscribed' | 'error' | 'pong' | 'authenticated';
  subscriptionId?: string;
  clientId?: string;
  program?: string;
  event?: string;
  data?: Record<string, unknown>;
  slot?: number;
  txSignature?: string;
  timestamp?: string;
  message?: string;
  code?: string;
}

// =============================================================================
// Subscription Manager
// =============================================================================

export class SubscriptionManager {
  /** Map of clientId → client state */
  private clients = new Map<string, ClientState>();

  /** Map of userId → count of connected clients */
  private userClientCount = new Map<string, number>();

  // ===========================================================================
  // Client Lifecycle
  // ===========================================================================

  /**
   * Registers a new authenticated WebSocket client.
   */
  addClient(clientId: string, userId: string, ws: WebSocket): void {
    this.clients.set(clientId, {
      clientId,
      userId,
      ws,
      subscriptions: new Map(),
    });
    this.userClientCount.set(
      userId,
      (this.userClientCount.get(userId) ?? 0) + 1
    );
  }

  /**
   * Removes a disconnected client and cleans up its subscriptions.
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      const count = (this.userClientCount.get(client.userId) ?? 1) - 1;
      if (count <= 0) {
        this.userClientCount.delete(client.userId);
      } else {
        this.userClientCount.set(client.userId, count);
      }
    }
    this.clients.delete(clientId);
  }

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /**
   * Adds a subscription for a client. Returns the subscription ID.
   */
  subscribe(clientId: string, sub: WsSubscription): string {
    const subId = `sub_${crypto.randomUUID().slice(0, 8)}`;
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.set(subId, sub);
    }
    return subId;
  }

  /**
   * Removes a subscription from a client.
   */
  unsubscribe(clientId: string, subId: string): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      return client.subscriptions.delete(subId);
    }
    return false;
  }

  // ===========================================================================
  // Event Broadcasting
  // ===========================================================================

  /**
   * Called when a PG NOTIFY event arrives on the uho_events channel.
   * Matches the event against all connected clients' subscriptions
   * and sends to those that match.
   */
  broadcast(notification: PgNotifyPayload): void {
    for (const [, client] of this.clients) {
      // Only send to users who are subscribers of this program
      if (!notification.subscribers.includes(client.userId)) continue;

      for (const [subId, sub] of client.subscriptions) {
        for (const event of notification.events) {
          if (this.matchesSubscription(event, sub, notification.programId)) {
            const message: WsServerMessage = {
              type: 'event',
              subscriptionId: subId,
              program: notification.programId,
              event: event.eventName,
              data: event.data,
              slot: event.slot,
              txSignature: event.txSignature,
              timestamp: new Date().toISOString(),
            };

            this.sendToClient(client, message);
          }
        }
      }
    }
  }

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Returns the number of active WebSocket connections for a user.
   */
  getUserClientCount(userId: string): number {
    return this.userClientCount.get(userId) ?? 0;
  }

  /**
   * Returns the total number of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  /**
   * Checks if an event matches a subscription's filters.
   */
  private matchesSubscription(
    event: { eventName: string; data: Record<string, unknown> },
    sub: WsSubscription,
    programId: string
  ): boolean {
    // Check program filter
    if (sub.programs?.length && !sub.programs.includes(programId)) return false;

    // Check event name filter
    if (sub.events?.length && !sub.events.includes(event.eventName)) return false;

    // Check field-level filters
    if (sub.filters) {
      for (const [key, value] of Object.entries(sub.filters)) {
        if (event.data[key] !== value) return false;
      }
    }

    return true;
  }

  /**
   * Sends a message to a client's WebSocket connection.
   * Silently handles send errors (client may have disconnected).
   */
  private sendToClient(client: ClientState, message: WsServerMessage): void {
    try {
      if (client.ws.readyState === 1 /* WebSocket.OPEN */) {
        client.ws.send(JSON.stringify(message));
      }
    } catch {
      // Client disconnected — will be cleaned up on close event
    }
  }
}
