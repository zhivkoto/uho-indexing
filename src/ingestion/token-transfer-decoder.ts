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
import { scanInstructions, extractParsedInfo, extractTokenAmount, extractTokenDecimals } from './instruction-scanner.js';

// =============================================================================
// Constants
// =============================================================================

/** SPL Token Program ID */
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** SPL Token-2022 Program ID */
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** Set of both token program IDs for quick lookup */
const TOKEN_PROGRAM_IDS = new Set([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]);

// =============================================================================
// Config-Driven Parsed Instruction Mapping
// =============================================================================

interface ParsedTypeConfig {
  instructionType: string;
  sourceField: string | null;   // info field for source; null → empty string
  destField: string | null;     // info field for destination; null → empty string
  authorityField: string;
  hasMint: boolean;
  hasTokenAmount: boolean;      // true for Checked variants (uses tokenAmount)
}

const PARSED_TYPE_MAP: Record<string, ParsedTypeConfig> = {
  transfer:         { instructionType: 'transfer',        sourceField: 'source',  destField: 'destination', authorityField: 'authority',      hasMint: false, hasTokenAmount: false },
  transferChecked:  { instructionType: 'transferChecked',  sourceField: 'source',  destField: 'destination', authorityField: 'authority',      hasMint: true,  hasTokenAmount: true  },
  mintTo:           { instructionType: 'mintTo',           sourceField: null,      destField: 'account',     authorityField: 'mintAuthority',  hasMint: true,  hasTokenAmount: false },
  burn:             { instructionType: 'burn',             sourceField: 'account', destField: null,          authorityField: 'authority',      hasMint: true,  hasTokenAmount: false },
  mintToChecked:    { instructionType: 'mintTo',           sourceField: null,      destField: 'account',     authorityField: 'mintAuthority',  hasMint: true,  hasTokenAmount: true  },
  burnChecked:      { instructionType: 'burn',             sourceField: 'account', destField: null,          authorityField: 'authority',      hasMint: true,  hasTokenAmount: true  },
};

// =============================================================================
// Config-Driven Raw Instruction Mapping
// =============================================================================

interface RawTypeConfig {
  instructionType: string;
  minDataLen: number;
  minAccounts: number;
  hasDecimals: boolean;
  sourceIndex: number | null;    // account index for source; null → empty string
  destIndex: number | null;      // account index for destination; null → empty string
  authorityIndex: number;
  mintIndex: number | null;      // account index for mint; null → mint is null
}

const RAW_TYPE_MAP: Record<number, RawTypeConfig> = {
  3:  { instructionType: 'transfer',        minDataLen: 9,  minAccounts: 3, hasDecimals: false, sourceIndex: 0,    destIndex: 1,    authorityIndex: 2, mintIndex: null },
  12: { instructionType: 'transferChecked', minDataLen: 10, minAccounts: 4, hasDecimals: true,  sourceIndex: 0,    destIndex: 2,    authorityIndex: 3, mintIndex: 1    },
  7:  { instructionType: 'mintTo',          minDataLen: 9,  minAccounts: 3, hasDecimals: false, sourceIndex: null,  destIndex: 1,    authorityIndex: 2, mintIndex: 0    },
  8:  { instructionType: 'burn',            minDataLen: 9,  minAccounts: 3, hasDecimals: false, sourceIndex: 0,    destIndex: null,  authorityIndex: 2, mintIndex: 1    },
  14: { instructionType: 'mintTo',          minDataLen: 10, minAccounts: 3, hasDecimals: true,  sourceIndex: null,  destIndex: 1,    authorityIndex: 2, mintIndex: 0    },
  15: { instructionType: 'burn',            minDataLen: 10, minAccounts: 3, hasDecimals: true,  sourceIndex: 0,    destIndex: null,  authorityIndex: 2, mintIndex: 1    },
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

    scanInstructions(tx, (ix, ixIndex, innerIxIndex) => {
      // Handle parsed instructions (Solana's built-in token parsing)
      if (ix.parsed && ix.program === 'spl-token') {
        const transfer = this.decodeParsedInstruction(ix, slot, blockTime, txSignature, ixIndex, innerIxIndex);
        if (transfer) results.push(transfer);
        return;
      }

      // Handle raw (unparsed) instructions
      if (!ix.data || !ix.programId) return;
      const programId = typeof ix.programId === 'string' ? ix.programId : ix.programId.toBase58();
      if (!TOKEN_PROGRAM_IDS.has(programId)) return;

      const accounts = (ix.accounts ?? []).map((a: any) => a.toBase58?.() ?? String(a));
      const transfer = this.decodeRawInstruction(ix.data, programId, accounts, slot, blockTime, txSignature, ixIndex, innerIxIndex);
      if (transfer) results.push(transfer);
    });

    return results;
  }

  /**
   * Decodes a Solana-parsed token instruction into a DecodedTokenTransfer
   * using the config-driven PARSED_TYPE_MAP.
   */
  private decodeParsedInstruction(
    ix: any,
    slot: number,
    blockTime: number | null,
    txSignature: string,
    ixIndex: number,
    innerIxIndex: number | null
  ): DecodedTokenTransfer | null {
    const parsed = extractParsedInfo(ix);
    if (!parsed) return null;

    const config = PARSED_TYPE_MAP[parsed.type];
    if (!config) return null;

    const { info } = parsed;
    const programId = parsed.programId || TOKEN_PROGRAM_ID;

    return {
      programId,
      instructionType: config.instructionType,
      source: config.sourceField ? String(info[config.sourceField] ?? '') : '',
      destination: config.destField ? String(info[config.destField] ?? '') : '',
      authority: String(info[config.authorityField] ?? ''),
      mint: config.hasMint ? String(info.mint ?? '') : null,
      amount: config.hasTokenAmount ? extractTokenAmount(info) : String(info.amount ?? '0'),
      decimals: config.hasTokenAmount ? extractTokenDecimals(info) : null,
      slot,
      blockTime,
      txSignature,
      ixIndex,
      innerIxIndex,
    };
  }

  /**
   * Decodes a raw (base58-encoded) token instruction into a DecodedTokenTransfer
   * using the config-driven RAW_TYPE_MAP.
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

    const config = RAW_TYPE_MAP[data[0]];
    if (!config) return null;

    try {
      if (data.length < config.minDataLen || accountPubkeys.length < config.minAccounts) return null;

      const amount = data.readBigUInt64LE(1).toString();
      const decimals = config.hasDecimals ? data[9] : null;

      return {
        programId,
        instructionType: config.instructionType,
        source: config.sourceIndex !== null ? accountPubkeys[config.sourceIndex] : '',
        destination: config.destIndex !== null ? accountPubkeys[config.destIndex] : '',
        authority: accountPubkeys[config.authorityIndex],
        mint: config.mintIndex !== null ? accountPubkeys[config.mintIndex] : null,
        amount,
        decimals,
        slot, blockTime, txSignature, ixIndex, innerIxIndex,
      };
    } catch {
      return null;
    }
  }
}
