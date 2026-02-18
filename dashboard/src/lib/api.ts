/**
 * API client — F2
 * Authenticated fetch with auto-refresh on 401.
 */

import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  refreshAccessToken,
} from './auth';
import type {
  HealthResponse,
  StatusResponse,
  EventListResponse,
  EventCountResponse,
  EventQueryParams,
  UserProfile,
  ApiKeyInfo,
  ApiKeyCreated,
  ProgramInfo,
  ProgramDetail,
  DiscoveryResult,
  ViewInfo,
  WebhookInfo,
  WebhookCreated,
  LoginResponse,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

// ─── Error class ──────────────────────────────────────────────
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Core fetch with auth + auto-refresh ──────────────────────
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> | undefined),
  };
  // Only set Content-Type for requests with a body to avoid Fastify parse errors
  if (options?.body) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    try {
      const newToken = await refreshAccessToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    } catch {
      clearAccessToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new ApiError(
      res.status,
      body.error?.code,
      body.error?.message || res.statusText,
    );
  }

  return res.json();
}

/** Fetch without auth (for public endpoints) */
async function fetchPublic<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> | undefined),
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new ApiError(
      res.status,
      body.error?.code,
      body.error?.message || res.statusText,
    );
  }

  return res.json();
}

// ─── Health / Status ──────────────────────────────────────────
export async function getHealth(): Promise<HealthResponse> {
  return fetchPublic<HealthResponse>('/api/v1/health');
}

export async function getStatus(): Promise<StatusResponse> {
  return fetchApi<StatusResponse>('/api/v1/status');
}

// ─── Auth ─────────────────────────────────────────────────────
export async function register(
  email: string,
  password: string,
): Promise<{ message: string; userId: string }> {
  return fetchPublic('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const data = await fetchPublic<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function verifyEmail(
  email: string,
  code: string,
): Promise<LoginResponse> {
  const data = await fetchPublic<LoginResponse>('/api/v1/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function forgotPassword(
  email: string,
): Promise<{ message: string }> {
  return fetchPublic('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<{ message: string }> {
  return fetchPublic('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

// ─── User ─────────────────────────────────────────────────────
export async function getMe(): Promise<UserProfile> {
  return fetchApi<UserProfile>('/api/v1/user/me');
}

export async function updateMe(
  data: { displayName?: string; currentPassword?: string; newPassword?: string },
): Promise<UserProfile> {
  return fetchApi<UserProfile>('/api/v1/user/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getApiKeys(): Promise<{ data: ApiKeyInfo[] }> {
  return fetchApi('/api/v1/user/api-keys');
}

export async function createApiKey(
  label?: string,
): Promise<ApiKeyCreated> {
  return fetchApi('/api/v1/user/api-keys', {
    method: 'POST',
    body: JSON.stringify({ label }),
  });
}

export async function revokeApiKey(id: string): Promise<void> {
  await fetchApi(`/api/v1/user/api-keys/${id}`, { method: 'DELETE' });
}

export async function revealApiKey(id: string): Promise<{ key: string }> {
  return fetchApi(`/api/v1/user/api-keys/${id}/reveal`);
}

// ─── Programs ─────────────────────────────────────────────────
export async function getPrograms(): Promise<{ data: ProgramInfo[] }> {
  return fetchApi('/api/v1/programs');
}

export async function createProgram(input: {
  programId: string;
  name?: string;
  idl: object;
  chain?: string;
  events?: Array<{ name: string; type: 'event' | 'instruction'; enabled: boolean }>;
  config?: { pollIntervalMs?: number; batchSize?: number; startSlot?: number };
  includeHistoricalData?: boolean;
  startFromSlot?: number;
}): Promise<ProgramInfo> {
  return fetchApi('/api/v1/programs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getProgram(id: string): Promise<ProgramDetail> {
  return fetchApi(`/api/v1/programs/${id}`);
}

export async function updateProgram(
  id: string,
  updates: {
    name?: string;
    events?: Array<{ name: string; type: string; enabled: boolean; fieldConfig?: object }>;
    config?: {
      pollIntervalMs?: number;
      batchSize?: number;
      cpi_transfers_enabled?: boolean;
      balance_deltas_enabled?: boolean;
    };
  },
): Promise<ProgramInfo> {
  return fetchApi(`/api/v1/programs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function archiveProgram(id: string): Promise<void> {
  await fetchApi(`/api/v1/programs/${id}`, { method: 'DELETE' });
}

export async function pauseProgram(id: string): Promise<void> {
  await fetchApi(`/api/v1/programs/${id}/pause`, { method: 'POST', body: '{}' });
}

export async function resumeProgram(id: string): Promise<void> {
  await fetchApi(`/api/v1/programs/${id}/resume`, { method: 'POST', body: '{}' });
}

export async function retryBackfill(programId: string): Promise<void> {
  await fetchApi(`/api/v1/programs/${programId}`, {
    method: 'PATCH',
    body: JSON.stringify({ retryBackfill: true }),
  });
}

export async function cancelBackfill(programId: string): Promise<void> {
  await fetchApi(`/api/v1/programs/${programId}`, {
    method: 'PATCH',
    body: JSON.stringify({ cancelBackfill: true }),
  });
}

export async function discoverIdl(
  programId: string,
): Promise<DiscoveryResult> {
  return fetchApi('/api/v1/programs/discover-idl', {
    method: 'POST',
    body: JSON.stringify({ programId }),
  });
}

// ─── Data (event queries) ─────────────────────────────────────
export async function getEvents(
  program: string,
  event: string,
  params?: EventQueryParams,
): Promise<EventListResponse> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value));
      }
    });
  }

  // Use /data/all endpoint when program or event is empty (All Programs / All Events)
  if (!program || !event) {
    if (program) searchParams.set('program', program);
    if (event) searchParams.set('event', event);
    const qs = searchParams.toString();
    return fetchApi(`/api/v1/data/all${qs ? `?${qs}` : ''}`);
  }

  const qs = searchParams.toString();
  return fetchApi(`/api/v1/data/${program}/${event}${qs ? `?${qs}` : ''}`);
}

export async function getEventCount(
  program: string,
  event: string,
): Promise<EventCountResponse> {
  return fetchApi(`/api/v1/data/${program}/${event}/count`);
}

export async function getEventByTx(
  program: string,
  event: string,
  txSignature: string,
): Promise<{ data: Record<string, unknown>[] }> {
  return fetchApi(`/api/v1/data/${program}/${event}/${txSignature}`);
}

export async function getTxLogs(
  txSignature: string,
): Promise<{ data: { tx_signature: string; slot: number; log_messages: string[]; indexed_at: string } | null }> {
  return fetchApi(`/api/v1/tx-logs/${txSignature}`);
}

// ─── Views ────────────────────────────────────────────────────
export async function getViews(): Promise<{ data: ViewInfo[] }> {
  return fetchApi('/api/v1/views');
}

export async function createView(input: {
  userProgramId: string;
  name: string;
  source: string;
  definition: {
    groupBy: string | string[];
    select: Record<string, unknown>;
    where?: Record<string, unknown>;
  };
  materialized?: boolean;
  refreshIntervalMs?: number;
}): Promise<ViewInfo> {
  return fetchApi('/api/v1/views', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteView(id: string): Promise<void> {
  await fetchApi(`/api/v1/views/${id}`, { method: 'DELETE' });
}

export async function queryView(
  program: string,
  viewName: string,
  params?: EventQueryParams,
): Promise<EventListResponse> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value));
      }
    });
  }
  const qs = searchParams.toString();
  return fetchApi(`/api/v1/data/${program}/views/${viewName}${qs ? `?${qs}` : ''}`);
}

// ─── Webhooks ─────────────────────────────────────────────────
export async function getWebhooks(): Promise<{ data: WebhookInfo[] }> {
  return fetchApi('/api/v1/webhooks');
}

export async function createWebhook(input: {
  userProgramId: string;
  url: string;
  events?: string[];
  filters?: Record<string, unknown>;
}): Promise<WebhookCreated> {
  return fetchApi('/api/v1/webhooks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateWebhook(
  id: string,
  updates: {
    url?: string;
    events?: string[];
    filters?: Record<string, unknown>;
    active?: boolean;
  },
): Promise<WebhookInfo> {
  return fetchApi(`/api/v1/webhooks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteWebhook(id: string): Promise<void> {
  await fetchApi(`/api/v1/webhooks/${id}`, { method: 'DELETE' });
}

// ─── Metrics ──────────────────────────────────────────────────────────
export interface ThroughputResponse {
  data: Array<{ time: string; value: number }>;
  bucketMinutes: number;
}

export async function getThroughput(hours: number = 24, programId?: string): Promise<ThroughputResponse> {
  const params = new URLSearchParams({ hours: String(hours) });
  if (programId) params.set('programId', programId);
  return fetchApi<ThroughputResponse>(`/api/v1/metrics/throughput?${params}`);
}
