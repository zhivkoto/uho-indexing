/**
 * Uho — Platform CLI Commands
 *
 * Commands for managing the Uho platform in multi-tenant mode:
 * - `platform start [--service api|indexer|ws]` — Start platform services
 * - `platform migrate` — Run database migrations
 * - `platform stop` — Stop running platform services
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { loadPlatformConfig } from '../core/platform-config.js';
import { createPoolFromUrl } from '../core/db.js';
import { runMigrations } from '../migrations/runner.js';
import { createPlatformServer } from '../api/server.js';
import { createWsServer } from '../websocket/server.js';
import { IndexerOrchestrator } from '../ingestion/orchestrator.js';
import { getPlatformRpcUrl } from '../core/platform-config.js';

// =============================================================================
// Types
// =============================================================================

type ServiceName = 'api' | 'indexer' | 'ws';

interface PlatformStartOptions {
  service?: ServiceName;
}

// =============================================================================
// State Directory
// =============================================================================

const UHO_DIR = join(process.cwd(), '.uho');

function ensureUhoDir(): void {
  if (!existsSync(UHO_DIR)) {
    mkdirSync(UHO_DIR, { recursive: true });
  }
}

function writePidFile(service: string): void {
  ensureUhoDir();
  writeFileSync(join(UHO_DIR, `platform-${service}.pid`), process.pid.toString());
}

function writeStateFile(services: string[]): void {
  ensureUhoDir();
  writeFileSync(
    join(UHO_DIR, 'platform-state.json'),
    JSON.stringify(
      {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        services,
      },
      null,
      2
    )
  );
}

// =============================================================================
// Platform Start Command
// =============================================================================

export async function platformStartCommand(options: PlatformStartOptions): Promise<void> {
  // Ensure platform mode
  process.env.UHO_MODE = 'platform';

  let config;
  try {
    config = loadPlatformConfig();
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    process.exit(1);
  }

  const pool = createPoolFromUrl(config.databaseUrl);
  const servicesToStart = options.service ? [options.service] : (['api', 'indexer', 'ws'] as ServiceName[]);

  console.log(`
🔊 Uho Platform v0.1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode:     platform (multi-tenant)
Services: ${servicesToStart.join(', ')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const cleanups: Array<() => Promise<void>> = [];

  // ---------------------------------------------------------------------------
  // Start API Service
  // ---------------------------------------------------------------------------
  if (servicesToStart.includes('api')) {
    try {
      const app = await createPlatformServer(pool, config);
      await app.listen({ port: config.apiPort, host: '0.0.0.0' });
      console.log(`  🌐 API server listening on http://0.0.0.0:${config.apiPort}`);
      writePidFile('api');
      cleanups.push(async () => {
        await app.close();
      });
    } catch (err) {
      console.error(`❌ Failed to start API service: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  // ---------------------------------------------------------------------------
  // Start WebSocket Service
  // ---------------------------------------------------------------------------
  if (servicesToStart.includes('ws')) {
    try {
      const wsApp = await createWsServer(pool, config);
      await wsApp.listen({ port: config.wsPort, host: '0.0.0.0' });
      console.log(`  🔌 WebSocket server listening on ws://0.0.0.0:${config.wsPort}`);
      writePidFile('ws');
      cleanups.push(async () => {
        await wsApp.close();
      });
    } catch (err) {
      console.error(`❌ Failed to start WebSocket service: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  // ---------------------------------------------------------------------------
  // Start Indexer Service
  // ---------------------------------------------------------------------------
  if (servicesToStart.includes('indexer')) {
    try {
      const rpcUrl = getPlatformRpcUrl();
      const orchestrator = new IndexerOrchestrator(pool, rpcUrl);
      await orchestrator.start();
      console.log(`  ⚡ Indexer orchestrator started`);
      writePidFile('indexer');
      cleanups.push(async () => {
        await orchestrator.stop();
      });
    } catch (err) {
      console.error(`❌ Failed to start indexer service: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  // ---------------------------------------------------------------------------
  // Write state & set up graceful shutdown
  // ---------------------------------------------------------------------------
  writeStateFile(servicesToStart);

  const shutdown = async (signal: string) => {
    console.log(`\n⏹️  Received ${signal}, shutting down platform...`);

    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (err) {
        console.error(`  ⚠️ Cleanup error: ${(err as Error).message}`);
      }
    }

    await pool.end();

    // Clean up PID files
    for (const svc of servicesToStart) {
      try {
        unlinkSync(join(UHO_DIR, `platform-${svc}.pid`));
      } catch {
        /* ignore */
      }
    }
    try {
      unlinkSync(join(UHO_DIR, 'platform-state.json'));
    } catch {
      /* ignore */
    }

    console.log('👋 Uho platform stopped.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// =============================================================================
// Platform Migrate Command
// =============================================================================

export async function platformMigrateCommand(): Promise<void> {
  process.env.UHO_MODE = 'platform';

  let config;
  try {
    config = loadPlatformConfig();
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    process.exit(1);
  }

  console.log('📐 Running platform migrations...');

  const pool = createPoolFromUrl(config.databaseUrl);

  try {
    await runMigrations(pool);
    console.log('✅ Migrations complete.');
  } catch (err) {
    console.error(`❌ Migration failed: ${(err as Error).message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// =============================================================================
// Platform Stop Command
// =============================================================================

export async function platformStopCommand(): Promise<void> {
  const stateFile = join(UHO_DIR, 'platform-state.json');

  if (!existsSync(stateFile)) {
    console.log('ℹ️  No running platform instance found.');
    return;
  }

  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf-8')) as {
      pid: number;
      services: string[];
    };

    console.log(`⏹️  Stopping platform (PID ${state.pid})...`);

    try {
      process.kill(state.pid, 'SIGTERM');
      console.log(`  ✅ Sent SIGTERM to PID ${state.pid}`);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ESRCH') {
        console.log(`  ⚠️ Process ${state.pid} not found (already stopped)`);
      } else {
        throw err;
      }
    }

    // Clean up PID files
    for (const svc of state.services) {
      try {
        unlinkSync(join(UHO_DIR, `platform-${svc}.pid`));
      } catch {
        /* ignore */
      }
    }
    try {
      unlinkSync(stateFile);
    } catch {
      /* ignore */
    }

    console.log('👋 Platform stop signal sent.');
  } catch (err) {
    console.error(`❌ Failed to stop platform: ${(err as Error).message}`);
    process.exit(1);
  }
}
