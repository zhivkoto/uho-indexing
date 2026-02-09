/**
 * @uho/client — Type Definitions
 *
 * All types used by the Uho SDK for requests, responses, and configuration.
 */

// =============================================================================
// Client Configuration
// =============================================================================

/** Options for creating a UhoClient instance */
export interface UhoClientOptions {
  /** API base URL (e.g., "http://localhost:3001") */
  baseUrl: string;
  /** API key for authentication (recommended) */
  apiKey?: string;
  /** JWT access token (alternative to API key) */
  accessToken?: string;
  /** Custom fetch implementation (defaults to global fetch) */
  fetch?: typeof fetch;
  /** Default timeout in milliseconds (default: 30000) */
  timeout?: number;
}

// =============================================================================
// API Response Types
// =============================================================================

/** Standard error response from the Uho API */
export interface UhoErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** Health check response */
export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  version: string;
}

/** Indexer status for a single program */
export interface ProgramStatus {
  name: string;
  programId: string;
  status: string;
  events: string[];
  eventCounts: Record<string, number>;
  eventsIndexed: number;
  lastSlot: number;
}

/** Full status response */
export interface StatusResponse {
  indexer: {
    status: string;
    version: string;
    currentSlot: number;
    chainHeadSlot?: number;
    lagSlots?: number;
    lagSeconds?: number;
  };
  programs: ProgramStatus[];
}

/** Offset-based pagination info */
export interface OffsetPagination {
  limit: number;
  offset: number;
  total: number;
  next_cursor?: number;
}

/** Cursor-based pagination info */
export interface CursorPagination {
  limit: number;
  next_cursor?: number;
  has_more: boolean;
}

/** Paginated query response */
export interface QueryResponse<T = Record<string, unknown>> {
  data: T[];
  pagination: OffsetPagination | CursorPagination;
}

/** Count response */
export interface CountResponse {
  count: number;
}

// =============================================================================
// Query Parameters
// =============================================================================

/** Parameters for querying event data */
export interface QueryParams {
  /** Results per page (1–1000, default: 50) */
  limit?: number;
  /** Offset for offset-based pagination */
  offset?: number;
  /** Cursor for cursor-based pagination (overrides offset) */
  after_id?: number;
  /** Sort column (default: "slot") */
  order_by?: string;
  /** Sort direction (default: "desc") */
  order?: 'asc' | 'desc';
  /** Filter: block_time >= value (ISO 8601) */
  from?: string;
  /** Filter: block_time <= value (ISO 8601) */
  to?: string;
  /** Filter: slot >= value */
  slotFrom?: number;
  /** Filter: slot <= value */
  slotTo?: number;
  /** Additional field-level filters (exact match and range operators) */
  [key: string]: string | number | boolean | undefined;
}

// =============================================================================
// Schema Types
// =============================================================================

/** Field schema for a single field */
export interface FieldSchema {
  name: string;
  type: string;
  sqlType: string;
  nullable: boolean;
  description: string;
  source: 'metadata' | 'idl';
}

/** Event schema with all fields */
export interface EventSchema {
  program: string;
  event: string;
  type: 'event' | 'instruction';
  fields: FieldSchema[];
}

/** Program schema with all events and instructions */
export interface ProgramSchema {
  program: string;
  programId: string;
  events: Array<{
    name: string;
    originalName: string;
    fields: FieldSchema[];
  }>;
  instructions: Array<{
    name: string;
    originalName: string;
    type: string;
    args: Array<Omit<FieldSchema, 'source'>>;
    accounts: string[];
  }>;
}

// =============================================================================
// View Types
// =============================================================================

/** View aggregate operators */
export interface ViewAggregate {
  $count?: string;
  $sum?: string;
  $avg?: string;
  $min?: string;
  $max?: string;
  $first?: string;
  $last?: string;
}

/** View definition for creating custom views */
export interface ViewDefinition {
  userProgramId: string;
  name: string;
  source: string;
  definition: {
    groupBy: string | string[];
    select: Record<string, string | ViewAggregate>;
    where?: Record<string, unknown>;
  };
  materialized?: boolean;
  refreshIntervalMs?: number;
}

/** View metadata */
export interface ViewInfo {
  id: string;
  name: string;
  userProgramId: string;
  definition: Record<string, unknown>;
  materialized: boolean;
  refreshIntervalMs: number;
  lastRefreshed: string | null;
  status: string;
  error: string | null;
  createdAt: string;
}
