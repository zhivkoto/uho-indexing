/**
 * @uho/client — Error Classes
 */

import type { UhoErrorResponse } from './types.js';

/**
 * Error thrown when the Uho API returns a non-2xx response.
 */
export class UhoApiError extends Error {
  /** HTTP status code */
  public readonly status: number;
  /** Machine-readable error code from the API */
  public readonly code: string;
  /** Optional error details */
  public readonly details?: Record<string, unknown>;

  constructor(status: number, body: UhoErrorResponse) {
    super(body.error.message);
    this.name = 'UhoApiError';
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
  }
}

/**
 * Error thrown when a network/fetch error occurs.
 */
export class UhoNetworkError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'UhoNetworkError';
    this.cause = cause;
  }
}
