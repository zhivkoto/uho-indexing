'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getAccessToken } from '@/lib/auth';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3012';

// ─── Types ────────────────────────────────────────────────────

export interface WsSubscription {
  programs?: string[];
  events?: string[];
  filters?: Record<string, unknown>;
}

export interface WsEvent {
  type: 'event';
  subscriptionId: string;
  program: string;
  event: string;
  data: Record<string, unknown>;
  slot: number;
  txSignature: string;
  timestamp: string;
}

export interface WsError {
  type: 'error';
  message: string;
  code?: string;
}

type WsMessage = WsEvent | WsError | { type: 'authenticated'; clientId: string } | { type: 'subscribed'; subscriptionId: string } | { type: 'unsubscribed'; subscriptionId: string } | { type: 'pong'; timestamp: string };

interface UseWebSocketOptions {
  /** Auto-connect on mount. Default: true */
  autoConnect?: boolean;
  /** Max reconnect attempts. Default: 10 */
  maxReconnectAttempts?: number;
  /** Base reconnect delay in ms. Default: 1000 */
  reconnectBaseDelay?: number;
  /** Max events to buffer in memory. Default: 100 */
  maxBufferSize?: number;
  /** Use API key instead of JWT. */
  apiKey?: string;
}

interface UseWebSocketReturn {
  /** Current connection status */
  status: 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'reconnecting';
  /** Recent events received */
  events: WsEvent[];
  /** Last error if any */
  error: string | null;
  /** Subscribe to events. Returns subscription ID */
  subscribe: (sub: WsSubscription) => string | null;
  /** Unsubscribe by subscription ID */
  unsubscribe: (subId: string) => void;
  /** Manually connect */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
  /** Clear event buffer */
  clearEvents: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    maxReconnectAttempts = 10,
    reconnectBaseDelay = 1000,
    maxBufferSize = 100,
    apiKey,
  } = options;

  const [status, setStatus] = useState<UseWebSocketReturn['status']>('disconnected');
  const [events, setEvents] = useState<WsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingSubscriptionsRef = useRef<Map<string, WsSubscription>>(new Map());
  const activeSubscriptionsRef = useRef<Set<string>>(new Set());
  const intentionalCloseRef = useRef(false);

  const addEvent = useCallback((evt: WsEvent) => {
    setEvents((prev) => {
      const next = [evt, ...prev];
      return next.length > maxBufferSize ? next.slice(0, maxBufferSize) : next;
    });
  }, [maxBufferSize]);

  const handleMessage = useCallback((data: string) => {
    try {
      const msg: WsMessage = JSON.parse(data);

      switch (msg.type) {
        case 'authenticated':
          setStatus('connected');
          setError(null);
          reconnectAttemptRef.current = 0;
          // Re-subscribe any pending subscriptions
          for (const [tempId, sub] of pendingSubscriptionsRef.current) {
            const ws = wsRef.current;
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ action: 'subscribe', ...sub }));
            }
          }
          break;

        case 'subscribed':
          if (msg.subscriptionId) {
            activeSubscriptionsRef.current.add(msg.subscriptionId);
          }
          break;

        case 'unsubscribed':
          if (msg.subscriptionId) {
            activeSubscriptionsRef.current.delete(msg.subscriptionId);
          }
          break;

        case 'event':
          addEvent(msg as WsEvent);
          break;

        case 'error':
          setError((msg as WsError).message);
          break;

        case 'pong':
          // Heartbeat response — connection is alive
          break;
      }
    } catch {
      // Ignore unparseable messages
    }
  }, [addEvent]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    intentionalCloseRef.current = false;
    setStatus('connecting');
    setError(null);

    // Build connection URL with auth
    const token = apiKey || getAccessToken();
    const authParam = apiKey ? `apiKey=${apiKey}` : token ? `token=${token}` : '';
    const url = authParam ? `${WS_URL}/ws?${authParam}` : `${WS_URL}/ws`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('authenticating');
        // If no auth param was sent, send auth message
        if (!authParam && token) {
          ws.send(JSON.stringify({ action: 'auth', token }));
        }
      };

      ws.onmessage = (event) => {
        handleMessage(event.data);
      };

      ws.onclose = (event) => {
        wsRef.current = null;

        if (intentionalCloseRef.current) {
          setStatus('disconnected');
          return;
        }

        // Auth failure — don't reconnect
        if (event.code === 4001) {
          setStatus('disconnected');
          setError('Authentication failed');
          return;
        }

        // Connection limit
        if (event.code === 4002) {
          setStatus('disconnected');
          setError('Connection limit reached');
          return;
        }

        // Auto-reconnect with exponential backoff
        if (reconnectAttemptRef.current < maxReconnectAttempts) {
          setStatus('reconnecting');
          const delay = Math.min(
            reconnectBaseDelay * Math.pow(2, reconnectAttemptRef.current),
            30000
          );
          reconnectAttemptRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setStatus('disconnected');
          setError('Max reconnection attempts reached');
        }
      };

      ws.onerror = () => {
        // Error events are followed by close events, so we handle there
      };
    } catch (err) {
      setStatus('disconnected');
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [apiKey, handleMessage, maxReconnectAttempts, reconnectBaseDelay]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    setStatus('disconnected');
    activeSubscriptionsRef.current.clear();
    pendingSubscriptionsRef.current.clear();
  }, []);

  const subscribe = useCallback((sub: WsSubscription): string | null => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Queue for when connected
      const tempId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      pendingSubscriptionsRef.current.set(tempId, sub);
      return tempId;
    }

    ws.send(JSON.stringify({ action: 'subscribe', ...sub }));
    // The actual subscription ID comes back async via the 'subscribed' message
    // Return a temp ID that callers can use to track
    const tempId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return tempId;
  }, []);

  const unsubscribe = useCallback((subId: string) => {
    // Remove from pending if it's there
    pendingSubscriptionsRef.current.delete(subId);

    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'unsubscribe', id: subId }));
    }
    activeSubscriptionsRef.current.delete(subId);
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  // Ping/keepalive every 25s
  useEffect(() => {
    if (status !== 'connected') return;

    const interval = setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'ping' }));
      }
    }, 25000);

    return () => clearInterval(interval);
  }, [status]);

  return {
    status,
    events,
    error,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
    clearEvents,
  };
}
