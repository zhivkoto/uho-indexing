/**
 * Uho — Shank IDL Parser
 *
 * Parses Shank-format IDLs (used by SPL Token, Token-2022, etc.)
 * into a normalized ParsedIDL representation.
 */

import type {
  ShankIDL,
  ParsedIDL,
  ParsedField,
  ParsedInstruction,
} from '../types.js';
import { toSnakeCase, PRIMITIVE_TYPE_MAP, discriminantByteSize } from '../idl-parser.js';

// =============================================================================
// Shank IDL Detection
// =============================================================================

/**
 * Detects whether a JSON object is a Shank-format IDL.
 * Shank IDLs have metadata.origin === "shank" and lack Anchor markers
 * like `address` at the top level or `metadata.spec`.
 */
export function isShankIDL(idl: any): idl is ShankIDL {
  if (idl?.metadata?.origin === 'shank') return true;
  // Also detect by absence of Anchor markers: no top-level `address`, has `discriminant` on instructions
  if (!idl?.address && idl?.instructions?.[0]?.discriminant) return true;
  return false;
}

// =============================================================================
// Shank IDL Parsing
// =============================================================================

/**
 * Parses a Shank-format IDL into a normalized ParsedIDL.
 * Extracts instructions with discriminants, accounts, and args.
 * Shank IDLs typically don't have events — instructions are the primary target.
 */
export function parseShankIDL(idl: ShankIDL): ParsedIDL {
  const programId = idl.metadata.address;
  const programName = toSnakeCase(idl.name);

  // Parse instructions from Shank format
  const instructions: ParsedInstruction[] = idl.instructions.map((ix) => {
    // Build discriminator buffer from the discriminant
    const discSize = discriminantByteSize(ix.discriminant.type);
    const discBuf = Buffer.alloc(discSize);
    if (discSize === 1) {
      discBuf.writeUInt8(ix.discriminant.value);
    } else if (discSize === 2) {
      discBuf.writeUInt16LE(ix.discriminant.value);
    } else if (discSize === 4) {
      discBuf.writeUInt32LE(ix.discriminant.value);
    }

    // Parse args using PRIMITIVE_TYPE_MAP
    const args: ParsedField[] = ix.args.map((arg) => {
      const mapped = PRIMITIVE_TYPE_MAP[arg.type];
      return {
        name: toSnakeCase(arg.name),
        type: arg.type,
        sqlType: mapped?.sqlType ?? 'JSONB',
        nullable: mapped?.nullable ?? false,
      };
    });

    // Extract account names
    const accounts = ix.accounts.map((a) => a.name);

    return {
      name: ix.name,
      discriminator: discBuf,
      accounts,
      args,
    };
  });

  return {
    programId,
    programName,
    events: [],       // Shank IDLs don't have events
    accounts: [],     // Shank IDLs don't define account structs
    instructions,
  };
}
