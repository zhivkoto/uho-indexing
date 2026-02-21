/**
 * Uho — Token Transfer Decoder
 *
 * Cross-cutting decoder that automatically detects and decodes SPL Token
 * transfer instructions from ANY Solana transaction. Handles both top-level
 * and inner (CPI) instructions for both Token Program and Token-2022.
 *
 * Supported instruction types:
 * - Transfer (discriminant 3)
 * - TransferChecked (discriminant 12)
 * - MintTo (discriminant 7)
 * - Burn (discriminant 8)
 * - MintToChecked (discriminant 14)
 * - BurnChecked (discriminant 15)
 */

import bs58 from 'bs58';
import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import type { DecodedTokenTransfer } from '../core/types.js';

// =============================================================================
// Constants
// =============================================================================

/** SPL Token Program ID */
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** SPL Token-2022 Program ID */
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** Set of both token program IDs for quick lookup */
const TOKEN_PROGRAM_IDS = new Set([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]);

/**
 * Instruction discriminant → type name mapping.
 * SPL Token uses single-byte discriminants.
 */
const INSTRUCTION_TYPES: Record<number, string> = {
  3: 'transfer',
  7: 'mintTo',
  8: 'burn',
  12: 'transferChecked',
  14: 'mintToChecked',
  15: 'burnChecked',
};

// =============================================================================
// Token Transfer Decoder
// =============================================================================

export class TokenTransferDecoder {
  /**
   * Decodes all token transfer instructions from a parsed transaction.
   * Scans both top-level and inner (CPI) instructions.
   */
  decodeTransaction(tx: ParsedTransactionWithMeta): DecodedTokenTransfer[] {
    const results: DecodedTokenTransfer[] = [];
    const txSignature = tx.transaction.signatures[0];
    const slot = tx.slot;
    const blockTime = tx.blockTime ?? null;
    const message = tx.transaction.message;

    // Check top-level instructions
    for (let i = 0; i < message.instructions.length; i++) {
      const ix = message.instructions[i] as any;

      // Handle parsed instructions (Solana's built-in token parsing)
      if (ix.parsed && ix.program === 'spl-token') {
        const transfer = this.decodeParsedInstruction(ix, slot, blockTime, txSignature, i, null);
        if (transfer) results.push(transfer);
        continue;
      }

      // Handle raw (unparsed) instructions
      if (!ix.data || !ix.programId) continue;
      const programId = typeof ix.programId === 'string' ? ix.programId : ix.programId.toBase58();
      if (!TOKEN_PROGRAM_IDS.has(programId)) continue;

      const accounts = (ix.accounts ?? []).map((a: any) => a.toBase58?.() ?? String(a));
      const transfer = this.decodeRawInstruction(ix.data, programId, accounts, slot, blockTime, txSignature, i, null);
      if (transfer) results.push(transfer);
    }

    // Check inner (CPI) instructions
    const innerInstructions = tx.meta?.innerInstructions ?? [];
    for (const inner of innerInstructions) {
      for (let j = 0; j < inner.instructions.length; j++) {
        const ix = inner.instructions[j] as any;

        // Handle parsed inner instructions
        if (ix.parsed && ix.program === 'spl-token') {
          const transfer = this.decodeParsedInstruction(ix, slot, blockTime, txSignature, inner.index, j);
          if (transfer) results.push(transfer);
          continue;
        }

        // Handle raw inner instructions
        if (!ix.data || !ix.programId) continue;
        const programId = typeof ix.programId === 'string' ? ix.programId : ix.programId.toBase58();
        if (!TOKEN_PROGRAM_IDS.has(programId)) continue;

        const accounts = (ix.accounts ?? []).map((a: any) => a.toBase58?.() ?? String(a));
        const transfer = this.decodeRawInstruction(ix.data, programId, accounts, slot, blockTime, txSignature, inner.index, j);
        if (transfer) results.push(transfer);
      }
    }

    return results;
  }

  /**
   * Decodes a Solana-parsed token instruction into a DecodedTokenTransfer.
   * Solana's getParsedTransaction returns pre-parsed token instructions
   * with type, info fields.
   */
  private decodeParsedInstruction(
    ix: any,
    slot: number,
    blockTime: number | null,
    txSignature: string,
    ixIndex: number,
    innerIxIndex: number | null
  ): DecodedTokenTransfer | null {
    const parsed = ix.parsed;
    if (!parsed || typeof parsed !== 'object') return null;

    const type = parsed.type as string;
    const info = parsed.info as Record<string, unknown>;
    if (!info) return null;

    const programId = typeof ix.programId === 'string'
      ? ix.programId
      : ix.programId?.toBase58?.() ?? TOKEN_PROGRAM_ID;

    switch (type) {
      case 'transfer':
        return {
          programId,
          instructionType: 'transfer',
          source: String(info.source ?? ''),
          destination: String(info.destination ?? ''),
          authority: String(info.authority ?? ''),
          mint: null,
          amount: String(info.amount ?? '0'),
          decimals: null,
          slot,
          blockTime,
          txSignature,
          ixIndex,
          innerIxIndex,
        };

      case 'transferChecked':
        return {
          programId,
          instructionType: 'transferChecked',
          source: String(info.source ?? ''),
          destination: String(info.destination ?? ''),
          authority: String(info.authority ?? ''),
          mint: String(info.mint ?? ''),
          amount: String(info.tokenAmount && typeof info.tokenAmount === 'object'
            ? (info.tokenAmount as any).amount ?? '0'
            : info.amount ?? '0'),
          decimals: info.tokenAmount && typeof info.tokenAmount === 'object'
            ? Number((info.tokenAmount as any).decimals ?? 0)
            : null,
          slot,
          blockTime,
          txSignature,
          ixIndex,
          innerIxIndex,
        };

      case 'mintTo':
        return {
          programId,
          instructionType: 'mintTo',
          source: '',
          destination: String(info.account ?? ''),
          authority: String(info.mintAuthority ?? ''),
          mint: String(info.mint ?? ''),
          amount: String(info.amount ?? '0'),
          decimals: null,
          slot,
          blockTime,
          txSignature,
          ixIndex,
          innerIxIndex,
        };

      case 'burn':
        return {
          programId,
          instructionType: 'burn',
          source: String(info.account ?? ''),
          destination: '',
          authority: String(info.authority ?? ''),
          mint: String(info.mint ?? ''),
          amount: String(info.amount ?? '0'),
          decimals: null,
          slot,
          blockTime,
          txSignature,
          ixIndex,
          innerIxIndex,
        };

      case 'mintToChecked':
        return {
          programId,
          instructionType: 'mintTo',
          source: '',
          destination: String(info.account ?? ''),
          authority: String(info.mintAuthority ?? ''),
          mint: String(info.mint ?? ''),
          amount: String(info.tokenAmount && typeof info.tokenAmount === 'object'
            ? (info.tokenAmount as any).amount ?? '0'
            : info.amount ?? '0'),
          decimals: info.tokenAmount && typeof info.tokenAmount === 'object'
            ? Number((info.tokenAmount as any).decimals ?? 0)
            : null,
          slot,
          blockTime,
          txSignature,
          ixIndex,
          innerIxIndex,
        };

      case 'burnChecked':
        return {
          programId,
          instructionType: 'burn',
          source: String(info.account ?? ''),
          destination: '',
          authority: String(info.authority ?? ''),
          mint: String(info.mint ?? ''),
          amount: String(info.tokenAmount && typeof info.tokenAmount === 'object'
            ? (info.tokenAmount as any).amount ?? '0'
            : info.amount ?? '0'),
          decimals: info.tokenAmount && typeof info.tokenAmount === 'object'
            ? Number((info.tokenAmount as any).decimals ?? 0)
            : null,
          slot,
          blockTime,
          txSignature,
          ixIndex,
          innerIxIndex,
        };

      default:
        return null;
    }
  }

  /**
   * Decodes a raw (base58-encoded) token instruction into a DecodedTokenTransfer.
   * Used when Solana's parser doesn't parse the instruction.
   */
  private decodeRawInstruction(
    dataBase58: string,
    programId: string,
    accountPubkeys: string[],
    slot: number,
    blockTime: number | null,
    txSignature: string,
    ixIndex: number,
    innerIxIndex: number | null
  ): DecodedTokenTransfer | null {
    let data: Buffer;
    try {
      data = Buffer.from(bs58.decode(dataBase58));
    } catch {
      return null;
    }

    if (data.length < 1) return null;

    const discriminant = data[0];
    const instructionType = INSTRUCTION_TYPES[discriminant];
    if (!instructionType) return null;

    try {
      switch (discriminant) {
        case 3: { // Transfer: [u8 disc, u64 amount] + accounts: [source, dest, authority]
          if (data.length < 9 || accountPubkeys.length < 3) return null;
          const amount = data.readBigUInt64LE(1).toString();
          return {
            programId,
            instructionType: 'transfer',
            source: accountPubkeys[0],
            destination: accountPubkeys[1],
            authority: accountPubkeys[2],
            mint: null,
            amount,
            decimals: null,
            slot, blockTime, txSignature, ixIndex, innerIxIndex,
          };
        }

        case 12: { // TransferChecked: [u8 disc, u64 amount, u8 decimals] + accounts: [source, mint, dest, authority]
          if (data.length < 10 || accountPubkeys.length < 4) return null;
          const amount = data.readBigUInt64LE(1).toString();
          const decimals = data[9];
          return {
            programId,
            instructionType: 'transferChecked',
            source: accountPubkeys[0],
            destination: accountPubkeys[2],
            authority: accountPubkeys[3],
            mint: accountPubkeys[1],
            amount,
            decimals,
            slot, blockTime, txSignature, ixIndex, innerIxIndex,
          };
        }

        case 7: { // MintTo: [u8 disc, u64 amount] + accounts: [mint, account, mintAuthority]
          if (data.length < 9 || accountPubkeys.length < 3) return null;
          const amount = data.readBigUInt64LE(1).toString();
          return {
            programId,
            instructionType: 'mintTo',
            source: '',
            destination: accountPubkeys[1],
            authority: accountPubkeys[2],
            mint: accountPubkeys[0],
            amount,
            decimals: null,
            slot, blockTime, txSignature, ixIndex, innerIxIndex,
          };
        }

        case 8: { // Burn: [u8 disc, u64 amount] + accounts: [account, mint, authority]
          if (data.length < 9 || accountPubkeys.length < 3) return null;
          const amount = data.readBigUInt64LE(1).toString();
          return {
            programId,
            instructionType: 'burn',
            source: accountPubkeys[0],
            destination: '',
            authority: accountPubkeys[2],
            mint: accountPubkeys[1],
            amount,
            decimals: null,
            slot, blockTime, txSignature, ixIndex, innerIxIndex,
          };
        }

        case 14: { // MintToChecked: [u8 disc, u64 amount, u8 decimals] + accounts: [mint, account, mintAuthority]
          if (data.length < 10 || accountPubkeys.length < 3) return null;
          const amount = data.readBigUInt64LE(1).toString();
          const decimals = data[9];
          return {
            programId,
            instructionType: 'mintTo',
            source: '',
            destination: accountPubkeys[1],
            authority: accountPubkeys[2],
            mint: accountPubkeys[0],
            amount,
            decimals,
            slot, blockTime, txSignature, ixIndex, innerIxIndex,
          };
        }

        case 15: { // BurnChecked: [u8 disc, u64 amount, u8 decimals] + accounts: [account, mint, authority]
          if (data.length < 10 || accountPubkeys.length < 3) return null;
          const amount = data.readBigUInt64LE(1).toString();
          const decimals = data[9];
          return {
            programId,
            instructionType: 'burn',
            source: accountPubkeys[0],
            destination: '',
            authority: accountPubkeys[2],
            mint: accountPubkeys[1],
            amount,
            decimals,
            slot, blockTime, txSignature, ixIndex, innerIxIndex,
          };
        }

        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}
