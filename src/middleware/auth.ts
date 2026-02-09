/**
 * Uho — Auth Middleware
 *
 * Fastify preHandler hooks for JWT and API key authentication.
 * Supports three auth methods: Bearer JWT, X-API-Key header, and apiKey query param.
 * API key takes priority if both are present.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import type { AuthPayload } from '../core/types.js';
import { verifyAccessToken } from '../auth/jwt.js';
import { hashApiKey, isValidApiKeyFormat } from '../auth/api-keys.js';
import { UnauthorizedError } from '../core/errors.js';

// =============================================================================
// Module State
// =============================================================================

let _pool: pg.Pool;
let _jwtSecret: string;

/**
 * Initializes the auth middleware with required dependencies.
 * Must be called before any middleware functions are used.
 */
export function initAuthMiddleware(pool: pg.Pool, jwtSecret: string): void {
  _pool = pool;
  _jwtSecret = jwtSecret;
}

// =============================================================================
// Auth Middleware — JWT or API Key
// =============================================================================

/**
 * Auth middleware: checks for JWT or API key authentication.
 * On success, sets request.authPayload with user identity.
 * On failure, sends 401.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authPayload = await extractAuth(request);
  if (!authPayload) {
    const error = new UnauthorizedError('Authentication required');
    return reply.status(401).send(error.toResponse());
  }
  request.authPayload = authPayload;
}

/**
 * Strict middleware: JWT only (no API keys).
 * Used for write operations that require full session auth.
 */
export async function jwtOnlyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authPayload = extractJwt(request);
  if (!authPayload) {
    const error = new UnauthorizedError('JWT authentication required');
    return reply.status(401).send(error.toResponse());
  }
  request.authPayload = authPayload;
}

/**
 * Optional auth: sets request.authPayload if a token is present,
 * but does not reject if absent.
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest
): Promise<void> {
  const authPayload = await extractAuth(request);
  if (authPayload) {
    request.authPayload = authPayload;
  }
}

// =============================================================================
// Auth Extraction
// =============================================================================

/**
 * Attempts to extract auth from the request using all supported methods.
 * Priority: API Key header > Bearer JWT > API Key query param.
 */
async function extractAuth(request: FastifyRequest): Promise<AuthPayload | null> {
  // 1. Check X-API-Key header
  const apiKeyHeader = request.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && isValidApiKeyFormat(apiKeyHeader)) {
    return validateApiKey(apiKeyHeader);
  }

  // 2. Check Authorization: Bearer <jwt>
  const jwtPayload = extractJwt(request);
  if (jwtPayload) return jwtPayload;

  // 3. Check ?apiKey= query param (lowest priority)
  const query = request.query as Record<string, string | undefined>;
  const apiKeyQuery = query.apiKey;
  if (typeof apiKeyQuery === 'string' && isValidApiKeyFormat(apiKeyQuery)) {
    return validateApiKey(apiKeyQuery);
  }

  return null;
}

/**
 * Extracts and verifies a JWT from the Authorization header.
 */
function extractJwt(request: FastifyRequest): AuthPayload | null {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    return verifyAccessToken(token, _jwtSecret);
  } catch {
    return null;
  }
}

/**
 * Validates an API key against the database and returns the user payload.
 */
async function validateApiKey(key: string): Promise<AuthPayload | null> {
  const hash = hashApiKey(key);
  const result = await _pool.query<{ user_id: string; email: string; schema_name: string }>(
    `SELECT ak.user_id, u.email, u.schema_name
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.key_hash = $1 AND ak.revoked = false`,
    [hash]
  );

  if (result.rows.length === 0) return null;

  // Fire-and-forget: update last_used timestamp
  _pool.query('UPDATE api_keys SET last_used = now() WHERE key_hash = $1', [hash]).catch(() => {});

  const row = result.rows[0];
  return {
    userId: row.user_id,
    email: row.email,
    schemaName: row.schema_name,
  };
}
