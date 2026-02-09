/**
 * Uho — Platform Configuration
 *
 * Loads platform-mode configuration from environment variables.
 * Used when UHO_MODE=platform for multi-tenant SaaS operation.
 */

// =============================================================================
// Platform Config Interface
// =============================================================================

/** Configuration for Uho platform (multi-tenant) mode */
export interface PlatformConfig {
  databaseUrl: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  resendApiKey: string;
  heliusApiKey: string | undefined;
  apiPort: number;
  wsPort: number;
  corsOrigins: string[];
  nodeEnv: 'development' | 'production';
  baseUrl: string;
  dashboardUrl: string;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  githubClientId: string | undefined;
  githubClientSecret: string | undefined;
  privyAppId: string | undefined;
  privyAppSecret: string | undefined;
}

// =============================================================================
// Free Tier Limits
// =============================================================================

/** Free tier resource limits */
export const FREE_TIER_LIMITS = {
  programs: 1,
  eventsIndexed: 1000,
  apiCallsPerMonth: 50_000,
  wsConnections: 5,
  customViews: 3,
  webhooks: 3,
  apiKeys: 2,
  idlUploadBytes: 5 * 1024 * 1024, // 5 MB
} as const;

// =============================================================================
// Config Loading
// =============================================================================

/**
 * Loads platform configuration from environment variables.
 * Throws if required variables are missing.
 */
export function loadPlatformConfig(): PlatformConfig {
  const databaseUrl = requireEnv('DATABASE_URL');
  const jwtSecret = requireEnv('JWT_SECRET');
  const jwtRefreshSecret = requireEnv('JWT_REFRESH_SECRET');
  const resendApiKey = requireEnv('RESEND_API_KEY');

  const heliusApiKey = process.env.HELIUS_API_KEY;
  const apiPort = parseInt(process.env.API_PORT || '3010', 10);
  const wsPort = parseInt(process.env.WS_PORT || '3012', 10);
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim());
  const nodeEnv = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const baseUrl = process.env.BASE_URL || `http://localhost:${apiPort}`;
  const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3034';

  // OAuth providers (optional — features degrade gracefully when not set)
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  const privyAppId = process.env.PRIVY_APP_ID;
  const privyAppSecret = process.env.PRIVY_APP_SECRET;

  return {
    databaseUrl,
    jwtSecret,
    jwtRefreshSecret,
    resendApiKey,
    heliusApiKey,
    apiPort,
    wsPort,
    corsOrigins,
    nodeEnv,
    baseUrl,
    dashboardUrl,
    googleClientId,
    googleClientSecret,
    githubClientId,
    githubClientSecret,
    privyAppId,
    privyAppSecret,
  };
}

/**
 * Returns true if the current process is running in platform mode.
 */
export function isPlatformMode(): boolean {
  return process.env.UHO_MODE === 'platform';
}

/**
 * Returns the RPC URL for platform mode.
 * Uses HELIUS_API_KEY if available, otherwise falls back to public Solana RPC.
 */
export function getPlatformRpcUrl(chain: string = 'solana-mainnet'): string {
  const heliusKey = process.env.HELIUS_API_KEY;
  if (heliusKey) {
    const subdomain = chain === 'solana-mainnet' ? 'mainnet' : 'devnet';
    return `https://${subdomain}.helius-rpc.com/?api-key=${heliusKey}`;
  }
  return chain === 'solana-mainnet'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Reads a required environment variable or throws a descriptive error.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Set it in .env or your environment for platform mode.`
    );
  }
  return value;
}
