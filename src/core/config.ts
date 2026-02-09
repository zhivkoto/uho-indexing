/**
 * Uho — Configuration System
 *
 * Loads and validates uho.yaml configuration using Zod schemas.
 * Provides sensible defaults and supports automatic config file discovery.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import yaml from 'js-yaml';
import { z } from 'zod';
import type { UhoConfig } from './types.js';

// =============================================================================
// Default RPC URLs
// =============================================================================

const FALLBACK_RPC_URLS: Record<string, string> = {
  'solana-devnet': 'https://api.devnet.solana.com',
  'solana-mainnet': 'https://api.mainnet-beta.solana.com',
};

/**
 * Returns the RPC URL for the given chain.
 * Priority: rpcUrl in config > HELIUS_API_KEY env var > public fallback.
 */
export function getDefaultRpcUrl(chain: string): string {
  const heliusKey = process.env.HELIUS_API_KEY;
  if (heliusKey) {
    const subdomain = chain === 'solana-mainnet' ? 'mainnet' : 'devnet';
    return `https://${subdomain}.helius-rpc.com/?api-key=${heliusKey}`;
  }
  return FALLBACK_RPC_URLS[chain] ?? 'https://api.devnet.solana.com';
}

// =============================================================================
// Zod Configuration Schema
// =============================================================================

const configSchema = z.object({
  version: z.number().default(1),
  name: z.string().min(1, 'Project name is required'),
  chain: z.enum(['solana-mainnet', 'solana-devnet']).default('solana-devnet'),
  rpcUrl: z.string().url().optional(),
  database: z.object({
    host: z.string().default('localhost'),
    port: z.number().int().min(1).max(65535).default(5432),
    name: z.string().default('uho'),
    user: z.string().default('zhivkoto'),
    password: z.string().default(''),
  }).default({}),
  programs: z.array(z.object({
    name: z.string().min(1, 'Program name is required'),
    programId: z.string().min(32, 'Program ID must be a valid base58 public key'),
    idl: z.string().min(1, 'IDL path is required'),
    events: z.array(z.string()).optional(),
  })).min(1, 'At least one program must be configured'),
  api: z.object({
    port: z.number().int().min(1).max(65535).default(3000),
    host: z.string().default('0.0.0.0'),
  }).default({}),
  ingestion: z.object({
    pollIntervalMs: z.number().int().min(100).default(2000),
    batchSize: z.number().int().min(1).max(1000).default(25),
    startSlot: z.number().int().optional(),
  }).default({}),
});

// =============================================================================
// Config File Discovery
// =============================================================================

/**
 * Searches for uho.yaml starting from the current directory and walking up
 * the directory tree. Returns the first match or throws if not found.
 */
export function resolveConfigPath(): string {
  let dir = process.cwd();
  const root = dirname(dir);

  while (true) {
    const candidate = join(dir, 'uho.yaml');
    if (existsSync(candidate)) return candidate;

    const parent = dirname(dir);
    if (parent === dir || dir === root) break;
    dir = parent;
  }

  throw new Error(
    'Could not find uho.yaml in current directory or any parent directory.\n' +
    'Run `uho init` to create one, or specify --config <path>.'
  );
}

// =============================================================================
// Config Loading & Validation
// =============================================================================

/**
 * Validates a raw configuration object against the Zod schema.
 * Applies defaults and returns a fully-typed UhoConfig.
 */
export function validateConfig(raw: unknown): UhoConfig {
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid uho.yaml configuration:\n${issues}`);
  }
  return result.data as UhoConfig;
}

/**
 * Loads, parses, and validates a uho.yaml configuration file.
 * If no path is given, searches for the config file automatically.
 */
export function loadConfig(configPath?: string): UhoConfig {
  const filePath = configPath ? resolve(configPath) : resolveConfigPath();

  if (!existsSync(filePath)) {
    throw new Error(`Configuration file not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`Failed to parse YAML in ${filePath}: ${(err as Error).message}`);
  }

  const config = validateConfig(parsed);

  // Resolve IDL paths relative to the config file directory
  const configDir = dirname(filePath);
  for (const program of config.programs) {
    if (!program.idl.startsWith('/')) {
      program.idl = resolve(configDir, program.idl);
    }
  }

  return config;
}
