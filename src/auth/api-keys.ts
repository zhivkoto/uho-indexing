/**
 * Uho — API Key Generation & Validation
 *
 * Generates, hashes, and validates API keys with the uho_sk_ prefix.
 * Keys are stored as SHA-256 hashes — the raw key is shown only once.
 */

import crypto from 'crypto';

// =============================================================================
// Constants
// =============================================================================

/** API key prefix for identification and secret scanning */
const API_KEY_PREFIX = 'uho_sk_';

/** Length of the random hex portion (32 hex chars = 16 bytes) */
const KEY_HEX_LENGTH = 32;

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generates a new API key with its hash and display prefix.
 * The raw key is returned for one-time display; only the hash is stored.
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const randomHex = crypto.randomBytes(16).toString('hex');
  const key = `${API_KEY_PREFIX}${randomHex}`;
  const hash = hashApiKey(key);
  const last4 = randomHex.slice(-4);
  const prefix = `${API_KEY_PREFIX}...${last4}`;

  return { key, hash, prefix };
}

/**
 * Hashes an API key using SHA-256 for secure database storage.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Validates that a string has the correct API key format.
 * Does NOT check if the key is valid against the database.
 */
export function isValidApiKeyFormat(key: string): boolean {
  if (!key.startsWith(API_KEY_PREFIX)) return false;
  const randomPart = key.slice(API_KEY_PREFIX.length);
  return randomPart.length === KEY_HEX_LENGTH && /^[a-f0-9]+$/.test(randomPart);
}
