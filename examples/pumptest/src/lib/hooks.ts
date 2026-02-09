"use client";

/**
 * React Query hooks for Uho API data fetching.
 * Each hook auto-refreshes every 10 seconds.
 */

import { useQuery } from "@tanstack/react-query";
import { getStatus, getCreateEvents, getTradeEvents, getTokenVolume, getTokenBuys, getTokenSells } from "./api";

const REFETCH_INTERVAL = 10_000; // 10 seconds
const ANALYTICS_REFETCH_INTERVAL = 30_000; // 30 seconds (views are materialized)

/** Fetch indexer status with auto-refresh */
export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: getStatus,
    refetchInterval: REFETCH_INTERVAL,
  });
}

/** Fetch create events (new tokens) with pagination and auto-refresh */
export function useCreateEvents(params: {
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
} = {}) {
  return useQuery({
    queryKey: ["createEvents", params],
    queryFn: () => getCreateEvents(params),
    refetchInterval: REFETCH_INTERVAL,
  });
}

/** Fetch trade events with optional mint filter, pagination, and auto-refresh */
export function useTradeEvents(params: {
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
  mint?: string;
} = {}) {
  return useQuery({
    queryKey: ["tradeEvents", params],
    queryFn: () => getTradeEvents(params),
    refetchInterval: REFETCH_INTERVAL,
  });
}

// =============================================================================
// Custom View Hooks (Uho Custom Views feature)
// =============================================================================

/** Fetch token volume analytics from the token_volume custom view */
export function useTokenVolume(params: {
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
} = {}) {
  return useQuery({
    queryKey: ["tokenVolume", params],
    queryFn: () => getTokenVolume(params),
    refetchInterval: ANALYTICS_REFETCH_INTERVAL,
  });
}

/** Fetch token buy analytics from the token_buys custom view */
export function useTokenBuys(params: {
  limit?: number;
  offset?: number;
} = {}) {
  return useQuery({
    queryKey: ["tokenBuys", params],
    queryFn: () => getTokenBuys(params),
    refetchInterval: ANALYTICS_REFETCH_INTERVAL,
  });
}

/** Fetch token sell analytics from the token_sells custom view */
export function useTokenSells(params: {
  limit?: number;
  offset?: number;
} = {}) {
  return useQuery({
    queryKey: ["tokenSells", params],
    queryFn: () => getTokenSells(params),
    refetchInterval: ANALYTICS_REFETCH_INTERVAL,
  });
}
