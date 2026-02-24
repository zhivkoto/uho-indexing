/**
 * Uho — Instruction Scanner
 *
 * Shared utilities for scanning instructions from Solana parsed transactions.
 * Used by both InstructionDecoder and TokenTransferDecoder to avoid duplicating
 * the top-level + inner instruction iteration loops and parsed instruction handling.
 */

import type { ParsedTransactionWithMeta } from '@solana/web3.js';

// =============================================================================
// Instruction Scanning
// =============================================================================

/**
 * Iterates all instructions in a parsed transaction (both top-level and inner/CPI),
 * calling the callback for each one with its position metadata.
 */
export function scanInstructions(
  tx: ParsedTransactionWithMeta,
  callback: (ix: any, ixIndex: number, innerIxIndex: number | null) => void
): void {
  const message = tx.transaction.message;

  // Top-level instructions
  for (let i = 0; i < message.instructions.length; i++) {
    callback(message.instructions[i] as any, i, null);
  }

  // Inner (CPI) instructions
  const innerInstructions = tx.meta?.innerInstructions ?? [];
  for (const inner of innerInstructions) {
    for (let j = 0; j < inner.instructions.length; j++) {
      callback(inner.instructions[j] as any, inner.index, j);
    }
  }
}

// =============================================================================
// Parsed Instruction Helpers
// =============================================================================

/** Extracted fields from a Solana RPC-parsed instruction */
export interface ParsedInstructionInfo {
  type: string;
  info: Record<string, unknown>;
  programId: string;
}

/**
 * Extracts type, info, and programId from a Solana RPC-parsed instruction.
 * Returns null if the instruction doesn't have valid parsed data.
 */
export function extractParsedInfo(ix: any): ParsedInstructionInfo | null {
  const parsed = ix.parsed;
  if (!parsed || typeof parsed !== 'object' || !parsed.type) return null;
  return {
    type: parsed.type as string,
    info: (parsed.info ?? {}) as Record<string, unknown>,
    programId: typeof ix.programId === 'string'
      ? ix.programId
      : ix.programId?.toBase58?.() ?? '',
  };
}

/**
 * Extracts the amount from a parsed token instruction's info.
 * Handles both tokenAmount.amount (Checked variants) and info.amount (base variants).
 */
export function extractTokenAmount(info: Record<string, unknown>): string {
  if (info.tokenAmount && typeof info.tokenAmount === 'object') {
    return String((info.tokenAmount as any).amount ?? '0');
  }
  return String(info.amount ?? '0');
}

/**
 * Extracts decimals from a parsed token instruction's info.
 * Returns the decimals from tokenAmount (Checked variants) or null.
 */
export function extractTokenDecimals(info: Record<string, unknown>): number | null {
  if (info.tokenAmount && typeof info.tokenAmount === 'object') {
    return Number((info.tokenAmount as any).decimals ?? 0);
  }
  return null;
}
