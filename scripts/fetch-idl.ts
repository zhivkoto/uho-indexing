import { Connection } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { writeFileSync } from 'fs';

const RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

async function main() {
  const programId = process.argv[2] || 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
  const outPath = process.argv[3] || './idls/fetched.json';
  
  const conn = new Connection(RPC);
  console.log(`Fetching IDL for ${programId}...`);
  
  const idl = await Program.fetchIdl(programId, { connection: conn });
  if (!idl) { console.log("No IDL found on-chain for this program"); process.exit(1); }
  
  writeFileSync(outPath, JSON.stringify(idl, null, 2));
  console.log(`IDL saved to ${outPath}`);
  console.log(`Name: ${(idl as any).metadata?.name || (idl as any).name}`);
  console.log(`Events: ${((idl as any).events || []).length}`);
  console.log(`Instructions: ${((idl as any).instructions || []).length}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
