/**
 * Uho API client.
 *
 * All data flows through the Uho REST API using an API key.
 * No direct database access — this is how real integrations work.
 */

import type {
  CreateEvent,
  TradeEvent,
  PaginatedResponse,
  IndexerStatus,
  TokenVolumeRow,
  TokenBuysRow,
  TokenSellsRow,
} from "./types";

// Configuration from environment variables
const API_URL =
  process.env.NEXT_PUBLIC_UHO_API_URL || "http://localhost:3001";
const API_KEY =
  process.env.NEXT_PUBLIC_UHO_API_KEY || "";

/**
 * Make an authenticated request to the Uho API.
 */
async function uhoFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_URL}${path}`);

  // Append query parameters
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    });
  }

  const res = await fetch(url.toString(), {
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Uho API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Get the indexer status (health, registered programs, event counts).
 */
export async function getStatus(): Promise<IndexerStatus> {
  return uhoFetch<IndexerStatus>("/api/v1/status");
}

/**
 * Fetch recently created tokens (CreateEvent).
 */
export async function getCreateEvents(params: {
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
} = {}): Promise<PaginatedResponse<CreateEvent>> {
  return uhoFetch<PaginatedResponse<CreateEvent>>(
    "/api/v1/data/pump/CreateEvent",
    {
      limit: String(params.limit ?? 50),
      offset: String(params.offset ?? 0),
      order: params.order ?? "desc",
    }
  );
}

/**
 * Fetch trade events (TradeEvent).
 * Optionally filter by mint address.
 */
export async function getTradeEvents(params: {
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
  mint?: string;
} = {}): Promise<PaginatedResponse<TradeEvent>> {
  const queryParams: Record<string, string> = {
    limit: String(params.limit ?? 50),
    offset: String(params.offset ?? 0),
    order: params.order ?? "desc",
  };

  // Add mint filter if provided
  if (params.mint) {
    queryParams.mint = params.mint;
  }

  return uhoFetch<PaginatedResponse<TradeEvent>>(
    "/api/v1/data/pump/TradeEvent",
    queryParams
  );
}

// =============================================================================
// Custom View Queries (Uho Custom Views feature)
// =============================================================================

/**
 * Query the token_volume custom view — per-token trade aggregates.
 */
export async function getTokenVolume(params: {
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
} = {}): Promise<PaginatedResponse<TokenVolumeRow>> {
  return uhoFetch<PaginatedResponse<TokenVolumeRow>>(
    "/api/v1/data/pump/views/token_volume",
    {
      limit: String(params.limit ?? 50),
      offset: String(params.offset ?? 0),
      order: params.order ?? "desc",
    }
  );
}

/**
 * Query the token_buys custom view — per-token buy aggregates.
 */
export async function getTokenBuys(params: {
  limit?: number;
  offset?: number;
} = {}): Promise<PaginatedResponse<TokenBuysRow>> {
  return uhoFetch<PaginatedResponse<TokenBuysRow>>(
    "/api/v1/data/pump/views/token_buys",
    {
      limit: String(params.limit ?? 1000),
      offset: String(params.offset ?? 0),
    }
  );
}

/**
 * Query the token_sells custom view — per-token sell aggregates.
 */
export async function getTokenSells(params: {
  limit?: number;
  offset?: number;
} = {}): Promise<PaginatedResponse<TokenSellsRow>> {
  return uhoFetch<PaginatedResponse<TokenSellsRow>>(
    "/api/v1/data/pump/views/token_sells",
    {
      limit: String(params.limit ?? 1000),
      offset: String(params.offset ?? 0),
    }
  );
}
