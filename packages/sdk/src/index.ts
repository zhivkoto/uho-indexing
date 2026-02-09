/**
 * @uho/client — Uho TypeScript SDK
 *
 * A thin, typed wrapper around the Uho REST API for querying
 * Solana IDL-driven event data.
 *
 * @example
 * ```ts
 * import { UhoClient } from '@uho/client';
 *
 * const uho = new UhoClient({
 *   baseUrl: 'http://localhost:3001',
 *   apiKey: 'uho_abc123...',
 * });
 *
 * // Query events with filters
 * const { data, pagination } = await uho.query('pump_fun', 'trade_event', {
 *   is_buy: true,
 *   sol_amount_gte: 1_000_000_000,
 *   order_by: 'block_time',
 *   order: 'desc',
 *   limit: 20,
 * });
 *
 * // Get schema
 * const schema = await uho.getSchema('pump_fun', 'trade_event');
 * console.log(schema.fields);
 * ```
 *
 * @packageDocumentation
 */

export { UhoClient } from './client.js';
export { UhoApiError, UhoNetworkError } from './errors.js';
export type {
  UhoClientOptions,
  UhoErrorResponse,
  HealthResponse,
  StatusResponse,
  ProgramStatus,
  QueryResponse,
  QueryParams,
  CountResponse,
  OffsetPagination,
  CursorPagination,
  FieldSchema,
  EventSchema,
  ProgramSchema,
  ViewDefinition,
  ViewAggregate,
  ViewInfo,
} from './types.js';
