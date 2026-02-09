/**
 * Uho — User Service
 *
 * Manages user registration, verification, authentication, and schema creation.
 * Handles all user-related database operations in the public schema.
 */

import type pg from 'pg';
import type { PlatformUser, UsageStats } from '../core/types.js';
import { createUserSchema } from '../core/db.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../auth/passwords.js';
import { generateVerificationCode, generateResetToken, sendVerificationEmail, sendPasswordResetEmail } from '../auth/email.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken, REFRESH_TOKEN_EXPIRY_SECONDS } from '../auth/jwt.js';
import { ConflictError, ValidationError, UnauthorizedError, NotFoundError } from '../core/errors.js';
import { FREE_TIER_LIMITS } from '../core/platform-config.js';
import crypto from 'crypto';

// =============================================================================
// User Service
// =============================================================================

export class UserService {
  constructor(
    private pool: pg.Pool,
    private jwtSecret: string,
    private jwtRefreshSecret: string,
    private resendApiKey: string
  ) {}

  // ===========================================================================
  // Registration
  // ===========================================================================

  /**
   * Creates a new user account, generates a verification code, and sends email.
   */
  async createUser(email: string, password: string): Promise<{ userId: string }> {
    // Validate password strength
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      throw new ValidationError(strength.message ?? 'Password too weak');
    }

    // Validate email format
    if (!isValidEmail(email)) {
      throw new ValidationError('Invalid email format');
    }

    // Check for existing user
    const existing = await this.pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError('An account with this email already exists');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate user ID and schema name
    const userId = crypto.randomUUID();
    const schemaName = this.generateSchemaName(userId);

    // Verify schema name is unique
    const schemaConflict = await this.pool.query(
      'SELECT id FROM users WHERE schema_name = $1',
      [schemaName]
    );
    let finalSchemaName = schemaName;
    if (schemaConflict.rows.length > 0) {
      // Extend to 12 chars on collision
      finalSchemaName = `u_${userId.replace(/-/g, '').slice(0, 12)}`;
    }

    // Create user record
    await this.pool.query(
      `INSERT INTO users (id, email, password_hash, verified, schema_name)
       VALUES ($1, $2, $3, false, $4)`,
      [userId, email.toLowerCase(), passwordHash, finalSchemaName]
    );

    // Create user schema
    await createUserSchema(this.pool, finalSchemaName);

    // Generate and store verification code
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.pool.query(
      `INSERT INTO email_verifications (user_id, code, expires_at) VALUES ($1, $2, $3)`,
      [userId, code, expiresAt]
    );

    // Send verification email
    try {
      await sendVerificationEmail(this.resendApiKey, email, code);
    } catch (err) {
      console.error(`[UserService] Failed to send verification email: ${(err as Error).message}`);
    }

    return { userId };
  }

  // ===========================================================================
  // Verification
  // ===========================================================================

  /**
   * Verifies a user's email with the 6-digit code and returns tokens.
   */
  async verifyEmail(email: string, code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; verified: boolean; createdAt: string };
  }> {
    const user = await this.getUserByEmail(email.toLowerCase());
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Find valid verification code
    const verResult = await this.pool.query(
      `SELECT id FROM email_verifications
       WHERE user_id = $1 AND code = $2 AND expires_at > now() AND used = false
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, code]
    );

    if (verResult.rows.length === 0) {
      throw new ValidationError('Invalid or expired verification code');
    }

    // Mark code as used and user as verified
    await this.pool.query(
      'UPDATE email_verifications SET used = true WHERE id = $1',
      [verResult.rows[0].id]
    );
    await this.pool.query(
      'UPDATE users SET verified = true, updated_at = now() WHERE id = $1',
      [user.id]
    );

    // Re-fetch user to get updated verified status
    const verifiedUser = await this.getUserById(user.id);
    if (!verifiedUser) {
      throw new NotFoundError('User not found after verification');
    }

    // Issue tokens
    return this.issueTokens(verifiedUser);
  }

  // ===========================================================================
  // Login
  // ===========================================================================

  /**
   * Authenticates with email + password and returns tokens.
   */
  async login(email: string, password: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; verified: boolean; createdAt: string };
  }> {
    const user = await this.getUserByEmail(email.toLowerCase());
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    return this.issueTokens(user);
  }

  // ===========================================================================
  // Token Management
  // ===========================================================================

  /**
   * Refreshes an access token using a valid refresh token.
   */
  async refreshTokens(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const tokenHash = hashRefreshToken(refreshToken);

    const result = await this.pool.query<{
      id: string; user_id: string; expires_at: Date;
    }>(
      `SELECT id, user_id, expires_at FROM refresh_tokens
       WHERE token_hash = $1 AND revoked = false`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const row = result.rows[0];
    if (new Date(row.expires_at) < new Date()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    // Revoke old token
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked = true WHERE id = $1',
      [row.id]
    );

    // Get user
    const user = await this.getUserById(row.user_id);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Issue new token pair
    const accessToken = signAccessToken(
      { userId: user.id, email: user.email, schemaName: user.schemaName },
      this.jwtSecret
    );
    const newRefreshToken = generateRefreshToken();
    const newHash = hashRefreshToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000);

    await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, newHash, expiresAt]
    );

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Revokes all refresh tokens for a user (logout).
   */
  async revokeUserTokens(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false',
      [userId]
    );
  }

  // ===========================================================================
  // Password Reset
  // ===========================================================================

  /**
   * Initiates a password reset by sending an email with a reset token.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.getUserByEmail(email.toLowerCase());
    if (!user) return; // Silent — no email enumeration

    const token = generateResetToken();
    const tokenHash = hashRefreshToken(token); // reuse SHA-256 hasher
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    try {
      await sendPasswordResetEmail(this.resendApiKey, email, token);
    } catch (err) {
      console.error(`[UserService] Failed to send reset email: ${(err as Error).message}`);
    }
  }

  /**
   * Resets a password using a valid reset token.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      throw new ValidationError(strength.message ?? 'Password too weak');
    }

    const tokenHash = hashRefreshToken(token);

    const result = await this.pool.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_resets
       WHERE token_hash = $1 AND expires_at > now() AND used = false`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const row = result.rows[0];
    const passwordHash = await hashPassword(newPassword);

    // Update password and mark token as used
    await this.pool.query(
      'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
      [passwordHash, row.user_id]
    );
    await this.pool.query(
      'UPDATE password_resets SET used = true WHERE id = $1',
      [row.id]
    );

    // Revoke all refresh tokens (force re-login)
    await this.revokeUserTokens(row.user_id);
  }

  // ===========================================================================
  // OAuth Login / Linking
  // ===========================================================================

  /**
   * Finds or creates a user via Google OAuth.
   * Links to existing account if email matches.
   */
  async findOrCreateByGoogle(googleId: string, email: string, displayName: string | null): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; verified: boolean; createdAt: string };
  }> {
    return this.findOrCreateOAuthUser('google_id', googleId, email, displayName);
  }

  /**
   * Finds or creates a user via GitHub OAuth.
   * Links to existing account if email matches.
   */
  async findOrCreateByGithub(githubId: string, email: string, displayName: string | null): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; verified: boolean; createdAt: string };
  }> {
    return this.findOrCreateOAuthUser('github_id', githubId, email, displayName);
  }

  /**
   * Finds or creates a user via Privy wallet auth.
   * Uses wallet address as identifier; email may be null.
   */
  async findOrCreateByWallet(walletAddress: string, email: string | null): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; verified: boolean; createdAt: string };
  }> {
    // Check if wallet is already linked
    const existing = await this.pool.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [walletAddress]
    );
    if (existing.rows.length > 0) {
      const user = this.mapUserRow(existing.rows[0]);
      return this.issueTokens(user);
    }

    // Check if email exists and link wallet
    if (email) {
      const byEmail = await this.getUserByEmail(email.toLowerCase());
      if (byEmail) {
        await this.pool.query(
          'UPDATE users SET wallet_address = $1, updated_at = now() WHERE id = $2',
          [walletAddress, byEmail.id]
        );
        const updated = await this.getUserById(byEmail.id);
        return this.issueTokens(updated!);
      }
    }

    // Create new user
    const userId = crypto.randomUUID();
    const schemaName = this.generateSchemaName(userId);
    const userEmail = email?.toLowerCase() || `${walletAddress.slice(0, 8)}@wallet.${process.env.EMAIL_DOMAIN || 'uhoindexing.com'}`;

    await this.pool.query(
      `INSERT INTO users (id, email, password_hash, verified, schema_name, wallet_address)
       VALUES ($1, $2, $3, true, $4, $5)`,
      [userId, userEmail, '', schemaName, walletAddress]
    );

    await createUserSchema(this.pool, schemaName);

    const user = await this.getUserById(userId);
    return this.issueTokens(user!);
  }

  /**
   * Generic OAuth user find-or-create logic.
   * Looks up by provider ID, then by email, then creates a new account.
   */
  private async findOrCreateOAuthUser(
    providerColumn: 'google_id' | 'github_id',
    providerId: string,
    email: string,
    displayName: string | null
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; verified: boolean; createdAt: string };
  }> {
    // 1. Check if provider ID is already linked
    const existing = await this.pool.query(
      `SELECT * FROM users WHERE ${providerColumn} = $1`,
      [providerId]
    );
    if (existing.rows.length > 0) {
      const user = this.mapUserRow(existing.rows[0]);
      return this.issueTokens(user);
    }

    // 2. Check if email exists — link the provider
    const byEmail = await this.getUserByEmail(email.toLowerCase());
    if (byEmail) {
      await this.pool.query(
        `UPDATE users SET ${providerColumn} = $1, verified = true, updated_at = now() WHERE id = $2`,
        [providerId, byEmail.id]
      );
      const updated = await this.getUserById(byEmail.id);
      return this.issueTokens(updated!);
    }

    // 3. Create a new user
    const userId = crypto.randomUUID();
    const schemaName = this.generateSchemaName(userId);

    await this.pool.query(
      `INSERT INTO users (id, email, password_hash, verified, schema_name, ${providerColumn}, display_name)
       VALUES ($1, $2, $3, true, $4, $5, $6)`,
      [userId, email.toLowerCase(), '', schemaName, providerId, displayName]
    );

    await createUserSchema(this.pool, schemaName);

    const user = await this.getUserById(userId);
    return this.issueTokens(user!);
  }

  // ===========================================================================
  // User Queries
  // ===========================================================================

  /**
   * Gets a user by ID.
   */
  async getUserById(id: string): Promise<PlatformUser | null> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return null;
    return this.mapUserRow(result.rows[0]);
  }

  /**
   * Gets a user by email.
   */
  async getUserByEmail(email: string): Promise<PlatformUser | null> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) return null;
    return this.mapUserRow(result.rows[0]);
  }

  /**
   * Updates user profile fields.
   */
  async updateUser(
    id: string,
    updates: { displayName?: string; passwordHash?: string }
  ): Promise<PlatformUser> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.displayName !== undefined) {
      setClauses.push(`display_name = $${idx++}`);
      values.push(updates.displayName);
    }
    if (updates.passwordHash !== undefined) {
      setClauses.push(`password_hash = $${idx++}`);
      values.push(updates.passwordHash);
    }
    setClauses.push('updated_at = now()');
    values.push(id);

    const result = await this.pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return this.mapUserRow(result.rows[0]);
  }

  /**
   * Gets usage statistics for a user.
   */
  async getUsageStats(userId: string): Promise<UsageStats> {
    const programCount = await this.pool.query(
      `SELECT COUNT(*)::int as count FROM user_programs WHERE user_id = $1 AND status != 'archived'`,
      [userId]
    );

    const eventCount = await this.pool.query(
      `SELECT COALESCE(SUM(count), 0)::bigint as total FROM usage_metrics
       WHERE user_id = $1 AND metric_type = 'event_indexed'`,
      [userId]
    );

    const apiCallCount = await this.pool.query(
      `SELECT COALESCE(SUM(count), 0)::bigint as total FROM usage_metrics
       WHERE user_id = $1 AND metric_type = 'api_call'
       AND period_start >= date_trunc('month', now())`,
      [userId]
    );

    return {
      programs: programCount.rows[0].count,
      programLimit: FREE_TIER_LIMITS.programs,
      eventsIndexed: Number(eventCount.rows[0].total),
      eventLimit: FREE_TIER_LIMITS.eventsIndexed,
      apiCalls: Number(apiCallCount.rows[0].total),
      apiCallLimit: FREE_TIER_LIMITS.apiCallsPerMonth,
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Issues access + refresh token pair for a user.
   */
  private async issueTokens(user: PlatformUser): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; verified: boolean; createdAt: string };
  }> {
    const accessToken = signAccessToken(
      { userId: user.id, email: user.email, schemaName: user.schemaName },
      this.jwtSecret
    );
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000);

    await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        verified: user.verified,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }

  /**
   * Generates a schema name from a user ID (first 8 hex chars).
   */
  private generateSchemaName(userId: string): string {
    const prefix = userId.replace(/-/g, '').slice(0, 8);
    return `u_${prefix}`;
  }

  /**
   * Maps a database row to a PlatformUser object.
   */
  private mapUserRow(row: Record<string, unknown>): PlatformUser {
    return {
      id: row.id as string,
      email: row.email as string,
      passwordHash: row.password_hash as string,
      verified: row.verified as boolean,
      schemaName: row.schema_name as string,
      displayName: (row.display_name as string | null) ?? null,
      googleId: (row.google_id as string | null) ?? null,
      githubId: (row.github_id as string | null) ?? null,
      walletAddress: (row.wallet_address as string | null) ?? null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Basic email format validation.
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
