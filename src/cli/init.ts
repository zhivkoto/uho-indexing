/**
 * Uho — Init Command
 *
 * Scaffolds a new Uho project by creating the config file,
 * IDL directory, and sample IDL.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { resolve, basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';

// =============================================================================
// Init Command
// =============================================================================

export async function initCommand(options: { name?: string; dir?: string }): Promise<void> {
  const projectDir = resolve(options.dir || '.');
  const projectName = options.name || basename(projectDir) || 'my-indexer';

  console.log(`\n🔊 Initializing Uho project: ${projectName}\n`);

  // Create project directory if it doesn't exist
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true });
    console.log(`  📁 Created directory: ${projectDir}`);
  }

  // Create idls/ directory
  const idlsDir = join(projectDir, 'idls');
  if (!existsSync(idlsDir)) {
    mkdirSync(idlsDir, { recursive: true });
    console.log('  📁 Created idls/ directory');
  }

  // Copy sample IDL to idls/
  const sampleIdlDest = join(idlsDir, 'sample.json');
  if (!existsSync(sampleIdlDest)) {
    // Find the bundled sample IDL from fixtures
    const fixturesPath = findFixturesPath();
    if (fixturesPath) {
      const sampleIdlSrc = join(fixturesPath, 'swap-idl.json');
      if (existsSync(sampleIdlSrc)) {
        copyFileSync(sampleIdlSrc, sampleIdlDest);
        console.log('  📄 Copied sample IDL to idls/sample.json');
      }
    }

    // Fallback: create a minimal sample if fixtures not found
    if (!existsSync(sampleIdlDest)) {
      writeFileSync(sampleIdlDest, JSON.stringify(FALLBACK_SAMPLE_IDL, null, 2));
      console.log('  📄 Created sample IDL: idls/sample.json');
    }
  }

  // Create uho.yaml from template
  const configPath = join(projectDir, 'uho.yaml');
  if (!existsSync(configPath)) {
    const configContent = generateConfig(projectName);
    writeFileSync(configPath, configContent);
    console.log('  📄 Created uho.yaml');
  } else {
    console.log('  ⏭️  uho.yaml already exists, skipping');
  }

  // Create .uho/ directory for runtime state
  const uhoDir = join(projectDir, '.uho');
  if (!existsSync(uhoDir)) {
    mkdirSync(uhoDir, { recursive: true });
  }

  // Print next steps
  console.log(`
✅ Uho project initialized!

Next steps:
  1. Place your Anchor IDL in ./idls/
  2. Edit uho.yaml to configure your program
  3. Run: uho schema --apply  (to generate database tables)
  4. Run: uho start           (to begin indexing)
`);
}

// =============================================================================
// Template Generation
// =============================================================================

function generateConfig(name: string): string {
  return `# Uho — Solana Event Indexer Configuration
version: 1
name: "${name}"
chain: solana-devnet    # solana-devnet | solana-mainnet

# Optional: override default RPC URL
# rpcUrl: https://devnet.helius-rpc.com/?api-key=YOUR_KEY

database:
  host: localhost
  port: 5432
  name: uho
  user: zhivkoto
  password: ""

programs:
  - name: sample_dex
    programId: "DEXSwap111111111111111111111111111111111111"    # Replace with your program ID
    idl: ./idls/sample.json
    # events:              # Optional: whitelist specific events (default: index all)
    #   - SwapEvent
    #   - LiquidityEvent

api:
  port: 3000
  host: 0.0.0.0

ingestion:
  pollIntervalMs: 2000    # How often to poll for new transactions
  batchSize: 25           # Transactions per poll batch
  # startSlot: 0          # Optional: start from a specific slot
`;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Searches for the fixtures directory relative to the source file.
 */
function findFixturesPath(): string | null {
  // Walk up from current file to find the project root fixtures/
  const currentFile = fileURLToPath(import.meta.url);
  let dir = dirname(currentFile);

  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'fixtures');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }

  return null;
}

/** Minimal fallback IDL in case fixtures directory is not found */
const FALLBACK_SAMPLE_IDL = {
  address: "DEXSwap111111111111111111111111111111111111",
  metadata: { name: "sample_dex", version: "0.1.0", spec: "0.1.0" },
  instructions: [],
  accounts: [],
  events: [
    {
      name: "SwapEvent",
      discriminator: [64, 198, 205, 232, 38, 8, 113, 226],
      fields: [
        { name: "amm", type: "pubkey" },
        { name: "inputMint", type: "pubkey" },
        { name: "inputAmount", type: "u64" },
        { name: "outputMint", type: "pubkey" },
        { name: "outputAmount", type: "u64" },
      ],
    },
  ],
  types: [],
};
