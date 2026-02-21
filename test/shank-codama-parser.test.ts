/**
 * Uho — Shank & Codama IDL Parser Tests
 *
 * Tests for parsing Shank-format IDLs (SPL Token, Token-2022) and Codama-format
 * IDLs into normalized ParsedIDL representations.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  isShankIDL,
  parseShankIDL,
  isCodamaIDL,
  parseCodamaIDL,
  detectIdlFormat,
  parseAnyIDL,
} from '../src/core/idl-parser.js';
import type { ShankIDL, CodamaIDL, AnchorIDL } from '../src/core/types.js';

// Load fixture IDLs
const splTokenIdl: ShankIDL = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/spl-token-idl.json'), 'utf-8')
);
const splToken2022Idl: ShankIDL = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/spl-token-2022-idl.json'), 'utf-8')
);
const counterIdl: AnchorIDL = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/counter-idl.json'), 'utf-8')
);
const swapIdl: AnchorIDL = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/swap-idl.json'), 'utf-8')
);

// =============================================================================
// isShankIDL
// =============================================================================

describe('isShankIDL', () => {
  it('detects SPL Token IDL as Shank', () => {
    expect(isShankIDL(splTokenIdl)).toBe(true);
  });

  it('detects SPL Token-2022 IDL as Shank', () => {
    expect(isShankIDL(splToken2022Idl)).toBe(true);
  });

  it('does not detect Anchor IDL as Shank', () => {
    expect(isShankIDL(counterIdl)).toBe(false);
  });

  it('detects by metadata.origin', () => {
    expect(isShankIDL({ metadata: { origin: 'shank' }, instructions: [] })).toBe(true);
  });

  it('detects by discriminant presence without address', () => {
    const shankLike = {
      name: 'test',
      instructions: [{ discriminant: { type: 'u8', value: 0 } }],
    };
    expect(isShankIDL(shankLike)).toBe(true);
  });
});

// =============================================================================
// parseShankIDL
// =============================================================================

describe('parseShankIDL', () => {
  it('parses SPL Token IDL correctly', () => {
    const parsed = parseShankIDL(splTokenIdl);
    expect(parsed.programId).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    expect(parsed.programName).toBe('spl_token');
    expect(parsed.events).toEqual([]);
    expect(parsed.accounts).toEqual([]);
    expect(parsed.instructions.length).toBeGreaterThan(0);
  });

  it('parses transfer instruction', () => {
    const parsed = parseShankIDL(splTokenIdl);
    const transfer = parsed.instructions.find((ix) => ix.name === 'transfer');
    expect(transfer).toBeDefined();
    expect(transfer!.discriminator).toEqual(Buffer.from([3]));
    expect(transfer!.accounts).toContain('source');
    expect(transfer!.accounts).toContain('destination');
    expect(transfer!.accounts).toContain('authority');
    expect(transfer!.args.length).toBe(1);
    expect(transfer!.args[0].name).toBe('amount');
    expect(transfer!.args[0].sqlType).toBe('BIGINT');
  });

  it('parses transferChecked instruction', () => {
    const parsed = parseShankIDL(splTokenIdl);
    const transferChecked = parsed.instructions.find((ix) => ix.name === 'transferChecked');
    expect(transferChecked).toBeDefined();
    expect(transferChecked!.discriminator).toEqual(Buffer.from([12]));
    expect(transferChecked!.accounts).toContain('source');
    expect(transferChecked!.accounts).toContain('mint');
    expect(transferChecked!.accounts).toContain('destination');
    expect(transferChecked!.accounts).toContain('authority');
    expect(transferChecked!.args.length).toBe(2);
    expect(transferChecked!.args[0].name).toBe('amount');
    expect(transferChecked!.args[1].name).toBe('decimals');
  });

  it('parses mintTo instruction discriminant', () => {
    const parsed = parseShankIDL(splTokenIdl);
    const mintTo = parsed.instructions.find((ix) => ix.name === 'mintTo');
    expect(mintTo).toBeDefined();
    expect(mintTo!.discriminator).toEqual(Buffer.from([7]));
  });

  it('parses burn instruction discriminant', () => {
    const parsed = parseShankIDL(splTokenIdl);
    const burn = parsed.instructions.find((ix) => ix.name === 'burn');
    expect(burn).toBeDefined();
    expect(burn!.discriminator).toEqual(Buffer.from([8]));
  });

  it('parses SPL Token-2022 IDL with same structure', () => {
    const parsed = parseShankIDL(splToken2022Idl);
    expect(parsed.programId).toBe('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
    expect(parsed.instructions.length).toBe(splTokenIdl.instructions.length);
  });
});

// =============================================================================
// isCodamaIDL
// =============================================================================

describe('isCodamaIDL', () => {
  it('detects codama origin', () => {
    expect(isCodamaIDL({ metadata: { origin: 'codama' } })).toBe(true);
  });

  it('detects kinobi origin', () => {
    expect(isCodamaIDL({ metadata: { origin: 'kinobi' } })).toBe(true);
  });

  it('does not detect Shank as Codama', () => {
    expect(isCodamaIDL(splTokenIdl)).toBe(false);
  });

  it('does not detect Anchor as Codama', () => {
    expect(isCodamaIDL(counterIdl)).toBe(false);
  });
});

// =============================================================================
// parseCodamaIDL
// =============================================================================

describe('parseCodamaIDL', () => {
  it('parses Codama IDL with discriminant (Shank-style)', () => {
    const codamaIdl: CodamaIDL = {
      version: '1.0.0',
      name: 'test_program',
      address: 'Test11111111111111111111111111111111111111',
      instructions: [
        {
          name: 'doSomething',
          accounts: [{ name: 'user', writable: true, signer: true }],
          args: [{ name: 'value', type: 'u64' }],
          discriminant: { type: 'u8', value: 42 },
        },
      ],
      metadata: { origin: 'codama' },
    };

    const parsed = parseCodamaIDL(codamaIdl);
    expect(parsed.programId).toBe('Test11111111111111111111111111111111111111');
    expect(parsed.programName).toBe('test_program');
    expect(parsed.instructions.length).toBe(1);
    expect(parsed.instructions[0].name).toBe('doSomething');
    expect(parsed.instructions[0].discriminator).toEqual(Buffer.from([42]));
    expect(parsed.instructions[0].args[0].name).toBe('value');
    expect(parsed.instructions[0].args[0].sqlType).toBe('BIGINT');
  });

  it('parses Codama IDL with discriminator array (Anchor-style)', () => {
    const codamaIdl: CodamaIDL = {
      version: '1.0.0',
      name: 'hybrid_program',
      instructions: [
        {
          name: 'initialize',
          accounts: [],
          args: [],
          discriminator: [1, 2, 3, 4, 5, 6, 7, 8],
        },
      ],
      metadata: { origin: 'codama', address: 'Hybrid11111111111111111111111111111111111' },
    };

    const parsed = parseCodamaIDL(codamaIdl);
    expect(parsed.programId).toBe('Hybrid11111111111111111111111111111111111');
    expect(parsed.instructions[0].discriminator).toEqual(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
  });
});

// =============================================================================
// detectIdlFormat
// =============================================================================

describe('detectIdlFormat', () => {
  it('detects Shank format', () => {
    expect(detectIdlFormat(splTokenIdl)).toBe('shank');
  });

  it('detects Anchor format', () => {
    expect(detectIdlFormat(counterIdl)).toBe('anchor');
    expect(detectIdlFormat(swapIdl)).toBe('anchor');
  });

  it('detects Codama format', () => {
    expect(detectIdlFormat({ metadata: { origin: 'codama' } })).toBe('codama');
    expect(detectIdlFormat({ metadata: { origin: 'kinobi' } })).toBe('codama');
  });

  it('defaults to anchor for unknown format', () => {
    expect(detectIdlFormat({ name: 'unknown', instructions: [] })).toBe('anchor');
  });
});

// =============================================================================
// parseAnyIDL (unified parser)
// =============================================================================

describe('parseAnyIDL', () => {
  it('parses Anchor IDL and returns format', () => {
    const { parsed, format } = parseAnyIDL(counterIdl as unknown as Record<string, unknown>);
    expect(format).toBe('anchor');
    expect(parsed.programId).toBe('Coun1111111111111111111111111111111111111111');
    expect(parsed.programName).toBe('counter');
    expect(parsed.events.length).toBe(1);
  });

  it('parses Shank IDL and returns format', () => {
    const { parsed, format } = parseAnyIDL(splTokenIdl as unknown as Record<string, unknown>);
    expect(format).toBe('shank');
    expect(parsed.programId).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    expect(parsed.instructions.length).toBeGreaterThan(0);
    expect(parsed.events).toEqual([]);
  });

  it('parses Codama IDL and returns format', () => {
    const codamaIdl = {
      version: '1.0.0',
      name: 'codama_test',
      metadata: { origin: 'codama', address: 'Codama1111111111111111111111111111111111111' },
      instructions: [
        {
          name: 'test',
          accounts: [],
          args: [{ name: 'amount', type: 'u64' }],
          discriminant: { type: 'u8', value: 1 },
        },
      ],
    };
    const { parsed, format } = parseAnyIDL(codamaIdl as unknown as Record<string, unknown>);
    expect(format).toBe('codama');
    expect(parsed.programId).toBe('Codama1111111111111111111111111111111111111');
    expect(parsed.instructions[0].args[0].name).toBe('amount');
  });
});
