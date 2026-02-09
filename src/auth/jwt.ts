/**
 * Uho — JWT Token Management
 *
 * Sign, verify, and hash JSON Web Tokens for access and refresh flows.
 * Access tokens are short-lived JWTs. Refresh tokens are opaque random strings.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { AuthPayload } from '../core/types.js';

// =============================================================================
// Token Configuration
// =============================================================================

/** Access token expiry: 15 minutes */
const ACCESS_TOKEN_EXPIRY = '15m';

/** Refresh token expiry: 30 days (in seconds for comparison) */
export const REFRESH_TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60;

// =============================================================================
// Access Tokens
// =============================================================================

/**
 * Signs an access token JWT containing user identity information.
 * Expires in 15 minutes.
 */
export function signAccessToken(payload: AuthPayload, secret: string): string {
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      schemaName: payload.schemaName,
    },
    secret,
    { expiresIn: ACCESS_TOKEN_EXPIRY, algorithm: 'HS256' }
  );
}

/**
 * Verifies an access token JWT and returns the decoded payload.
 * Throws on invalid or expired tokens.
 */
export function verifyAccessToken(token: string, secret: string): AuthPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  return {
    userId: decoded.userId as string,
    email: decoded.email as string,
    schemaName: decoded.schemaName as string,
  };
}

// =============================================================================
// Refresh Tokens
// =============================================================================

/**
 * Generates a cryptographically secure refresh token (64-char hex string).
 * This is an opaque token, NOT a JWT.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a refresh token using SHA-256 for secure storage.
 * The raw token is never stored — only its hash.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
