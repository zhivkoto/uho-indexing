/**
 * Uho — Email Service
 *
 * Sends transactional emails (verification, password reset) via Resend.
 * Generates verification codes and reset tokens.
 */

import { Resend } from 'resend';
import crypto from 'crypto';

// =============================================================================
// Email Client
// =============================================================================

let resendClient: Resend | null = null;

/**
 * Gets or creates the Resend client singleton.
 */
function getResendClient(apiKey: string): Resend {
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

// =============================================================================
// Code & Token Generation
// =============================================================================

/**
 * Generates a 6-digit numeric verification code using cryptographically
 * secure randomness.
 */
export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generates a 64-character hex reset token.
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// =============================================================================
// Email Sending
// =============================================================================

/**
 * Sends a verification email with a 6-digit code.
 */
export async function sendVerificationEmail(
  apiKey: string,
  email: string,
  code: string
): Promise<void> {
  const resend = getResendClient(apiKey);
  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Uho <noreply@uho.dev>',
    to: email,
    subject: 'Verify your Uho account',
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
        <h2>Welcome to Uho</h2>
        <p>Your verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px; background: #f4f4f5; border-radius: 8px; text-align: center;">
          ${code}
        </div>
        <p style="color: #71717a; font-size: 14px; margin-top: 16px;">
          This code expires in 1 hour. If you didn't create an account, ignore this email.
        </p>
      </div>
    `,
  });
}

/**
 * Sends a password reset email with a reset token/link.
 */
export async function sendPasswordResetEmail(
  apiKey: string,
  email: string,
  token: string
): Promise<void> {
  const resend = getResendClient(apiKey);
  const dashboardUrl = process.env.DASHBOARD_URL || 'https://app.uho.dev';
  const resetUrl = `${dashboardUrl}/reset-password?token=${token}`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Uho <noreply@uho.dev>',
    to: email,
    subject: 'Reset your Uho password',
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
        <h2>Password Reset</h2>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}"
           style="display: inline-block; padding: 12px 24px; background: #22D3EE; color: #000; font-weight: bold; border-radius: 8px; text-decoration: none;">
          Reset Password
        </a>
        <p style="color: #71717a; font-size: 14px; margin-top: 16px;">
          This link expires in 1 hour. If you didn't request a reset, ignore this email.
        </p>
      </div>
    `,
  });
}
