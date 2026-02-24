/**
 * Uho — IDL Registry Tests
 *
 * Tests for the built-in IDL registry that resolves well-known program names
 * to bundled IDL files (e.g., "spl-token" → SPL Token IDL).
 */

import { describe, it, expect } from 'vitest';
import {
  lookupRegistry,
  listRegistry,
  loadRegistryIdl,
  resolveFromRegistry,
} from '../src/core/idl-registry.js';

// =============================================================================
// lookupRegistry
// =============================================================================

describe('lookupRegistry', () => {
  it('finds spl-token by name', () => {
    const entry = lookupRegistry('spl-token');
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('spl-token');
    expect(entry!.programId).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    expect(entry!.format).toBe('shank');
  });

  it('finds spl-token-2022 by name', () => {
    const entry = lookupRegistry('spl-token-2022');
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('spl-token-2022');
    expect(entry!.programId).toBe('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  });

  it('finds by alias', () => {
    expect(lookupRegistry('token')!.name).toBe('spl-token');
    expect(lookupRegistry('spl_token')!.name).toBe('spl-token');
    expect(lookupRegistry('token-program')!.name).toBe('spl-token');
    expect(lookupRegistry('token-2022')!.name).toBe('spl-token-2022');
    expect(lookupRegistry('token22')!.name).toBe('spl-token-2022');
    expect(lookupRegistry('token-extensions')!.name).toBe('spl-token-2022');
  });

  it('finds by program ID', () => {
    const entry = lookupRegistry('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('spl-token');
  });

  it('is case-insensitive for names', () => {
    expect(lookupRegistry('SPL-TOKEN')).not.toBeNull();
    expect(lookupRegistry('Spl-Token')).not.toBeNull();
  });

  it('returns null for unknown programs', () => {
    expect(lookupRegistry('unknown-program')).toBeNull();
    expect(lookupRegistry('11111111111111111111111111111111')).toBeNull();
  });
});

// =============================================================================
// listRegistry
// =============================================================================

describe('listRegistry', () => {
  it('returns all registered entries', () => {
    const entries = listRegistry();
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.map((e) => e.name)).toContain('spl-token');
    expect(entries.map((e) => e.name)).toContain('spl-token-2022');
  });

  it('returns copies (not original references)', () => {
    const a = listRegistry();
    const b = listRegistry();
    expect(a).not.toBe(b);
  });
});

// =============================================================================
// loadRegistryIdl
// =============================================================================

describe('loadRegistryIdl', () => {
  it('loads the SPL Token IDL JSON', () => {
    const entry = lookupRegistry('spl-token')!;
    const idl = loadRegistryIdl(entry);
    expect(idl).toBeDefined();
    expect(idl.name).toBe('spl_token');
    expect(idl.metadata).toBeDefined();
    expect((idl.metadata as any).origin).toBe('shank');
    expect(Array.isArray(idl.instructions)).toBe(true);
    expect((idl.instructions as any[]).length).toBeGreaterThan(0);
  });

  it('loads the SPL Token-2022 IDL JSON', () => {
    const entry = lookupRegistry('spl-token-2022')!;
    const idl = loadRegistryIdl(entry);
    expect(idl).toBeDefined();
    expect(idl.name).toBe('spl_token_2022');
    expect((idl.metadata as any).address).toBe('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  });
});

// =============================================================================
// resolveFromRegistry
// =============================================================================

describe('resolveFromRegistry', () => {
  it('resolves by name and returns IDL + entry', () => {
    const result = resolveFromRegistry('spl-token');
    expect(result).not.toBeNull();
    expect(result!.entry.name).toBe('spl-token');
    expect(result!.rawIdl).toBeDefined();
    expect((result!.rawIdl as any).instructions).toBeDefined();
  });

  it('resolves by alias', () => {
    const result = resolveFromRegistry('token22');
    expect(result).not.toBeNull();
    expect(result!.entry.name).toBe('spl-token-2022');
  });

  it('returns null for file paths', () => {
    const result = resolveFromRegistry('./my-custom-idl.json');
    expect(result).toBeNull();
  });

  it('returns null for unknown names', () => {
    const result = resolveFromRegistry('nonexistent-program');
    expect(result).toBeNull();
  });
});
