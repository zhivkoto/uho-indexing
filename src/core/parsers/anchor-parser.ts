/**
 * Uho — Anchor IDL Parser
 *
 * Parses Anchor v0.30+ IDL format into a normalized ParsedIDL representation.
 * Handles events, instructions, accounts, type mapping, and discriminators.
 */

import type {
  AnchorIDL,
  AnchorEvent,
  AnchorField,
  AnchorFieldType,
  ParsedIDL,
  ParsedEvent,
  ParsedField,
  ParsedAccount,
  ParsedInstruction,
} from '../types.js';
import {
  toSnakeCase,
  computeInstructionDiscriminator,
  computeEventDiscriminator,
  PRIMITIVE_TYPE_MAP,
} from '../idl-parser.js';

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
 * Flattens nested Anchor account definitions into a flat list of account names.
 * Handles both simple accounts ({name}) and nested groups ({name, accounts: [...]}).
 */
function flattenAccounts(accounts: any[]): string[] {
  const result: string[] = [];
  for (const acc of accounts) {
    if (acc.accounts && Array.isArray(acc.accounts)) {
      result.push(...flattenAccounts(acc.accounts));
    } else {
      result.push(acc.name);
    }
  }
  return result;
}

/**
 * Parses a complete Anchor IDL into a normalized ParsedIDL.
 * Extracts program metadata, events, accounts, and instructions.
 */
export function parseIDL(idlJson: AnchorIDL): ParsedIDL {
  const programId = idlJson.address;
  const rawName = idlJson.metadata?.name ?? (idlJson as any).name ?? 'unknown_program';
  const programName = toSnakeCase(rawName);

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
  const instructions: ParsedInstruction[] = (idlJson.instructions ?? []).map((ix) => {
    // Use explicit discriminator if present, otherwise compute Anchor sighash
    const discriminator =
      ix.discriminator && ix.discriminator.length === 8
        ? Buffer.from(ix.discriminator)
        : computeInstructionDiscriminator(ix.name);
    return {
      name: ix.name,
      discriminator,
      accounts: flattenAccounts(ix.accounts ?? []),
      args: (ix.args ?? []).map(parseField),
    };
  });

  return {
    programId,
    programName,
    events,
    accounts,
    instructions,
  };
}
