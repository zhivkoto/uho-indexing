/**
 * Uho — Instruction Decoder
 *
 * Decodes program instructions from Solana parsed transactions.
 * Matches programId, checks discriminant bytes, deserializes args,
 * and extracts account pubkeys by index.
 */

import bs58 from 'bs58';
import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import type { ParsedIDL, ParsedInstruction, DecodedInstruction, ParsedField } from '../core/types.js';

// =============================================================================
// Instruction Decoder
// =============================================================================

export class InstructionDecoder {
  private parsedIdl: ParsedIDL;
  private instructions: ParsedInstruction[];

  /**
   * Creates a decoder from a parsed IDL.
   * Stores instruction definitions for full discriminator matching.
   */
  constructor(parsedIdl: ParsedIDL) {
    this.parsedIdl = parsedIdl;
    this.instructions = parsedIdl.instructions.filter((ix) => ix.discriminator.length > 0);
  }

  /**
   * Decodes all matching instructions from a single parsed transaction.
   * Scans both top-level and inner instructions.
   */
  decodeTransaction(tx: ParsedTransactionWithMeta): DecodedInstruction[] {
    const results: DecodedInstruction[] = [];
    const txSignature = tx.transaction.signatures[0];
    const slot = tx.slot;
    const blockTime = tx.blockTime ?? null;
    const programId = this.parsedIdl.programId;

    try {

    const message = tx.transaction.message;

    // Check top-level instructions
    for (let i = 0; i < message.instructions.length; i++) {
      const ix = message.instructions[i];

      // For parsed transactions, instructions can be either PartiallyDecodedInstruction
      // (with `data` as base58 string and `accounts` as PublicKey[]) or ParsedInstruction
      // (already decoded by the RPC). We want the raw ones.
      if (!('data' in ix)) continue; // Skip fully-parsed instructions (e.g., system program)
      if (ix.programId.toBase58() !== programId) continue;

      const decoded = this.decodeInstructionData(ix.data, ix.accounts.map((a: any) => a.toBase58()));
      if (decoded) {
        console.log(`  🔧 Decoded instruction: ${decoded.instructionName}`);
        results.push({
          ...decoded,
          programId,
          slot,
          blockTime,
          txSignature,
          ixIndex: i,
        });
      }
    }

    // Check inner instructions
    const innerInstructions = tx.meta?.innerInstructions ?? [];
    for (const inner of innerInstructions) {
      for (let j = 0; j < inner.instructions.length; j++) {
        const ix = inner.instructions[j];
        if (!('data' in ix)) continue;
        if (ix.programId.toBase58() !== programId) continue;

        const decoded = this.decodeInstructionData(ix.data, ix.accounts.map((a: any) => a.toBase58()));
        if (decoded) {
          results.push({
            ...decoded,
            programId,
            slot,
            blockTime,
            txSignature,
            ixIndex: inner.index,
          });
        }
      }
    }

    } catch (err) {
      console.error(`[InstructionDecoder] Error decoding tx ${txSignature?.slice(0, 12)}...: ${(err as Error).message}`);
      console.error(`[InstructionDecoder] Stack: ${(err as Error).stack?.split('\n').slice(0, 3).join('\n')}`);
    }

    return results;
  }

  /**
   * Decodes instruction data (base58 encoded) against known instruction discriminants.
   * Returns partial DecodedInstruction (without tx context) or null if no match.
   */
  private decodeInstructionData(
    dataBase58: string,
    accountPubkeys: string[]
  ): Pick<DecodedInstruction, 'instructionName' | 'accounts' | 'args'> | null {
    let data: Buffer;
    try {
      data = Buffer.from(bs58.decode(dataBase58));
    } catch {
      return null;
    }

    if (data.length === 0) return null;

    // Match full discriminator (8 bytes for Anchor instructions)
    const ixDef = this.instructions.find((ix) => {
      const disc = ix.discriminator;
      if (data.length < disc.length) return false;
      for (let i = 0; i < disc.length; i++) {
        if (data[i] !== disc[i]) return false;
      }
      return true;
    });
    if (!ixDef) return null;

    // Deserialize args from data after discriminant
    const discSize = ixDef.discriminator.length;
    const args = this.deserializeArgs(data.subarray(discSize), ixDef.args);

    // Map account pubkeys by index to named accounts
    const accounts: Record<string, string> = {};
    for (let i = 0; i < ixDef.accounts.length; i++) {
      accounts[ixDef.accounts[i]] = accountPubkeys[i] ?? 'unknown';
    }

    return {
      instructionName: ixDef.name,
      accounts,
      args,
    };
  }

  /**
   * Deserializes instruction arguments from a binary buffer.
   * Reads fields sequentially based on their type definitions.
   */
  private deserializeArgs(data: Buffer, fields: ParsedField[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    let offset = 0;

    for (const field of fields) {
      const { value, bytesRead } = readField(data, offset, field.type);
      result[field.name] = value;
      offset += bytesRead;
    }

    return result;
  }
}

// =============================================================================
// Binary Field Readers
// =============================================================================

/**
 * Reads a single field value from a binary buffer at the given offset.
 * Returns the value and number of bytes consumed.
 */
function readField(
  data: Buffer,
  offset: number,
  type: string
): { value: unknown; bytesRead: number } {
  if (offset >= data.length) {
    return { value: null, bytesRead: 0 };
  }

  switch (type) {
    case 'u8':
      return { value: data.readUInt8(offset), bytesRead: 1 };
    case 'u16':
      return { value: data.readUInt16LE(offset), bytesRead: 2 };
    case 'u32':
      return { value: data.readUInt32LE(offset), bytesRead: 4 };
    case 'u64':
      return { value: data.readBigUInt64LE(offset).toString(), bytesRead: 8 };
    case 'u128': {
      const lo = data.readBigUInt64LE(offset);
      const hi = data.readBigUInt64LE(offset + 8);
      const val = (hi << 64n) | lo;
      return { value: val.toString(), bytesRead: 16 };
    }
    case 'i8':
      return { value: data.readInt8(offset), bytesRead: 1 };
    case 'i16':
      return { value: data.readInt16LE(offset), bytesRead: 2 };
    case 'i32':
      return { value: data.readInt32LE(offset), bytesRead: 4 };
    case 'i64':
      return { value: data.readBigInt64LE(offset).toString(), bytesRead: 8 };
    case 'bool':
      return { value: data.readUInt8(offset) !== 0, bytesRead: 1 };
    case 'pubkey':
    case 'publicKey':
      return { value: bs58.encode(data.subarray(offset, offset + 32)), bytesRead: 32 };
    default:
      // Unknown type — return remaining data as hex
      return { value: '0x' + data.subarray(offset).toString('hex'), bytesRead: data.length - offset };
  }
}
