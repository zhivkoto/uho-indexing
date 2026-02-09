/**
 * Types for Uho API responses.
 * These match the event schemas indexed by Uho from the pump.fun program IDL.
 */

/** A token creation event from the pump.fun program */
export interface CreateEvent {
  id: string;
  slot: string;
  block_time: string;
  tx_signature: string;
  name: string;
  symbol: string;
  uri: string;
  mint: string;
  bonding_curve: string;
  user: string;
  indexed_at: string;
}

/** A trade event from the pump.fun program */
export interface TradeEvent {
  id: string;
  slot: string;
  block_time: string;
  tx_signature: string;
  mint: string;
  sol_amount: string;
  token_amount: string;
  is_buy: boolean;
  user: string;
  timestamp: string;
  virtual_sol_reserves: string;
  virtual_token_reserves: string;
  real_sol_reserves: string;
  real_token_reserves: string;
  indexed_at: string;
}

/** Pagination metadata returned by Uho */
export interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

/** Standard Uho paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

/** Token volume analytics from a custom Uho view (token_volume) */
export interface TokenVolumeRow {
  mint: string;
  total_trades: string;
  total_sol_volume: string;
  avg_sol_per_trade: string;
  first_trade_slot: string;
  last_trade_slot: string;
}

/** Token buy analytics from a custom Uho view (token_buys) */
export interface TokenBuysRow {
  mint: string;
  buy_count: string;
  buy_sol_volume: string;
}

/** Token sell analytics from a custom Uho view (token_sells) */
export interface TokenSellsRow {
  mint: string;
  sell_count: string;
  sell_sol_volume: string;
}

/** Uho indexer status */
export interface IndexerStatus {
  status: string;
  programs?: Array<{
    name: string;
    programId: string;
    events: string[];
  }>;
  [key: string]: unknown;
}
