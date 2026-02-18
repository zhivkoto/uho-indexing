/**
 * Uho — CPI Transfer Decoder
 *
 * Stateless decoder that extracts SPL Token `transfer` and `transferChecked`
 * instructions from `meta.innerInstructions` of parsed Solana transactions.
 *
 * Supports both SPL Token (TokenkegQ...) and Token-2022 (Tokenz...) programs.
 * Decodes from raw instruction data bytes for deterministic, RPC-version-independent results.
 */

import bs58 from 'bs58';
import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import type { DecodedCpiTransfer } from '../core/types.js';

// =============================================================================
// Constants
// =============================================================================

/** SPL Token program ID */
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** Token-2022 program ID */
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** Set of known token program IDs for fast lookup */
const TOKEN_PROGRAM_IDS = new Set([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]);

/** SPL Token instruction discriminators */
const TRANSFER_DISCRIMINATOR = 3;
const TRANSFER_CHECKED_DISCRIMINATOR = 12;

// =============================================================================
// CPI Transfer Decoder
// =============================================================================

export class CpiTransferDecoder {
  /**
   * Decodes all inner CPI SPL Token transfers from a parsed transaction.
   *
   * @param tx - The full parsed transaction with metadata
   * @param programId - The user's indexed program ID (used to scope which parent ixs to inspect)
   * @returns Array of decoded CPI transfers
   */
  decodeTransaction(
    tx: ParsedTransactionWithMeta,
    programId: string
  ): DecodedCpiTransfer[] {
    const results: DecodedCpiTransfer[] = [];

    // Guard: no inner instructions available
    if (!tx.meta?.innerInstructions?.length) return results;

    const txSignature = tx.transaction.signatures[0];
    const slot = tx.slot;
    const blockTime = tx.blockTime ?? null;
    const accountKeys = tx.transaction.message.accountKeys;

    // Build a set of top-level instruction indices that belong to the user's program
    const programIxIndices = new Set<number>();
    for (let i = 0; i < tx.transaction.message.instructions.length; i++) {
      const ix = tx.transaction.message.instructions[i];
      const ixProgramId = 'programId' in ix
        ? (ix.programId as any).toBase58?.() ?? String(ix.programId)
        : '';
      if (ixProgramId === programId) {
        programIxIndices.add(i);
      }
    }

    // Process inner instructions only for parent ixs matching the user's program
    for (const innerGroup of tx.meta.innerInstructions) {
      if (!programIxIndices.has(innerGroup.index)) continue;

      for (let j = 0; j < innerGroup.instructions.length; j++) {
        const innerIx = innerGroup.instructions[j] as any;

        // Determine inner instruction's program ID
        const innerProgramId = innerIx.programId?.toBase58?.()
          ?? String(innerIx.programId ?? '');

        if (!TOKEN_PROGRAM_IDS.has(innerProgramId)) continue;

        // Try to decode the instruction data
        try {
          const transfer = this.decodeTokenInstruction(
            innerIx,
            accountKeys,
            {
              txSignature,
              slot,
              blockTime,
              programId,
              parentIxIndex: innerGroup.index,
              innerIxIndex: j,
              tokenProgramId: innerProgramId,
            }
          );
          if (transfer) {
            results.push(transfer);
          }
        } catch (err) {
          // Malformed instruction data — skip silently
          // This handles edge cases like truncated data or unknown instruction variants
        }
      }
    }

    return results;
  }

  /**
   * Decodes a single inner instruction as an SPL Token transfer or transferChecked.
   * Returns null if the instruction is not a recognized transfer type.
   */
  private decodeTokenInstruction(
    ix: any,
    accountKeys: any[],
    context: {
      txSignature: string;
      slot: number;
      blockTime: number | null;
      programId: string;
      parentIxIndex: number;
      innerIxIndex: number;
      tokenProgramId: string;
    }
  ): DecodedCpiTransfer | null {
    // Get the raw instruction data
    let data: Buffer;
    if ('data' in ix && typeof ix.data === 'string') {
      try {
        data = Buffer.from(bs58.decode(ix.data));
      } catch {
        return null;
      }
    } else {
      return null;
    }

    if (data.length === 0) return null;

    const discriminator = data[0];

    // Resolve account pubkeys from the instruction's accounts array
    const accounts: string[] = (ix.accounts ?? []).map((acc: any) =>
      acc?.toBase58?.() ?? String(acc)
    );

    if (discriminator === TRANSFER_DISCRIMINATOR) {
      return this.decodeTransfer(data, accounts, context);
    }

    if (discriminator === TRANSFER_CHECKED_DISCRIMINATOR) {
      return this.decodeTransferChecked(data, accounts, context);
    }

    return null;
  }

  /**
   * Decodes an SPL Token `transfer` instruction.
   *
   * Layout:
   *   [0]    u8  discriminator (3)
   *   [1..9] u64 amount (little-endian)
   *
   * Accounts: [source, destination, authority]
   */
  private decodeTransfer(
    data: Buffer,
    accounts: string[],
    context: {
      txSignature: string;
      slot: number;
      blockTime: number | null;
      programId: string;
      parentIxIndex: number;
      innerIxIndex: number;
      tokenProgramId: string;
    }
  ): DecodedCpiTransfer | null {
    // Need at least 9 bytes (1 disc + 8 amount) and 3 accounts
    if (data.length < 9 || accounts.length < 3) return null;

    const amount = data.readBigUInt64LE(1);

    return {
      txSignature: context.txSignature,
      slot: context.slot,
      blockTime: context.blockTime,
      programId: context.programId,
      parentIxIndex: context.parentIxIndex,
      innerIxIndex: context.innerIxIndex,
      transferType: 'transfer',
      fromAccount: accounts[0],
      toAccount: accounts[1],
      authority: accounts[2],
      amount: amount.toString(),
      mint: null,        // transfer doesn't include mint
      decimals: null,    // transfer doesn't include decimals
      tokenProgramId: context.tokenProgramId,
    };
  }

  /**
   * Decodes an SPL Token `transferChecked` instruction.
   *
   * Layout:
   *   [0]    u8  discriminator (12)
   *   [1..9] u64 amount (little-endian)
   *   [9]    u8  decimals
   *
   * Accounts: [source, mint, destination, authority]
   */
  private decodeTransferChecked(
    data: Buffer,
    accounts: string[],
    context: {
      txSignature: string;
      slot: number;
      blockTime: number | null;
      programId: string;
      parentIxIndex: number;
      innerIxIndex: number;
      tokenProgramId: string;
    }
  ): DecodedCpiTransfer | null {
    // Need at least 10 bytes (1 disc + 8 amount + 1 decimals) and 4 accounts
    if (data.length < 10 || accounts.length < 4) return null;

    const amount = data.readBigUInt64LE(1);
    const decimals = data[9];

    return {
      txSignature: context.txSignature,
      slot: context.slot,
      blockTime: context.blockTime,
      programId: context.programId,
      parentIxIndex: context.parentIxIndex,
      innerIxIndex: context.innerIxIndex,
      transferType: 'transferChecked',
      fromAccount: accounts[0],
      toAccount: accounts[2],   // Note: mint is accounts[1]
      authority: accounts[3],
      amount: amount.toString(),
      mint: accounts[1],
      decimals,
      tokenProgramId: context.tokenProgramId,
    };
  }
}
