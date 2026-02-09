/**
 * Uho — Password Hashing
 *
 * Secure password hashing and verification using Argon2id.
 * Includes password strength validation.
 */

import argon2 from 'argon2';

// =============================================================================
// Configuration
// =============================================================================

/** Argon2id options — OWASP recommended defaults */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MiB
  timeCost: 3,         // 3 iterations
  parallelism: 4,      // 4 threads
};

// =============================================================================
// Password Hashing
// =============================================================================

/**
 * Hashes a plaintext password using Argon2id with secure parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * Also supports legacy bcrypt hashes for migration compatibility.
 * Returns true if the password matches.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Support legacy bcrypt hashes (start with $2a$ or $2b$)
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
    const bcrypt = await import('bcryptjs');
    return bcrypt.default.compare(password, hash);
  }
  return argon2.verify(hash, password);
}

// =============================================================================
// Password Validation
// =============================================================================

/**
 * Validates password strength requirements.
 * Rules: minimum 8 characters, at least 1 letter and 1 number.
 */
export function validatePasswordStrength(
  password: string
): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one letter' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}
