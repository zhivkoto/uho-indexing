/**
 * Uho — OAuth Routes
 *
 * Google OAuth, GitHub OAuth, and Privy (Solana wallet) authentication routes.
 * All providers are env-var driven — routes return 501 when not configured.
 */

import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { UserService } from '../services/user-service.js';
import type { PlatformConfig } from '../core/platform-config.js';
import { REFRESH_TOKEN_EXPIRY_SECONDS } from '../auth/jwt.js';
import { AppError } from '../core/errors.js';

/** Generates a cryptographically random OAuth state token. */
function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Cookie options for the OAuth state parameter. */
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 600, // 10 minutes
};

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Registers OAuth authentication routes for Google, GitHub, and Privy.
 */
export function registerOAuthRoutes(
  app: FastifyInstance,
  userService: UserService,
  config: PlatformConfig
): void {
  const cookieOptions = {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax' as const,
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_EXPIRY_SECONDS,
  };

  // -----------------------------------------------------------------------
  // OAuth Feature Detection
  // -----------------------------------------------------------------------

  /**
   * GET /api/v1/auth/providers — Returns which OAuth providers are configured.
   */
  app.get('/api/v1/auth/providers', async () => ({
    google: !!config.googleClientId && !!config.googleClientSecret,
    github: !!config.githubClientId && !!config.githubClientSecret,
    privy: !!config.privyAppId && !!config.privyAppSecret,
  }));

  // -----------------------------------------------------------------------
  // Google OAuth
  // -----------------------------------------------------------------------

  /**
   * POST /api/v1/auth/google — Initiates Google OAuth by returning the redirect URL.
   */
  app.post('/api/v1/auth/google', async (_request, reply) => {
    if (!config.googleClientId || !config.googleClientSecret) {
      return reply.status(501).send({
        error: { code: 'NOT_CONFIGURED', message: 'Google OAuth is not configured' },
      });
    }

    const state = generateOAuthState();
    reply.setCookie('oauth_state', state, {
      ...STATE_COOKIE_OPTIONS,
      secure: config.nodeEnv === 'production',
    });

    const redirectUri = `${config.baseUrl}/api/v1/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return reply.status(200).send({
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  });

  /**
   * GET /api/v1/auth/google/callback — Handles the Google OAuth redirect.
   */
  app.get('/api/v1/auth/google/callback', async (request, reply) => {
    if (!config.googleClientId || !config.googleClientSecret) {
      return reply.status(501).send({
        error: { code: 'NOT_CONFIGURED', message: 'Google OAuth is not configured' },
      });
    }

    const query = request.query as { code?: string; error?: string; state?: string };
    if (query.error || !query.code) {
      return reply.redirect(`${config.dashboardUrl}/login?error=oauth_denied`);
    }

    // Validate CSRF state parameter
    const cookies = request.cookies as Record<string, string | undefined>;
    const storedState = cookies?.oauth_state;
    reply.clearCookie('oauth_state', { path: '/' });

    console.log('[OAuth] Google callback - storedState:', storedState ? 'present' : 'MISSING', 'queryState:', query.state ? 'present' : 'MISSING');

    if (!storedState || !query.state || storedState !== query.state) {
      console.error('[OAuth] Google state mismatch - stored:', !!storedState, 'query:', !!query.state, 'match:', storedState === query.state);
      return reply.redirect(`${config.dashboardUrl}/login?error=invalid_state`);
    }

    try {
      const redirectUri = `${config.baseUrl}/api/v1/auth/google/callback`;
      console.log('[OAuth] Google callback - exchanging code, redirectUri:', redirectUri);

      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: query.code,
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const tokenErrBody = await tokenRes.text();
        console.error('[OAuth] Google token exchange failed:', tokenRes.status, tokenErrBody);
        console.error('[OAuth] Google token exchange redirect_uri used:', redirectUri);
        return reply.redirect(`${config.dashboardUrl}/login?error=oauth_failed`);
      }

      const tokens = await tokenRes.json() as { access_token: string };
      console.log('[OAuth] Google token exchange succeeded');

      // Get user info
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userRes.ok) {
        const userErrBody = await userRes.text();
        console.error('[OAuth] Google userinfo fetch failed:', userRes.status, userErrBody);
        return reply.redirect(`${config.dashboardUrl}/login?error=oauth_failed`);
      }

      const profile = await userRes.json() as {
        id: string;
        email: string;
        name?: string;
        verified_email?: boolean;
      };

      if (!profile.email) {
        return reply.redirect(`${config.dashboardUrl}/login?error=no_email`);
      }

      const result = await userService.findOrCreateByGoogle(
        profile.id,
        profile.email,
        profile.name ?? null
      );

      reply.setCookie('uho_refresh', result.refreshToken, cookieOptions);

      // Redirect to dashboard with tokens in URL fragment (not query params)
      // Fragments are never sent to the server, avoiding log/Referer leakage
      const params = new URLSearchParams({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      return reply.redirect(`${config.dashboardUrl}/auth/callback#${params.toString()}`);
    } catch (err) {
      console.error('[OAuth] Google callback error:', err);
      return reply.redirect(`${config.dashboardUrl}/login?error=oauth_failed`);
    }
  });

  // -----------------------------------------------------------------------
  // GitHub OAuth
  // -----------------------------------------------------------------------

  /**
   * POST /api/v1/auth/github — Initiates GitHub OAuth by returning the redirect URL.
   */
  app.post('/api/v1/auth/github', async (_request, reply) => {
    if (!config.githubClientId || !config.githubClientSecret) {
      return reply.status(501).send({
        error: { code: 'NOT_CONFIGURED', message: 'GitHub OAuth is not configured' },
      });
    }

    const state = generateOAuthState();
    reply.setCookie('oauth_state', state, {
      ...STATE_COOKIE_OPTIONS,
      secure: config.nodeEnv === 'production',
    });

    const redirectUri = `${config.baseUrl}/api/v1/auth/github/callback`;
    const params = new URLSearchParams({
      client_id: config.githubClientId,
      redirect_uri: redirectUri,
      scope: 'user:email',
      state,
    });

    return reply.status(200).send({
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    });
  });

  /**
   * GET /api/v1/auth/github/callback — Handles the GitHub OAuth redirect.
   */
  app.get('/api/v1/auth/github/callback', async (request, reply) => {
    if (!config.githubClientId || !config.githubClientSecret) {
      return reply.status(501).send({
        error: { code: 'NOT_CONFIGURED', message: 'GitHub OAuth is not configured' },
      });
    }

    const query = request.query as { code?: string; error?: string; state?: string };
    if (query.error || !query.code) {
      return reply.redirect(`${config.dashboardUrl}/login?error=oauth_denied`);
    }

    // Validate CSRF state parameter
    const cookies = request.cookies as Record<string, string | undefined>;
    const storedState = cookies?.oauth_state;
    reply.clearCookie('oauth_state', { path: '/' });

    if (!storedState || !query.state || storedState !== query.state) {
      return reply.redirect(`${config.dashboardUrl}/login?error=invalid_state`);
    }

    try {
      // Exchange code for access token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          code: query.code,
        }),
      });

      if (!tokenRes.ok) {
        console.error('[OAuth] GitHub token exchange failed:', await tokenRes.text());
        return reply.redirect(`${config.dashboardUrl}/login?error=oauth_failed`);
      }

      const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokenData.access_token) {
        return reply.redirect(`${config.dashboardUrl}/login?error=oauth_failed`);
      }

      // Get user profile
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Uho/1.0',
        },
      });

      if (!userRes.ok) {
        return reply.redirect(`${config.dashboardUrl}/login?error=oauth_failed`);
      }

      const profile = await userRes.json() as {
        id: number;
        login: string;
        name?: string;
        email?: string;
      };

      // GitHub may not return email in the user profile — fetch from emails API
      let email = profile.email;
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Uho/1.0',
          },
        });

        if (emailsRes.ok) {
          const emails = await emailsRes.json() as Array<{
            email: string;
            primary: boolean;
            verified: boolean;
          }>;
          const primary = emails.find((e) => e.primary && e.verified);
          email = primary?.email ?? emails.find((e) => e.verified)?.email;
        }
      }

      if (!email) {
        return reply.redirect(`${config.dashboardUrl}/login?error=no_email`);
      }

      const result = await userService.findOrCreateByGithub(
        String(profile.id),
        email,
        profile.name ?? profile.login
      );

      reply.setCookie('uho_refresh', result.refreshToken, cookieOptions);

      // Redirect with tokens in URL fragment to prevent log/Referer leakage
      const params = new URLSearchParams({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      return reply.redirect(`${config.dashboardUrl}/auth/callback#${params.toString()}`);
    } catch (err) {
      console.error('[OAuth] GitHub callback error:', err);
      return reply.redirect(`${config.dashboardUrl}/login?error=oauth_failed`);
    }
  });

  // -----------------------------------------------------------------------
  // Privy (Solana Wallet Auth)
  // -----------------------------------------------------------------------

  /**
   * POST /api/v1/auth/privy — Verifies a Privy auth token and returns JWT.
   */
  app.post('/api/v1/auth/privy', async (request, reply) => {
    if (!config.privyAppId || !config.privyAppSecret) {
      return reply.status(501).send({
        error: { code: 'NOT_CONFIGURED', message: 'Privy wallet auth is not configured' },
      });
    }

    const body = request.body as { token?: string } | null;
    if (!body?.token) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'Privy auth token is required' },
      });
    }

    try {
      // Use PrivyClient which handles JWKS setup internally
      const { PrivyClient, verifyAccessToken } = await import('@privy-io/node');
      const { createRemoteJWKSet } = await import('jose');

      // Verify the Privy access token
      const jwksUrl = `https://api.privy.io/v1/apps/${config.privyAppId}/jwks.json`;
      const jwks = createRemoteJWKSet(new URL(jwksUrl));

      let verifiedClaims;
      try {
        verifiedClaims = await verifyAccessToken({
          access_token: body.token,
          app_id: config.privyAppId,
          verification_key: jwks,
        });
      } catch (verifyErr: any) {
        console.error('[OAuth] Privy verification failed:', verifyErr?.message, verifyErr?.code, verifyErr);
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid Privy token' },
        });
      }

      console.log('[OAuth] Privy token verified, user_id:', verifiedClaims.user_id);

      // Get user details from Privy API to find wallet address
      const privyClient = new PrivyClient({
        appId: config.privyAppId,
        appSecret: config.privyAppSecret,
      });

      let privyUser: any;
      try {
        // Use the REST API _get method to fetch user by DID
        privyUser = await (privyClient.users() as any)._get(verifiedClaims.user_id);
      } catch (userErr: any) {
        console.error('[OAuth] Privy user fetch failed:', userErr?.message, userErr);
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch Privy user details' },
        });
      }

      console.log('[OAuth] Privy user fetched, linked_accounts:', JSON.stringify(privyUser?.linked_accounts?.map((a: any) => ({ type: a.type, chain_type: a.chain_type, address: a.address }))));

      const linkedAccounts = privyUser?.linked_accounts ?? privyUser?.linkedAccounts ?? [];
      const walletAccount = linkedAccounts.find(
        (a: any) => a.type === 'wallet' && (a.chain_type === 'solana' || a.chainType === 'solana')
      ) ?? linkedAccounts.find(
        (a: any) => a.type === 'wallet'
      );

      const walletAddress = walletAccount?.address;
      if (!walletAddress) {
        console.error('[OAuth] No wallet found in Privy user. Accounts:', JSON.stringify(linkedAccounts));
        return reply.status(422).send({
          error: { code: 'VALIDATION_ERROR', message: 'No wallet address found in Privy account' },
        });
      }

      const emailAccount = linkedAccounts.find((a: any) => a.type === 'email');

      const result = await userService.findOrCreateByWallet(
        walletAddress,
        emailAccount?.address ?? null
      );

      reply.setCookie('uho_refresh', result.refreshToken, cookieOptions);
      return reply.status(200).send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (err) {
      console.error('[OAuth] Privy auth unexpected error:', err);
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send(err.toResponse());
      }
      throw err;
    }
  });
}
