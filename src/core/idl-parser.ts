/**
 * Uho — IDL Parser
 *
 * Parses Anchor v0.30+ IDL JSON into normalized event, account, and instruction
 * definitions. Handles type mapping from Anchor types to PostgreSQL column types,
 * camelCase→snake_case conversion, and discriminator normalization.
 */

import { createHash } from 'crypto';
import type {
  AnchorIDL,
  AnchorEvent,
  AnchorField,
  AnchorFieldType,
  ShankIDL,
  ParsedIDL,
  ParsedEvent,
  ParsedField,
  ParsedAccount,
  ParsedInstruction,
} from './types.js';

// =============================================================================
// Type Mapping: Anchor → PostgreSQL
// =============================================================================

/**
 * Maps an Anchor primitive type string to a PostgreSQL column type.
 * Complex types (vec, option, defined, array) are handled separately.
 */
const PRIMITIVE_TYPE_MAP: Record<string, { sqlType: string; nullable: boolean }> = {
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

// =============================================================================
// Utility Functions
// =============================================================================

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

// =============================================================================
// Type Resolution
// =============================================================================

/**
 * Resolves an Anchor field type to a PostgreSQL type and nullability.
 * Handles primitives, options, vectors, arrays, and defined (complex) types.
 */
export function anchorTypeToSql(type: AnchorFieldType): { sqlType: string; nullable: boolean } {
  // Primitive types (string-based)
  if (typeof type === 'string') {
    const mapped = PRIMITIVE_TYPE_MAP[type];
    if (mapped) return mapped;
    // Unknown primitive — fall back to JSONB
    return { sqlType: 'JSONB', nullable: false };
  }

  // Option<T> — same SQL type as T but nullable
  if ('option' in type) {
    const inner = anchorTypeToSql(type.option);
    return { sqlType: inner.sqlType, nullable: true };
  }

  // Vec<T> — stored as JSONB array
  if ('vec' in type) {
    return { sqlType: 'JSONB', nullable: false };
  }

  // Fixed-size array [T; N] — stored as JSONB
  if ('array' in type) {
    return { sqlType: 'JSONB', nullable: false };
  }

  // Defined (complex/struct) type — stored as JSONB
  if ('defined' in type) {
    return { sqlType: 'JSONB', nullable: false };
  }

  // Fallback for unknown type shapes
  return { sqlType: 'JSONB', nullable: false };
}

/**
 * Returns a human-readable normalized type string for display/debugging.
 */
function normalizeTypeName(type: AnchorFieldType): string {
  if (typeof type === 'string') return type;
  if ('option' in type) return `option<${normalizeTypeName(type.option)}>`;
  if ('vec' in type) return `vec<${normalizeTypeName(type.vec)}>`;
  if ('array' in type) return `array<${normalizeTypeName(type.array[0])}, ${type.array[1]}>`;
  if ('defined' in type) return `defined<${type.defined.name}>`;
  return 'unknown';
}

// =============================================================================
// Field Parsing
// =============================================================================

/**
 * Parses a single Anchor field into a normalized ParsedField.
 * Converts field name to snake_case and resolves the SQL type.
 */
export function parseField(field: AnchorField): ParsedField {
  const { sqlType, nullable } = anchorTypeToSql(field.type);
  return {
    name: toSnakeCase(field.name),
    type: normalizeTypeName(field.type),
    sqlType,
    nullable,
  };
}

// =============================================================================
// Event Parsing
// =============================================================================

/**
 * Parses an Anchor event definition into a normalized ParsedEvent.
 * Uses the IDL discriminator if present, otherwise computes it from the event name.
 * In v0.30+ IDLs, event fields may be stored in the `types` array rather than on the event itself.
 */
export function parseEvent(event: AnchorEvent, typesLookup?: Map<string, AnchorField[]>): ParsedEvent {
  const discriminator =
    event.discriminator && event.discriminator.length === 8
      ? Buffer.from(event.discriminator)
      : computeEventDiscriminator(event.name);

  // v0.30+ format: fields might be on the event or in the types array
  const fields = event.fields
    ? event.fields.map(parseField)
    : (typesLookup?.get(event.name) ?? []).map(parseField);

  return {
    name: event.name,
    discriminator,
    fields,
  };
}

// =============================================================================
// Full IDL Parsing
// =============================================================================

/**
 * Parses a complete Anchor IDL into a normalized ParsedIDL.
 * Extracts program metadata, events, accounts, and instructions.
 */
export function parseIDL(idlJson: AnchorIDL): ParsedIDL {
  const programId = idlJson.address;
  const programName = toSnakeCase(idlJson.metadata.name);

  // Build types lookup for v0.30+ IDLs where event fields are in the types array
  const typesLookup = new Map<string, AnchorField[]>();
  for (const t of (idlJson.types ?? [])) {
    if (t.type?.kind === 'struct' && t.type.fields) {
      typesLookup.set(t.name, t.type.fields);
    }
  }

  // Parse events (pass types lookup for v0.30+ format)
  const events: ParsedEvent[] = (idlJson.events ?? []).map((e) => parseEvent(e, typesLookup));

  // Parse accounts
  const accounts: ParsedAccount[] = (idlJson.accounts ?? []).map((acc) => ({
    name: acc.name,
    discriminator:
      acc.discriminator && acc.discriminator.length === 8
        ? Buffer.from(acc.discriminator)
        : Buffer.alloc(8),
  }));

  // Parse instructions
  const instructions: ParsedInstruction[] = (idlJson.instructions ?? []).map((ix) => ({
    name: ix.name,
    discriminator:
      ix.discriminator && ix.discriminator.length === 8
        ? Buffer.from(ix.discriminator)
        : Buffer.alloc(8),
    accounts: ix.accounts.map((a) => a.name),
    args: ix.args.map(parseField),
  }));

  return {
    programId,
    programName,
    events,
    accounts,
    instructions,
  };
}

// =============================================================================
// Shank IDL Detection & Parsing
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

    // Parse args using existing PRIMITIVE_TYPE_MAP
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

/**
 * Returns the byte size for a Shank discriminant type string.
 */
function discriminantByteSize(type: string): number {
  switch (type) {
    case 'u8': return 1;
    case 'u16': return 2;
    case 'u32': return 4;
    default: return 1;
  }
}
