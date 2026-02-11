// ─── Existing API Response Types ──────────────────────────────

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface ProgramStatus {
  name: string;
  programId: string;
  events: string[];
  eventCounts?: Record<string, number>;
  lastSlot?: number;
  status?: string;
  eventsIndexed?: number;
  lastPollAt?: string | null;
  error?: string | null;
}

export interface IndexerStatus {
  status: string;
  currentSlot?: number;
  startSlot?: number;
  rpcEndpoint?: string;
  pollingInterval?: number;
  batchSize?: number;
  commitment?: string;
  version?: string;
}

export interface ChainInfo {
  name: string;
  network?: string;
}

export interface StatusResponse {
  indexer: IndexerStatus;
  chain: ChainInfo;
  programs: ProgramStatus[];
}

export interface PaginationInfo {
  limit: number;
  offset: number;
  total: number;
  hasMore?: boolean;
}

export interface EventListResponse {
  data: Record<string, unknown>[];
  pagination: PaginationInfo;
}

export interface EventCountResponse {
  count: number;
}

export interface EventQueryParams {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
  from?: string;
  to?: string;
  slotFrom?: number;
  slotTo?: number;
  [key: string]: string | number | undefined;
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: string;
}

// ─── Platform Auth Types ──────────────────────────────────────

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  email: string;
  verified: boolean;
  displayName?: string | null;
  createdAt: string;
}

// ─── User / Profile Types ─────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  verified: boolean;
  createdAt: string;
  usage: {
    programs: number;
    programLimit: number;
    eventsIndexed: number;
    eventLimit: number;
    apiCalls: number;
    apiCallLimit: number;
  };
}

export interface ApiKeyInfo {
  id: string;
  keyPrefix: string;
  label: string;
  lastUsed: string | null;
  createdAt: string;
}

export interface ApiKeyCreated {
  id: string;
  key: string;
  keyPrefix: string;
  label: string;
  createdAt: string;
}

// ─── Program Types ────────────────────────────────────────────

export type ProgramStatusValue = 'provisioning' | 'running' | 'paused' | 'error' | 'archived';

export interface ProgramEventInfo {
  name: string;
  type: 'event' | 'instruction';
  enabled: boolean;
  count?: number;
  fieldConfig?: object;
}

export interface ProgramInfo {
  id: string;
  programId: string;
  name: string;
  chain: string;
  status: ProgramStatusValue;
  events: ProgramEventInfo[];
  eventsIndexed?: number;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BackfillStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentSlot: number | null;
  startSlot: number | null;
  endSlot: number | null;
  eventsFound: number;
  eventsSkipped: number;
  error: string | null;
  demoLimitation: { maxSlots: number; message: string } | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ProgramDetail extends ProgramInfo {
  idl: object;
  state: {
    lastSlot: number;
    eventsIndexed: number;
    lastPollAt: string | null;
    error: string | null;
  };
  backfill: BackfillStatus | null;
}

export interface DiscoveryResult {
  found: boolean;
  source: 'anchor-onchain' | 'solscan' | 'manual-required';
  idl?: object;
  events?: Array<{
    name: string;
    type: string;
    fields: Array<{ name: string; type: string }>;
  }>;
  message?: string;
}

// ─── View Types ───────────────────────────────────────────────

export interface ViewInfo {
  id: string;
  name: string;
  programId: string;
  programName: string;
  definition: ViewDefinition;
  materialized: boolean;
  refreshIntervalMs: number;
  lastRefreshed: string | null;
  status: 'pending' | 'active' | 'error' | 'disabled';
  error?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ViewDefinition {
  source: string;
  groupBy: string | string[];
  select: Record<string, unknown>;
  where?: Record<string, unknown>;
}

// ─── Webhook Types ────────────────────────────────────────────

export interface WebhookInfo {
  id: string;
  userProgramId: string;
  url: string;
  events: string[];
  filters: Record<string, unknown>;
  active: boolean;
  lastTriggered: string | null;
  failureCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface WebhookCreated extends WebhookInfo {
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: string | null;
  attempt: number;
  success: boolean;
  deliveredAt: string;
}
