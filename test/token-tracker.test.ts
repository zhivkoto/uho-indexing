/**
 * Uho — Token Transfer Decoder Tests
 *
 * Tests for the cross-cutting token transfer decoder that extracts SPL Token
 * transfer instructions from Solana transactions.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TokenTransferDecoder } from '../src/ingestion/token-transfer-decoder.js';
import bs58 from 'bs58';

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

// =============================================================================
// Helpers — Mock Transaction Builders
// =============================================================================

/**
 * Creates a minimal parsed transaction with the given instructions.
 */
function makeTx(opts: {
  instructions?: any[];
  innerInstructions?: any[];
  slot?: number;
  blockTime?: number;
  signature?: string;
}): any {
  return {
    slot: opts.slot ?? 100,
    blockTime: opts.blockTime ?? 1700000000,
    transaction: {
      signatures: [opts.signature ?? 'test-sig-abc123'],
      message: {
        instructions: opts.instructions ?? [],
      },
    },
    meta: {
      innerInstructions: opts.innerInstructions ?? [],
    },
  };
}

/**
 * Creates a Solana-parsed transfer instruction (as returned by getParsedTransaction).
 */
function makeParsedTransferIx(opts: {
  type: string;
  info: Record<string, unknown>;
  programId?: string;
}): any {
  return {
    parsed: {
      type: opts.type,
      info: opts.info,
    },
    program: 'spl-token',
    programId: opts.programId ?? TOKEN_PROGRAM_ID,
  };
}

/**
 * Creates a raw (base58-encoded) token instruction.
 * Builds the instruction data buffer from discriminant + u64 amount.
 */
function makeRawTransferIx(opts: {
  discriminant: number;
  amount: bigint;
  decimals?: number;
  programId?: string;
  accounts: string[];
}): any {
  const hasDecimals = opts.decimals !== undefined;
  const buf = Buffer.alloc(hasDecimals ? 10 : 9);
  buf.writeUInt8(opts.discriminant, 0);
  buf.writeBigUInt64LE(opts.amount, 1);
  if (hasDecimals) {
    buf.writeUInt8(opts.decimals!, 9);
  }

  return {
    data: bs58.encode(buf),
    programId: opts.programId ?? TOKEN_PROGRAM_ID,
    accounts: opts.accounts,
  };
}

// =============================================================================
// TokenTransferDecoder — Construction
// =============================================================================

describe('TokenTransferDecoder', () => {
  it('constructs without errors', () => {
    const decoder = new TokenTransferDecoder();
    expect(decoder).toBeDefined();
  });

  // ===========================================================================
  // Empty / No Transfers
  // ===========================================================================

  it('returns empty array for transaction with no token instructions', () => {
    const decoder = new TokenTransferDecoder();
    const tx = makeTx({
      instructions: [
        { programId: '11111111111111111111111111111111', data: 'abc', accounts: [] },
      ],
    });
    const results = decoder.decodeTransaction(tx);
    expect(results).toEqual([]);
  });

  it('returns empty array for transaction with null meta', () => {
    const decoder = new TokenTransferDecoder();
    const tx = {
      slot: 100,
      blockTime: 1700000000,
      transaction: {
        signatures: ['sig1'],
        message: { instructions: [] },
      },
      meta: null,
    };
    const results = decoder.decodeTransaction(tx as any);
    expect(results).toEqual([]);
  });

  // ===========================================================================
  // Parsed Instructions (Solana-parsed format)
  // ===========================================================================

  describe('parsed instructions', () => {
    it('decodes a parsed transfer', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeParsedTransferIx({
            type: 'transfer',
            info: {
              source: 'SourceAccount111',
              destination: 'DestAccount222',
              authority: 'Authority333',
              amount: '1000000',
            },
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].instructionType).toBe('transfer');
      expect(results[0].source).toBe('SourceAccount111');
      expect(results[0].destination).toBe('DestAccount222');
      expect(results[0].authority).toBe('Authority333');
      expect(results[0].amount).toBe('1000000');
      expect(results[0].mint).toBeNull();
      expect(results[0].decimals).toBeNull();
      expect(results[0].slot).toBe(100);
      expect(results[0].ixIndex).toBe(0);
      expect(results[0].innerIxIndex).toBeNull();
    });

    it('decodes a parsed transferChecked', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeParsedTransferIx({
            type: 'transferChecked',
            info: {
              source: 'Src111',
              destination: 'Dst222',
              authority: 'Auth333',
              mint: 'Mint444',
              tokenAmount: { amount: '5000000', decimals: 6 },
            },
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].instructionType).toBe('transferChecked');
      expect(results[0].mint).toBe('Mint444');
      expect(results[0].amount).toBe('5000000');
      expect(results[0].decimals).toBe(6);
    });

    it('decodes a parsed mintTo', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeParsedTransferIx({
            type: 'mintTo',
            info: {
              account: 'DestAccount111',
              mint: 'MintAddr222',
              mintAuthority: 'MintAuth333',
              amount: '999',
            },
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].instructionType).toBe('mintTo');
      expect(results[0].source).toBe('');
      expect(results[0].destination).toBe('DestAccount111');
      expect(results[0].authority).toBe('MintAuth333');
      expect(results[0].mint).toBe('MintAddr222');
    });

    it('decodes a parsed burn', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeParsedTransferIx({
            type: 'burn',
            info: {
              account: 'BurnAccount111',
              mint: 'BurnMint222',
              authority: 'BurnAuth333',
              amount: '500',
            },
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].instructionType).toBe('burn');
      expect(results[0].source).toBe('BurnAccount111');
      expect(results[0].destination).toBe('');
    });

    it('normalizes mintToChecked to mintTo', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeParsedTransferIx({
            type: 'mintToChecked',
            info: {
              account: 'Dest111',
              mint: 'Mint222',
              mintAuthority: 'Auth333',
              tokenAmount: { amount: '100', decimals: 9 },
            },
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].instructionType).toBe('mintTo');
      expect(results[0].decimals).toBe(9);
    });

    it('normalizes burnChecked to burn', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeParsedTransferIx({
            type: 'burnChecked',
            info: {
              account: 'BurnAcc111',
              mint: 'Mint222',
              authority: 'Auth333',
              tokenAmount: { amount: '200', decimals: 6 },
            },
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].instructionType).toBe('burn');
      expect(results[0].decimals).toBe(6);
    });

    it('ignores unknown parsed instruction types', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeParsedTransferIx({
            type: 'initializeAccount',
            info: { account: 'Acc111' },
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results).toEqual([]);
    });
  });

  // ===========================================================================
  // Raw Instructions (base58-encoded)
  // ===========================================================================

  describe('raw instructions', () => {
    it('decodes a raw Transfer (discriminant 3)', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeRawTransferIx({
            discriminant: 3,
            amount: 1000000n,
            accounts: ['SourceAcc', 'DestAcc', 'AuthAcc'],
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].instructionType).toBe('transfer');
      expect(results[0].source).toBe('SourceAcc');
      expect(results[0].destination).toBe('DestAcc');
      expect(results[0].authority).toBe('AuthAcc');
      expect(results[0].amount).toBe('1000000');
      expect(results[0].programId).toBe(TOKEN_PROGRAM_ID);
    });

    it('decodes a raw TransferChecked (discriminant 12)', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeRawTransferIx({
            discriminant: 12,
            amount: 5000000n,
            decimals: 6,
            accounts: ['SrcAcc', 'MintAcc', 'DstAcc', 'AuthAcc'],
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].instructionType).toBe('transferChecked');
      expect(results[0].source).toBe('SrcAcc');
      expect(results[0].mint).toBe('MintAcc');
      expect(results[0].destination).toBe('DstAcc');
      expect(results[0].authority).toBe('AuthAcc');
      expect(results[0].decimals).toBe(6);
    });

    it('decodes a raw MintTo (discriminant 7)', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeRawTransferIx({
            discriminant: 7,
            amount: 999n,
            accounts: ['MintAcc', 'DestAcc', 'MintAuthAcc'],
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].instructionType).toBe('mintTo');
      expect(results[0].mint).toBe('MintAcc');
      expect(results[0].destination).toBe('DestAcc');
    });

    it('decodes a raw Burn (discriminant 8)', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeRawTransferIx({
            discriminant: 8,
            amount: 500n,
            accounts: ['BurnAcc', 'MintAcc', 'AuthAcc'],
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].instructionType).toBe('burn');
      expect(results[0].source).toBe('BurnAcc');
      expect(results[0].mint).toBe('MintAcc');
    });

    it('handles Token-2022 program ID', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeRawTransferIx({
            discriminant: 3,
            amount: 100n,
            programId: TOKEN_2022_PROGRAM_ID,
            accounts: ['Src', 'Dst', 'Auth'],
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].programId).toBe(TOKEN_2022_PROGRAM_ID);
    });

    it('ignores non-token program raw instructions', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeRawTransferIx({
            discriminant: 3,
            amount: 100n,
            programId: '11111111111111111111111111111111',
            accounts: ['Src', 'Dst', 'Auth'],
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results).toEqual([]);
    });

    it('ignores raw instructions with insufficient accounts', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeRawTransferIx({
            discriminant: 3,
            amount: 100n,
            accounts: ['Src', 'Dst'], // Missing authority
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results).toEqual([]);
    });
  });

  // ===========================================================================
  // Inner (CPI) Instructions
  // ===========================================================================

  describe('inner instructions', () => {
    it('decodes parsed inner instructions', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          { programId: 'SomeProgram111', data: 'abc', accounts: [] },
        ],
        innerInstructions: [
          {
            index: 0,
            instructions: [
              makeParsedTransferIx({
                type: 'transfer',
                info: {
                  source: 'InnerSrc',
                  destination: 'InnerDst',
                  authority: 'InnerAuth',
                  amount: '777',
                },
              }),
            ],
          },
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].source).toBe('InnerSrc');
      expect(results[0].ixIndex).toBe(0);
      expect(results[0].innerIxIndex).toBe(0);
    });

    it('decodes raw inner instructions', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          { programId: 'SomeProgram111', data: 'abc', accounts: [] },
        ],
        innerInstructions: [
          {
            index: 0,
            instructions: [
              makeRawTransferIx({
                discriminant: 3,
                amount: 888n,
                accounts: ['CpiSrc', 'CpiDst', 'CpiAuth'],
              }),
            ],
          },
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(1);
      expect(results[0].amount).toBe('888');
      expect(results[0].ixIndex).toBe(0);
      expect(results[0].innerIxIndex).toBe(0);
    });
  });

  // ===========================================================================
  // Multiple Instructions
  // ===========================================================================

  describe('multiple instructions', () => {
    it('decodes multiple transfers in one transaction', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeParsedTransferIx({
            type: 'transfer',
            info: { source: 'A', destination: 'B', authority: 'C', amount: '100' },
          }),
          makeParsedTransferIx({
            type: 'transfer',
            info: { source: 'D', destination: 'E', authority: 'F', amount: '200' },
          }),
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(2);
      expect(results[0].amount).toBe('100');
      expect(results[0].ixIndex).toBe(0);
      expect(results[1].amount).toBe('200');
      expect(results[1].ixIndex).toBe(1);
    });

    it('decodes mixed top-level and inner instructions', () => {
      const decoder = new TokenTransferDecoder();
      const tx = makeTx({
        instructions: [
          makeParsedTransferIx({
            type: 'transfer',
            info: { source: 'TopSrc', destination: 'TopDst', authority: 'TopAuth', amount: '100' },
          }),
        ],
        innerInstructions: [
          {
            index: 0,
            instructions: [
              makeParsedTransferIx({
                type: 'transferChecked',
                info: {
                  source: 'InnerSrc', destination: 'InnerDst', authority: 'InnerAuth',
                  mint: 'InnerMint', tokenAmount: { amount: '200', decimals: 9 },
                },
              }),
            ],
          },
        ],
      });

      const results = decoder.decodeTransaction(tx);
      expect(results.length).toBe(2);
      expect(results[0].instructionType).toBe('transfer');
      expect(results[0].innerIxIndex).toBeNull();
      expect(results[1].instructionType).toBe('transferChecked');
      expect(results[1].innerIxIndex).toBe(0);
    });
  });
});

describe('Token Transfer Decoder — Real Mainnet Fixture', () => {
  it('extracts transferChecked from real swap tx', () => {
    const fixturePath = resolve(__dirname, 'fixtures/spl-token-transfer-tx.json');
    const rpcResponse = JSON.parse(readFileSync(fixturePath, 'utf-8'));
    const tx = rpcResponse.result;

    const decoder = new TokenTransferDecoder();
    const transfers = decoder.decodeTransaction(tx);

    // This tx has 6 transferChecked inner instructions (AMM swap)
    expect(transfers.length).toBeGreaterThanOrEqual(6);

    // All should be transferChecked type
    const checked = transfers.filter(t => t.instructionType === 'transferChecked');
    expect(checked.length).toBeGreaterThanOrEqual(6);

    // Each should have valid fields
    for (const t of transfers) {
      expect(t.txSignature).toBeTruthy();
      expect(t.programId).toBe('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      expect(t.source).toBeTruthy();
      expect(t.destination).toBeTruthy();
      expect(t.amount).toBeTruthy();
      expect(t.mint).toBeTruthy(); // transferChecked includes mint
    }
  });
});
