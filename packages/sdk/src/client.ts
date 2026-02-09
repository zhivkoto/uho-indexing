/**
 * @uho/client — UhoClient
 *
 * Thin, typed wrapper around the Uho REST API.
 * Works in Node.js 18+, Bun, Deno, and modern browsers with native fetch.
 */

import type {
  UhoClientOptions,
  UhoErrorResponse,
  HealthResponse,
  StatusResponse,
  QueryResponse,
  QueryParams,
  CountResponse,
  EventSchema,
  ProgramSchema,
  ViewDefinition,
  ViewInfo,
} from './types.js';
import { UhoApiError, UhoNetworkError } from './errors.js';

/**
 * Uho API client.
 *
 * @example
 * ```ts
 * const uho = new UhoClient({
 *   baseUrl: 'http://localhost:3001',
 *   apiKey: 'uho_abc123...',
 * });
 *
 * const { data } = await uho.query('pump_fun', 'trade_event', {
 *   limit: 20,
 *   order_by: 'block_time',
 *   order: 'desc',
 *   is_buy: true,
 * });
 * ```
 */
export class UhoClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly accessToken?: string;
  private readonly _fetch: typeof fetch;
  private readonly timeout: number;

  constructor(options: UhoClientOptions) {
    // Remove trailing slash
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.accessToken = options.accessToken;
    this._fetch = options.fetch ?? globalThis.fetch;
    this.timeout = options.timeout ?? 30_000;

    if (!this._fetch) {
      throw new Error('fetch is not available. Pass a fetch implementation via options.fetch.');
    }
  }

  // ===========================================================================
  // Core HTTP
  // ===========================================================================

  /**
   * Makes an authenticated request to the Uho API.
   */
  private async request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; params?: Record<string, string | number | boolean | undefined> }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    // Add query parameters
    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    } else if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this._fetch(url.toString(), {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        let errorBody: UhoErrorResponse;
        try {
          errorBody = await response.json() as UhoErrorResponse;
        } catch {
          errorBody = {
            error: {
              code: 'UNKNOWN_ERROR',
              message: `HTTP ${response.status}: ${response.statusText}`,
            },
          };
        }
        throw new UhoApiError(response.status, errorBody);
      }

      return await response.json() as T;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof UhoApiError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new UhoNetworkError(`Request timed out after ${this.timeout}ms`);
      }
      throw new UhoNetworkError(
        `Network error: ${(err as Error).message}`,
        err as Error
      );
    }
  }

  private get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  private del<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // ===========================================================================
  // Health & Status
  // ===========================================================================

  /** Check API health */
  async health(): Promise<HealthResponse> {
    return this.get('/api/v1/health');
  }

  /** Get indexer status with program details and chain lag */
  async status(): Promise<StatusResponse> {
    return this.get('/api/v1/status');
  }

  // ===========================================================================
  // Data Queries
  // ===========================================================================

  /**
   * Query event data with filtering, sorting, and pagination.
   *
   * @param program - Program name (e.g., "pump_fun")
   * @param event - Event name (e.g., "trade_event")
   * @param params - Query parameters (filters, pagination, sorting)
   *
   * @example
   * ```ts
   * // Get recent buy events
   * const result = await uho.query('pump_fun', 'trade_event', {
   *   is_buy: true,
   *   order_by: 'block_time',
   *   order: 'desc',
   *   limit: 20,
   * });
   *
   * // Cursor-based pagination
   * const page1 = await uho.query('pump_fun', 'trade_event', { limit: 50 });
   * const page2 = await uho.query('pump_fun', 'trade_event', {
   *   after_id: page1.pagination.next_cursor,
   *   limit: 50,
   * });
   *
   * // Range filters on numeric fields
   * const bigTrades = await uho.query('pump_fun', 'trade_event', {
   *   sol_amount_gte: 1_000_000_000,  // >= 1 SOL
   *   sol_amount_lte: 10_000_000_000, // <= 10 SOL
   * });
   * ```
   */
  async query<T = Record<string, unknown>>(
    program: string,
    event: string,
    params?: QueryParams
  ): Promise<QueryResponse<T>> {
    const queryParams = params as Record<string, string | number | boolean | undefined> | undefined;
    return this.get(`/api/v1/data/${encodeURIComponent(program)}/${encodeURIComponent(event)}`, queryParams);
  }

  /**
   * Count events matching the given filters.
   */
  async count(
    program: string,
    event: string,
    params?: Omit<QueryParams, 'limit' | 'offset' | 'after_id' | 'order_by' | 'order'>
  ): Promise<number> {
    const queryParams = params as Record<string, string | number | boolean | undefined> | undefined;
    const result = await this.get<CountResponse>(
      `/api/v1/data/${encodeURIComponent(program)}/${encodeURIComponent(event)}/count`,
      queryParams
    );
    return result.count;
  }

  /**
   * Get events by transaction signature.
   */
  async getByTransaction<T = Record<string, unknown>>(
    program: string,
    event: string,
    txSignature: string
  ): Promise<{ data: T[] }> {
    return this.get(`/api/v1/data/${encodeURIComponent(program)}/${encodeURIComponent(event)}/${encodeURIComponent(txSignature)}`);
  }

  // ===========================================================================
  // Schema Introspection
  // ===========================================================================

  /**
   * Get the full schema for a program (all events and instructions).
   */
  async getSchema(program: string): Promise<ProgramSchema>;
  /**
   * Get the schema for a specific event or instruction.
   */
  async getSchema(program: string, event: string): Promise<EventSchema>;
  async getSchema(program: string, event?: string): Promise<ProgramSchema | EventSchema> {
    if (event) {
      return this.get(`/api/v1/schema/${encodeURIComponent(program)}/${encodeURIComponent(event)}`);
    }
    return this.get(`/api/v1/schema/${encodeURIComponent(program)}`);
  }

  // ===========================================================================
  // Views
  // ===========================================================================

  /** List all custom views */
  async listViews(): Promise<{ data: ViewInfo[] }> {
    return this.get('/api/v1/views');
  }

  /** Create a custom aggregation view */
  async createView(definition: ViewDefinition): Promise<{ id: string; name: string; status: string; createdAt: string }> {
    return this.post('/api/v1/views', definition);
  }

  /**
   * Query a custom view's data.
   */
  async queryView<T = Record<string, unknown>>(
    program: string,
    viewName: string,
    params?: { limit?: number; offset?: number; order?: 'asc' | 'desc' }
  ): Promise<QueryResponse<T>> {
    const queryParams = params as Record<string, string | number | boolean | undefined> | undefined;
    return this.get(`/api/v1/data/${encodeURIComponent(program)}/views/${encodeURIComponent(viewName)}`, queryParams);
  }

  /** Delete a custom view */
  async deleteView(viewId: string): Promise<{ message: string }> {
    return this.del(`/api/v1/views/${encodeURIComponent(viewId)}`);
  }
}
