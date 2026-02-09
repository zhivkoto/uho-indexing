/**
 * Uho — Transaction Poller
 *
 * Polls Solana RPC for recent transactions matching a program ID.
 * Uses getSignaturesForAddress for cursor-based pagination and
 * getParsedTransaction for full transaction data.
 */

import {
  Connection,
  PublicKey,
  type ParsedTransactionWithMeta,
  type ConfirmedSignatureInfo,
  type Commitment,
} from '@solana/web3.js';
import type { PollerOptions } from '../core/types.js';

/** Delay between individual RPC calls to avoid rate limiting */
const RPC_CALL_DELAY_MS = 100;

/** Maximum retries for transient RPC errors */
const MAX_RETRIES = 5;

/** Base delay for exponential backoff (ms) */
const BASE_BACKOFF_MS = 500;

// =============================================================================
// Transaction Poller
// =============================================================================

export class TransactionPoller {
  private connection: Connection;
  private programId: PublicKey;
  private options: PollerOptions;
  private lastSignature: string | null = null;
  private pollCount = 0;
  private running = false;

  constructor(connection: Connection, programId: PublicKey, options: PollerOptions) {
    this.connection = connection;
    this.programId = programId;
    this.options = options;
  }

  /**
   * Returns the current poller state for persistence/debugging.
   */
  getState(): { lastSignature: string | null; pollCount: number } {
    return {
      lastSignature: this.lastSignature,
      pollCount: this.pollCount,
    };
  }

  /**
   * Sets the last known signature (for resuming from a saved cursor).
   */
  setLastSignature(sig: string | null): void {
    this.lastSignature = sig;
  }

  /**
   * Performs a single poll cycle: fetches new transaction signatures,
   * then retrieves the full parsed transactions.
   */
  async poll(): Promise<ParsedTransactionWithMeta[]> {
    this.pollCount++;

    // Fetch recent signatures for this program
    const signatures = await this.fetchSignatures();
    if (signatures.length === 0) return [];

    // Fetch full transaction data for each signature
    const transactions = await this.fetchTransactions(signatures);

    // Update the cursor to the most recent signature
    // Signatures come in reverse chronological order, so [0] is the newest
    if (signatures.length > 0) {
      this.lastSignature = signatures[0].signature;
    }

    return transactions;
  }

  /**
   * Starts continuous polling with the configured interval.
   * Calls the callback with each batch of transactions.
   */
  async start(
    callback: (txs: ParsedTransactionWithMeta[]) => Promise<void>
  ): Promise<void> {
    this.running = true;

    while (this.running) {
      try {
        const transactions = await this.poll();
        if (transactions.length > 0) {
          await callback(transactions);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Poller] Error during poll cycle: ${message}`);
        // Don't crash — log and continue
      }

      // Wait before next poll
      if (this.running) {
        await sleep(this.options.pollIntervalMs);
      }
    }
  }

  /**
   * Stops the polling loop gracefully.
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Whether the poller is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Fetches transaction signatures for the program ID.
   * Uses `until` for forward pagination (only new transactions since last poll).
   */
  private async fetchSignatures(): Promise<ConfirmedSignatureInfo[]> {
    const commitment: Commitment = this.options.commitment ?? 'confirmed';

    const opts: {
      limit: number;
      before?: string;
      until?: string;
    } = {
      limit: this.options.batchSize,
    };

    // If we have a cursor, only fetch newer transactions
    if (this.lastSignature) {
      opts.until = this.lastSignature;
    }

    return this.retryWithBackoff(async () => {
      return this.connection.getSignaturesForAddress(
        this.programId,
        opts,
        commitment
      );
    });
  }

  /**
   * Fetches full parsed transactions for a list of signatures.
   * Adds a small delay between calls to avoid rate limiting.
   */
  private async fetchTransactions(
    signatures: ConfirmedSignatureInfo[]
  ): Promise<ParsedTransactionWithMeta[]> {
    const transactions: ParsedTransactionWithMeta[] = [];

    for (const sig of signatures) {
      // Skip failed transactions
      if (sig.err) continue;

      try {
        const tx = await this.retryWithBackoff(async () => {
          return this.connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });
        });

        if (tx) {
          transactions.push(tx);
        }
      } catch (err) {
        // Skip individual transaction failures — log and continue
        console.warn(`[Poller] Failed to fetch tx ${sig.signature}: ${(err as Error).message}`);
      }

      // Rate limiting delay between RPC calls
      await sleep(RPC_CALL_DELAY_MS);
    }

    return transactions;
  }

  /**
   * Retries an async operation with exponential backoff on transient errors.
   */
  private async retryWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        const message = lastError.message || '';

        // Only retry on transient errors
        const isTransient =
          message.includes('429') ||
          message.includes('503') ||
          message.includes('ECONNRESET') ||
          message.includes('ETIMEDOUT') ||
          message.includes('Too many requests');

        if (!isTransient || attempt === MAX_RETRIES - 1) {
          throw lastError;
        }

        // Exponential backoff: 500ms, 1s, 2s, 4s, 8s
        const delay = BASE_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(`[Poller] Transient error, retrying in ${delay}ms: ${message}`);
        await sleep(delay);
      }
    }

    throw lastError!;
  }
}

// =============================================================================
// Utility
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
