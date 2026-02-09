/**
 * Uho — IDL Discovery Service
 *
 * Attempts to discover an Anchor IDL for a Solana program from on-chain sources.
 * Tries the Anchor on-chain IDL account first, then falls back to Solscan.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { parseIDL, toSnakeCase } from '../core/idl-parser.js';
import type { AnchorIDL } from '../core/types.js';

// =============================================================================
// Types
// =============================================================================

/** Result of an IDL discovery attempt */
export interface DiscoveryResult {
  found: boolean;
  source: 'anchor-onchain' | 'solscan' | 'manual-required';
  idl?: Record<string, unknown>;
  events?: Array<{
    name: string;
    type: string;
    fields: Array<{ name: string; type: string }>;
  }>;
  message?: string;
}

// =============================================================================
// IDL Discovery Service
// =============================================================================

export class IdlDiscoveryService {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Attempts to discover the IDL for a program from on-chain and external sources.
   * Returns the IDL if found, or a message indicating manual upload is needed.
   */
  async discover(programId: string): Promise<DiscoveryResult> {
    // 1. Try Anchor on-chain IDL
    const onChainIdl = await this.tryAnchorOnChain(programId);
    if (onChainIdl) {
      const events = this.extractEventPreview(onChainIdl);
      return {
        found: true,
        source: 'anchor-onchain',
        idl: onChainIdl,
        events,
      };
    }

    // 2. Try Solscan API
    const solscanIdl = await this.trySolscan(programId);
    if (solscanIdl) {
      const events = this.extractEventPreview(solscanIdl);
      return {
        found: true,
        source: 'solscan',
        idl: solscanIdl,
        events,
      };
    }

    // 3. Not found
    return {
      found: false,
      source: 'manual-required',
      message: 'IDL not found on-chain or via Solscan. Please upload manually.',
    };
  }

  // ===========================================================================
  // Private — On-Chain Discovery
  // ===========================================================================

  /**
   * Attempts to fetch the Anchor IDL from the on-chain IDL account.
   * Anchor stores IDLs at a PDA derived from the program ID.
   */
  private async tryAnchorOnChain(programId: string): Promise<Record<string, unknown> | null> {
    try {
      const programPubkey = new PublicKey(programId);

      // Anchor IDL account PDA: seeds = ["anchor:idl", programId]
      const base = PublicKey.findProgramAddressSync(
        [Buffer.from('anchor:idl'), programPubkey.toBuffer()],
        programPubkey
      )[0];

      const accountInfo = await this.connection.getAccountInfo(base);
      if (!accountInfo || !accountInfo.data || accountInfo.data.length < 44) {
        return null;
      }

      // Anchor IDL account layout:
      // - 8 bytes: discriminator
      // - 32 bytes: authority pubkey
      // - 4 bytes: data length (u32 LE)
      // - N bytes: zlib-compressed IDL JSON
      const dataLenOffset = 8 + 32;
      const dataLen = accountInfo.data.readUInt32LE(dataLenOffset);
      const compressedData = accountInfo.data.subarray(dataLenOffset + 4, dataLenOffset + 4 + dataLen);

      // Decompress with zlib
      const { inflateSync } = await import('zlib');
      const decompressed = inflateSync(compressedData);
      const idl = JSON.parse(decompressed.toString('utf-8')) as Record<string, unknown>;

      // Validate it looks like an IDL
      if (idl.instructions || idl.events) {
        return idl;
      }

      return null;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Private — Solscan Fallback
  // ===========================================================================

  /**
   * Attempts to fetch an IDL from Solscan's public API.
   * This is a best-effort fallback for programs not using Anchor's on-chain IDL.
   */
  private async trySolscan(programId: string): Promise<Record<string, unknown> | null> {
    try {
      const url = `https://api.solscan.io/v2/account/anchor/idl?address=${programId}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Uho/1.0' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) return null;

      const body = await response.json() as Record<string, unknown>;
      const data = body.data as Record<string, unknown> | undefined;
      if (!data) return null;

      // Solscan returns the IDL nested under a "data" key
      const idl = (data.idl ?? data) as Record<string, unknown>;
      if (idl.instructions || idl.events) {
        return idl;
      }

      return null;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Private — Event Preview Extraction
  // ===========================================================================

  /**
   * Extracts a preview of events and instructions from a raw IDL.
   */
  private extractEventPreview(
    rawIdl: Record<string, unknown>
  ): Array<{ name: string; type: string; fields: Array<{ name: string; type: string }> }> {
    try {
      const parsed = parseIDL(rawIdl as unknown as AnchorIDL);
      const preview: Array<{ name: string; type: string; fields: Array<{ name: string; type: string }> }> = [];

      for (const event of parsed.events) {
        preview.push({
          name: event.name,
          type: 'event',
          fields: event.fields.map((f) => ({ name: f.name, type: f.type })),
        });
      }

      for (const ix of parsed.instructions) {
        preview.push({
          name: ix.name,
          type: 'instruction',
          fields: ix.args.map((f) => ({ name: f.name, type: f.type })),
        });
      }

      return preview;
    } catch {
      return [];
    }
  }
}
