/**
 * Uho — Balance Delta Decoder
 *
 * Stateless decoder that computes per-account-per-mint token balance deltas
 * from `meta.preTokenBalances` and `meta.postTokenBalances` of parsed
 * Solana transactions. Skips zero-delta rows.
 */

import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import type { DecodedBalanceDelta } from '../core/types.js';

// =============================================================================
// Types for Solana token balance structures
// =============================================================================

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: {
    amount: string;    // raw string amount (u64)
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
}

// =============================================================================
// Balance Delta Decoder
// =============================================================================

export class BalanceDeltaDecoder {
  /**
   * Computes token balance deltas for a parsed transaction.
   *
   * Algorithm:
   * 1. Build map from accountIndex → preTokenBalance
   * 2. Build map from accountIndex → postTokenBalance
   * 3. Union the keys
   * 4. For each key, compute delta = post.amount - pre.amount
   * 5. Skip rows where delta == 0 (no change)
   * 6. Resolve account address from accountKeys
   *
   * @param tx - The full parsed transaction with metadata
   * @param programId - The user's indexed program ID (stored as context)
   * @returns Array of decoded balance deltas (zero-deltas excluded)
   */
  decodeTransaction(
    tx: ParsedTransactionWithMeta,
    programId: string
  ): DecodedBalanceDelta[] {
    const results: DecodedBalanceDelta[] = [];

    const preBalances = (tx.meta?.preTokenBalances ?? []) as TokenBalance[];
    const postBalances = (tx.meta?.postTokenBalances ?? []) as TokenBalance[];

    // Nothing to compute if both are empty
    if (preBalances.length === 0 && postBalances.length === 0) return results;

    const txSignature = tx.transaction.signatures[0];
    const slot = tx.slot;
    const blockTime = tx.blockTime ?? null;
    const accountKeys = tx.transaction.message.accountKeys;

    // Build pre and post maps keyed by accountIndex
    const preMap = new Map<number, TokenBalance>();
    for (const bal of preBalances) {
      preMap.set(bal.accountIndex, bal);
    }

    const postMap = new Map<number, TokenBalance>();
    for (const bal of postBalances) {
      postMap.set(bal.accountIndex, bal);
    }

    // Union of all account indices
    const allIndices = new Set<number>([...preMap.keys(), ...postMap.keys()]);

    for (const accountIndex of allIndices) {
      try {
        const pre = preMap.get(accountIndex);
        const post = postMap.get(accountIndex);

        // Determine raw amounts as bigint for precision
        const preAmount = BigInt(pre?.uiTokenAmount?.amount ?? '0');
        const postAmount = BigInt(post?.uiTokenAmount?.amount ?? '0');
        const delta = postAmount - preAmount;

        // Skip zero-delta rows
        if (delta === 0n) continue;

        // Resolve account address from accountKeys
        const accountKeyEntry = accountKeys[accountIndex];
        const account = accountKeyEntry
          ? (typeof accountKeyEntry === 'string'
            ? accountKeyEntry
            : (accountKeyEntry as any).pubkey?.toBase58?.()
              ?? (accountKeyEntry as any).toBase58?.()
              ?? String(accountKeyEntry))
          : `unknown_${accountIndex}`;

        // Use mint and owner from whichever side is available (post preferred)
        const mint = post?.mint ?? pre?.mint ?? 'unknown';
        const owner = post?.owner ?? pre?.owner ?? null;
        const decimals = post?.uiTokenAmount?.decimals ?? pre?.uiTokenAmount?.decimals ?? 0;

        results.push({
          txSignature,
          slot,
          blockTime,
          programId,
          accountIndex,
          account,
          mint,
          owner,
          preAmount: preAmount.toString(),
          postAmount: postAmount.toString(),
          delta: delta.toString(),
          decimals,
        });
      } catch (err) {
        // Skip malformed entries — don't crash the decoder
        console.warn(
          `[BalanceDeltaDecoder] Error processing accountIndex ${accountIndex} in tx ${txSignature}: ${(err as Error).message}`
        );
      }
    }

    return results;
  }
}
