/**
 * Uho — IDL Parser
 *
 * IDL Abstraction Layer: unified entry point for parsing Anchor, Shank, and
 * Codama IDL formats into a normalized ParsedIDL representation.
 *
 * This module exports:
 * - Shared utilities (toSnakeCase, type mapping, discriminator computation)
 * - Format-specific parsers (re-exported from ./parsers/)
 * - Unified detection and parsing (detectIdlFormat, parseAnyIDL)
 *
 * Supported formats:
 * - Anchor v0.30+: events, instructions, accounts with 8-byte discriminators
 * - Shank: instruction-only with discriminant values (SPL Token, Token-2022, etc.)
 * - Codama: hybrid format from Codama/Kinobi toolchain
 */

import { createHash } from 'crypto';
import type {
  AnchorIDL,
  ShankIDL,
  CodamaIDL,
  ParsedIDL,
} from './types.js';

// =============================================================================
// Shared Utilities
// =============================================================================

/**
 * Maps an Anchor primitive type string to a PostgreSQL column type.
 * Complex types (vec, option, defined, array) are handled in the Anchor parser.
 */
export const PRIMITIVE_TYPE_MAP: Record<string, { sqlType: string; nullable: boolean }> = {
  u8:         { sqlType: 'INTEGER',            nullable: false },
  u16:        { sqlType: 'INTEGER',            nullable: false },
  u32:        { sqlType: 'INTEGER',            nullable: false },
  u64:        { sqlType: 'BIGINT',             nullable: false },
  u128:       { sqlType: 'NUMERIC(39,0)',      nullable: false },
  i8:         { sqlType: 'INTEGER',            nullable: false },
  i16:        { sqlType: 'INTEGER',            nullable: false },
  i32:        { sqlType: 'INTEGER',            nullable: false },
  i64:        { sqlType: 'BIGINT',             nullable: false },
  i128:       { sqlType: 'NUMERIC(39,0)',      nullable: false },
  f32:        { sqlType: 'DOUBLE PRECISION',   nullable: false },
  f64:        { sqlType: 'DOUBLE PRECISION',   nullable: false },
  bool:       { sqlType: 'BOOLEAN',            nullable: false },
  string:     { sqlType: 'TEXT',               nullable: false },
  pubkey:     { sqlType: 'TEXT',               nullable: false },
  publicKey:  { sqlType: 'TEXT',               nullable: false },
  bytes:      { sqlType: 'BYTEA',              nullable: false },
};

/**
 * Converts camelCase or PascalCase to snake_case.
 * Examples: "inputAmount" → "input_amount", "SwapEvent" → "swap_event"
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Computes the Anchor event discriminator for older IDLs that don't include it.
 * Formula: sha256("event:{EventName}")[0..8]
 */
export function computeEventDiscriminator(eventName: string): Buffer {
  const hash = createHash('sha256').update(`event:${eventName}`).digest();
  return Buffer.from(hash.subarray(0, 8));
}

/**
 * Computes the Anchor instruction discriminator (sighash) for IDLs that don't include it.
 * Formula: sha256("global:{instruction_name}")[0..8]
 * Uses the camelCase name as-is from the IDL (Anchor convention).
 */
export function computeInstructionDiscriminator(ixName: string): Buffer {
  const hash = createHash('sha256').update(`global:${toSnakeCase(ixName)}`).digest();
  return Buffer.from(hash.subarray(0, 8));
}

/**
 * Returns the byte size for a Shank/Codama discriminant type string.
 */
export function discriminantByteSize(type: string): number {
  switch (type) {
    case 'u8': return 1;
    case 'u16': return 2;
    case 'u32': return 4;
    default: return 1;
  }
}

// =============================================================================
// Re-exports from format-specific parsers
// =============================================================================

export { parseIDL, parseEvent, parseField, anchorTypeToSql } from './parsers/anchor-parser.js';
export { isShankIDL, parseShankIDL } from './parsers/shank-parser.js';
export { isCodamaIDL, parseCodamaIDL } from './parsers/codama-parser.js';

// =============================================================================
// Unified IDL Abstraction Layer
// =============================================================================

// Import detection functions for use in detectIdlFormat/parseAnyIDL
import { isShankIDL } from './parsers/shank-parser.js';
import { isCodamaIDL } from './parsers/codama-parser.js';
import { parseIDL } from './parsers/anchor-parser.js';
import { parseShankIDL } from './parsers/shank-parser.js';
import { parseCodamaIDL } from './parsers/codama-parser.js';

/** IDL format detected by the parser */
export type IdlFormat = 'anchor' | 'shank' | 'codama';

/**
 * Detects the format of a raw IDL JSON object.
 */
export function detectIdlFormat(idl: any): IdlFormat {
  if (isCodamaIDL(idl)) return 'codama';
  if (isShankIDL(idl)) return 'shank';
  return 'anchor';
}

/**
 * Unified IDL parser — detects the format and parses into a normalized ParsedIDL.
 * This is the main entry point for IDL parsing across all formats.
 *
 * @param rawIdl - Raw IDL JSON object (Anchor, Shank, or Codama format)
 * @returns A normalized ParsedIDL ready for schema generation and decoding
 */
export function parseAnyIDL(rawIdl: Record<string, unknown>): { parsed: ParsedIDL; format: IdlFormat } {
  const format = detectIdlFormat(rawIdl);

  switch (format) {
    case 'codama':
      return { parsed: parseCodamaIDL(rawIdl as unknown as CodamaIDL), format };
    case 'shank':
      return { parsed: parseShankIDL(rawIdl as unknown as ShankIDL), format };
    case 'anchor':
    default:
      return { parsed: parseIDL(rawIdl as unknown as AnchorIDL), format };
  }
}
