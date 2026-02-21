/**
 * Uho — IDL Registry
 *
 * Built-in registry of well-known Solana program IDLs.
 * Allows users to reference programs by name (e.g., "spl-token") instead of
 * providing an IDL file path. Ships with IDLs for the most common Shank programs.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ShankIDL } from './types.js';

// =============================================================================
// Types
// =============================================================================

/** A registry entry for a well-known program */
export interface RegistryEntry {
  /** Human-readable program name */
  name: string;
  /** Solana program ID (base58 public key) */
  programId: string;
  /** IDL format: 'shank' | 'anchor' */
  format: 'shank' | 'anchor';
  /** Description for CLI display */
  description: string;
  /** Relative path to the bundled IDL JSON file (from fixtures/) */
  idlFile: string;
  /** Alternative names/aliases for lookup */
  aliases: string[];
}

// =============================================================================
// Registry Data
// =============================================================================

const REGISTRY_ENTRIES: RegistryEntry[] = [
  {
    name: 'spl-token',
    programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    format: 'shank',
    description: 'SPL Token Program — the original Solana token standard',
    idlFile: 'spl-token-idl.json',
    aliases: ['token', 'spl_token', 'token-program'],
  },
  {
    name: 'spl-token-2022',
    programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    format: 'shank',
    description: 'SPL Token-2022 Program — next-gen token standard with extensions',
    idlFile: 'spl-token-2022-idl.json',
    aliases: ['token-2022', 'spl_token_2022', 'token-extensions', 'token22'],
  },
];

// =============================================================================
// Registry Lookup
// =============================================================================

/**
 * Looks up a well-known program by name, alias, or program ID.
 * Returns the registry entry or null if not found.
 */
export function lookupRegistry(nameOrId: string): RegistryEntry | null {
  const normalized = nameOrId.toLowerCase().trim();

  for (const entry of REGISTRY_ENTRIES) {
    if (
      entry.name === normalized ||
      entry.programId === nameOrId ||
      entry.aliases.includes(normalized)
    ) {
      return entry;
    }
  }

  return null;
}

/**
 * Returns all registered programs for display in CLI help.
 */
export function listRegistry(): RegistryEntry[] {
  return [...REGISTRY_ENTRIES];
}

/**
 * Loads the IDL JSON for a registry entry from the bundled fixtures directory.
 */
export function loadRegistryIdl(entry: RegistryEntry): Record<string, unknown> {
  const currentFile = fileURLToPath(import.meta.url);
  const fixturesDir = resolve(dirname(currentFile), '../../fixtures');
  const idlPath = resolve(fixturesDir, entry.idlFile);
  return JSON.parse(readFileSync(idlPath, 'utf-8'));
}

/**
 * Resolves an IDL path — if it matches a registry entry, loads the built-in IDL.
 * Otherwise returns null (caller should load from the path as a file).
 *
 * @param idlPathOrName - A file path or a well-known program name/alias
 * @returns The raw IDL JSON if found in registry, null otherwise
 */
export function resolveFromRegistry(idlPathOrName: string): {
  rawIdl: Record<string, unknown>;
  entry: RegistryEntry;
} | null {
  const entry = lookupRegistry(idlPathOrName);
  if (!entry) return null;

  const rawIdl = loadRegistryIdl(entry);
  return { rawIdl, entry };
}
