/**
 * Uho — Shared Types
 *
 * All type definitions used across the Uho indexer.
 * These types drive IDL parsing, schema generation, ingestion, and the API layer.
 */

// =============================================================================
// Anchor IDL Types (subset of the Anchor v0.30+ IDL specification)
// =============================================================================

/** Anchor field type — can be a primitive string or a complex type descriptor */
export type AnchorFieldType =
  | string // "u8", "u16", "u32", "u64", "u128", "i8"..."i128", "bool", "string", "pubkey", "bytes"
  | { defined: { name: string } }
  | { vec: AnchorFieldType }
  | { option: AnchorFieldType }
  | { array: [AnchorFieldType, number] };

/** Top-level Anchor IDL structure (v0.30+ format with `address` field) */
export interface AnchorIDL {
  address: string;
  metadata: {
    name: string;
    version: string;
    spec: string;
    description?: string;
  };
  instructions: AnchorInstruction[];
  accounts: AnchorAccountDef[];
  events: AnchorEvent[];
  types: AnchorTypeDef[];
  errors?: AnchorError[];
}

export interface AnchorInstruction {
  name: string;
  discriminator: number[];
  accounts: AnchorInstructionAccount[];
  args: AnchorField[];
}

export interface AnchorInstructionAccount {
  name: string;
  writable: boolean;
  signer: boolean;
}

export interface AnchorAccountDef {
  name: string;
  discriminator: number[];
}

export interface AnchorEvent {
  name: string;
  discriminator: number[];
  fields: AnchorField[];
}

export interface AnchorField {
  name: string;
  type: AnchorFieldType;
}

export interface AnchorTypeDef {
  name: string;
  type: {
    kind: string;
    fields?: AnchorField[];
    variants?: { name: string }[];
  };
}

export interface AnchorError {
  code: number;
  name: string;
  msg: string;
}

// =============================================================================
// Parsed / Normalized Types
// =============================================================================

/** Fully parsed and normalized IDL ready for schema generation and decoding */
export interface ParsedIDL {
  programId: string;
  programName: string;
  events: ParsedEvent[];
  accounts: ParsedAccount[];
  instructions: ParsedInstruction[];
}

/** Normalized event definition with SQL-ready field metadata */
export interface ParsedEvent {
  name: string;
  discriminator: Buffer;
  fields: ParsedField[];
}

/** A single field with both its Anchor type and corresponding PostgreSQL type */
export interface ParsedField {
  name: string;
  type: string;
  sqlType: string;
  nullable: boolean;
}

/** Normalized account definition */
export interface ParsedAccount {
  name: string;
  discriminator: Buffer;
}

/** Normalized instruction definition */
export interface ParsedInstruction {
  name: string;
  discriminator: Buffer;
  accounts: string[];
  args: ParsedField[];
}

// =============================================================================
// Shank IDL Types (used by non-Anchor programs like SolFi)
// =============================================================================

/** Top-level Shank IDL structure */
export interface ShankIDL {
  version: string;
  name: string;
  instructions: ShankInstruction[];
  metadata: {
    origin: string;
    address: string;
  };
}

/** Shank instruction definition */
export interface ShankInstruction {
  name: string;
  accounts: ShankAccount[];
  args: ShankArg[];
  discriminant: {
    type: string; // "u8", "u16", etc.
    value: number;
  };
}

/** Shank account reference */
export interface ShankAccount {
  name: string;
  isMut: boolean;
  isSigner: boolean;
}

/** Shank instruction argument */
export interface ShankArg {
  name: string;
  type: string; // "u64", "u8", "bool", etc.
}

// =============================================================================
// Decoded Instruction (runtime output from instruction decoding)
// =============================================================================

/** A decoded instruction extracted from a Solana transaction */
export interface DecodedInstruction {
  instructionName: string;
  programId: string;
  slot: number;
  blockTime: number | null;
  txSignature: string;
  ixIndex: number;
  accounts: Record<string, string>;  // accountName → pubkey
  args: Record<string, unknown>;     // argName → value
}

// =============================================================================
// Configuration Types
// =============================================================================

/** Full Uho configuration loaded from uho.yaml */
export interface UhoConfig {
  version: number;
  name: string;
  chain: 'solana-mainnet' | 'solana-devnet';
  rpcUrl?: string;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  programs: ProgramConfig[];
  api: {
    port: number;
    host: string;
  };
  ingestion: {
    pollIntervalMs: number;
    batchSize: number;
    startSlot?: number;
  };
}

/** Configuration for a single program to index */
export interface ProgramConfig {
  name: string;
  programId: string;
  idl: string;
  events?: string[];
}

// =============================================================================
// Runtime Types
// =============================================================================

/** A decoded event extracted from a Solana transaction */
export interface DecodedEvent {
  eventName: string;
  programId: string;
  slot: number;
  blockTime: number | null;
  txSignature: string;
  ixIndex: number;
  innerIxIndex: number | null;
  data: Record<string, unknown>;
}

/** Persistent indexer state stored in the _uho_state table */
export interface IndexerState {
  lastSlot: number;
  lastSignature: string | null;
  eventsIndexed: number;
  status: 'running' | 'stopped' | 'error';
  startedAt: Date;
  lastPollAt: Date | null;
  error?: string;
}

/** Poller configuration options */
export interface PollerOptions {
  pollIntervalMs: number;
  batchSize: number;
  startSlot?: number;
  commitment?: 'confirmed' | 'finalized';
}

// =============================================================================
// Platform Types (multi-tenant mode)
// =============================================================================

/** A registered platform user */
export interface PlatformUser {
  id: string;
  email: string;
  passwordHash: string;
  verified: boolean;
  schemaName: string;
  displayName: string | null;
  googleId: string | null;
  githubId: string | null;
  walletAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** An API key record from the database */
export interface ApiKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  label: string;
  lastUsed: Date | null;
  revoked: boolean;
  createdAt: Date;
}

/** A user's configured program */
export interface UserProgram {
  id: string;
  userId: string;
  programId: string;
  name: string;
  idl: Record<string, unknown>;
  chain: string;
  status: 'provisioning' | 'running' | 'paused' | 'error' | 'archived';
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** A specific event/instruction enabled for a user's program */
export interface UserProgramEvent {
  id: string;
  userProgramId: string;
  eventName: string;
  eventType: 'event' | 'instruction';
  enabled: boolean;
  fieldConfig: Record<string, unknown>;
  createdAt: Date;
}

/** A custom aggregation view defined by a user */
export interface UserView {
  id: string;
  userId: string;
  userProgramId: string;
  name: string;
  definition: ViewDefinition;
  materialized: boolean;
  refreshIntervalMs: number;
  lastRefreshed: Date | null;
  status: 'pending' | 'active' | 'error' | 'disabled';
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Declarative view definition for custom aggregations */
export interface ViewDefinition {
  source: string;
  groupBy: string | string[];
  select: Record<string, string | ViewAggregate>;
  where?: Record<string, unknown>;
}

/** Aggregate operators for custom views */
export interface ViewAggregate {
  $count?: string;
  $sum?: string;
  $avg?: string;
  $min?: string;
  $max?: string;
  $first?: string;
  $last?: string;
}

/** A webhook subscription record */
export interface WebhookRecord {
  id: string;
  userId: string;
  userProgramId: string;
  url: string;
  secret: string;
  events: string[];
  filters: Record<string, unknown>;
  active: boolean;
  lastTriggered: Date | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Authenticated user payload attached to requests */
export interface AuthPayload {
  userId: string;
  email: string;
  schemaName: string;
}

/** WebSocket subscription filter */
export interface WsSubscription {
  programs?: string[];
  events?: string[];
  filters?: Record<string, unknown>;
}

/** Usage statistics for a user */
export interface UsageStats {
  programs: number;
  programLimit: number;
  eventsIndexed: number;
  eventLimit: number;
  apiCalls: number;
  apiCallLimit: number;
}

/** PG NOTIFY payload for uho_events channel */
export interface PgNotifyPayload {
  programId: string;
  events: Array<{
    eventName: string;
    slot: number;
    txSignature: string;
    data: Record<string, unknown>;
  }>;
  subscribers: string[];
}

/** Information about a subscriber for the indexer fanout */
export interface SubscriberInfo {
  userId: string;
  schemaName: string;
  programName: string;
  parsedIdl: ParsedIDL;
  enabledEvents: string[];
  rawIdl: Record<string, unknown>;
}

/** Result of writing events to multiple subscriber schemas */
export interface WriteResult {
  totalWritten: number;
  perSubscriber: Record<string, number>;
}
