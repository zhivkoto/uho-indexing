/**
 * Uho — Error Classes
 *
 * Structured error classes for consistent API error responses.
 * All errors extend AppError and include machine-readable codes,
 * HTTP status codes, and optional detail payloads.
 */

// =============================================================================
// Base Error
// =============================================================================

/**
 * Base application error with structured code, status, and details.
 * All API errors should extend this class.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown> | undefined;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  /**
   * Converts the error to a JSON-serializable response body.
   */
  toResponse(): { error: { code: string; message: string; details?: Record<string, unknown> } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

// =============================================================================
// Specific Error Classes
// =============================================================================

/** 401 — Authentication required or invalid credentials */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', details?: Record<string, unknown>) {
    super('UNAUTHORIZED', 401, message, details);
    this.name = 'UnauthorizedError';
  }
}

/** 403 — Authenticated but not allowed to perform this action */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', details?: Record<string, unknown>) {
    super('FORBIDDEN', 403, message, details);
    this.name = 'ForbiddenError';
  }
}

/** 404 — Resource not found */
export class NotFoundError extends AppError {
  constructor(message: string = 'Not found', details?: Record<string, unknown>) {
    super('NOT_FOUND', 404, message, details);
    this.name = 'NotFoundError';
  }
}

/** 409 — Conflict (e.g., duplicate email, duplicate program) */
export class ConflictError extends AppError {
  constructor(message: string = 'Conflict', details?: Record<string, unknown>) {
    super('CONFLICT', 409, message, details);
    this.name = 'ConflictError';
  }
}

/** 422 — Validation error (invalid input data) */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation error', details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 422, message, details);
    this.name = 'ValidationError';
  }
}

/** 429 — Rate limit exceeded */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: Record<string, unknown>) {
    super('RATE_LIMITED', 429, message, details);
    this.name = 'RateLimitError';
  }
}
