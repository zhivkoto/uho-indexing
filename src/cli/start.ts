/**
 * Uho — Start Command
 *
 * Starts the full indexer pipeline: loads config, parses IDLs, connects to
 * PostgreSQL, applies schema, starts pollers for each program, and launches
 * the REST API server.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { Connection, PublicKey } from '@solana/web3.js';
import { loadConfig, getDefaultRpcUrl } from '../core/config.js';
import { parseIDL, isShankIDL, parseShankIDL } from '../core/idl-parser.js';
import { generateDDL, applySchema } from '../core/schema-generator.js';
import { createPool, ensureDatabase } from '../core/db.js';
import { TransactionPoller } from '../ingestion/poller.js';
import { EventDecoder } from '../ingestion/decoder.js';
import { InstructionDecoder } from '../ingestion/instruction-decoder.js';
import { EventWriter } from '../ingestion/writer.js';
import { createServer, startServer } from '../api/server.js';
import type { AnchorIDL, ShankIDL, ParsedIDL, UhoConfig } from '../core/types.js';

// =============================================================================
// Start Command
// =============================================================================

export async function startCommand(options: { config?: string }): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Load configuration
  // -------------------------------------------------------------------------
  let config;
  try {
    config = loadConfig(options.config);
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    process.exit(1);
  }
  const rpcUrl = config.rpcUrl || getDefaultRpcUrl(config.chain);

  // -------------------------------------------------------------------------
  // 2. Parse all configured IDLs
  // -------------------------------------------------------------------------
  const parsedIdls: ParsedIDL[] = [];
  const rawIdls: Map<string, AnchorIDL> = new Map();
  const shankPrograms = new Set<string>(); // Track which programs use Shank IDLs

  for (const program of config.programs) {
    const idlPath = resolve(program.idl);
    if (!existsSync(idlPath)) {
      console.error(`❌ IDL file not found: ${idlPath}`);
      process.exit(1);
    }

    const rawJson = JSON.parse(readFileSync(idlPath, 'utf-8'));

    if (isShankIDL(rawJson)) {
      // Shank IDL — parse for instruction indexing
      console.log(`  📋 Detected Shank IDL for ${program.name}`);
      const parsed = parseShankIDL(rawJson as ShankIDL);
      parsedIdls.push(parsed);
      shankPrograms.add(program.programId);
    } else {
      // Anchor IDL — existing event indexing path
      const rawIdl = rawJson as AnchorIDL;

      // Normalize v0.30+ IDL: merge event fields from types array into events
      // BorshCoder needs events to have fields directly for deserialization
      if (rawIdl.types && rawIdl.events) {
        const typesMap = new Map<string, any>();
        for (const t of rawIdl.types) {
          if (t.type?.kind === 'struct' && t.type.fields) {
            typesMap.set(t.name, t.type.fields);
          }
        }
        for (const event of rawIdl.events) {
          if (!(event as any).fields && typesMap.has(event.name)) {
            (event as any).fields = typesMap.get(event.name);
          }
        }
      }

      const parsed = parseIDL(rawIdl);
      parsedIdls.push(parsed);
      rawIdls.set(program.programId, rawIdl);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Connect to PostgreSQL
  // -------------------------------------------------------------------------
  console.log('📦 Connecting to PostgreSQL...');
  await ensureDatabase(config.database);
  const pool = createPool(config.database);

  // -------------------------------------------------------------------------
  // 4. Apply schema
  // -------------------------------------------------------------------------
  console.log('📐 Applying database schema...');
  for (let i = 0; i < config.programs.length; i++) {
    const ddl = generateDDL(parsedIdls[i], config.programs[i]);
    await applySchema(pool, ddl);
  }

  // -------------------------------------------------------------------------
  // 5. Print startup banner
  // -------------------------------------------------------------------------
  const eventNames = parsedIdls.flatMap((p) => p.events.map((e) => e.name));
  const instructionNames = parsedIdls.flatMap((p) => p.instructions.map((ix) => ix.name));
  const programSummary = config.programs
    .map((p) => `  ${p.name} (${p.programId.slice(0, 8)}...${p.programId.slice(-4)})${shankPrograms.has(p.programId) ? ' [shank]' : ''}`)
    .join('\n');

  console.log(`
🔊 Uho v0.1.0 — Solana Event Indexer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Chain:    ${config.chain}
RPC:      ${rpcUrl.replace(/api-key=[^&]+/, 'api-key=***')}
Programs:
${programSummary}
Events:   ${eventNames.join(', ') || '(none)'}
Instructions: ${instructionNames.join(', ') || '(none)'}
API:      http://${config.api.host}:${config.api.port}
DB:       postgresql://${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // -------------------------------------------------------------------------
  // 6. Start pollers for each program
  // -------------------------------------------------------------------------
  const connection = new Connection(rpcUrl, 'confirmed');
  const pollers: TransactionPoller[] = [];

  for (let i = 0; i < config.programs.length; i++) {
    const programConfig = config.programs[i];
    const parsedIdl = parsedIdls[i];
    const rawIdl = rawIdls.get(programConfig.programId)!;

    const poller = new TransactionPoller(
      connection,
      new PublicKey(programConfig.programId),
      {
        pollIntervalMs: config.ingestion.pollIntervalMs,
        batchSize: config.ingestion.batchSize,
        startSlot: config.ingestion.startSlot,
      }
    );

    const isShank = shankPrograms.has(programConfig.programId);
    const eventDecoder = isShank ? null : new EventDecoder(parsedIdl, rawIdls.get(programConfig.programId)!);
    const instructionDecoder = isShank ? new InstructionDecoder(parsedIdl) : null;
    const writer = new EventWriter(pool, parsedIdl);

    // Resume from last known state
    const state = await writer.getState(programConfig.programId);
    if (state?.lastSignature) {
      poller.setLastSignature(state.lastSignature);
      console.log(`  📍 Resuming ${programConfig.name} from slot ${state.lastSlot}`);
    }

    // Update state to running
    await writer.updateState(programConfig.programId, {
      status: 'running',
      startedAt: new Date(),
    });

    // Start polling
    poller.start(async (txs) => {
      let totalIndexed = 0;
      console.log(`  🔍 ${programConfig.name}: processing ${txs.length} transactions`);

      for (const tx of txs) {
        const sig = tx.transaction.signatures[0];

        if (isShank && instructionDecoder) {
          // Shank path: decode instructions from transaction data
          const instructions = instructionDecoder.decodeTransaction(tx);
          if (instructions.length > 0) {
            console.log(`  ✅ Found ${instructions.length} instruction(s) in tx ${sig.slice(0, 8)}...`);
            const written = await writer.writeInstructions(instructions);
            totalIndexed += written;
          }
        } else if (eventDecoder) {
          // Anchor path: decode events from logs
          const logCount = tx.meta?.logMessages?.length ?? 0;
          const events = eventDecoder.decodeTransaction(tx);
          if (events.length > 0) {
            console.log(`  ✅ Found ${events.length} events in tx ${sig.slice(0, 8)}...`);
            const written = await writer.writeEvents(events);
            totalIndexed += written;
          } else if (logCount > 0) {
            if (totalIndexed === 0 && txs.indexOf(tx) < 2) {
              const dataLogs = tx.meta!.logMessages!.filter(l => l.includes('Program data:'));
              if (dataLogs.length > 0) {
                console.log(`  🔬 tx ${sig.slice(0, 8)}... has ${dataLogs.length} "Program data:" logs but 0 decoded events`);
              }
            }
          }
        }
      }

      // Update state after each batch
      const pollerState = poller.getState();
      const currentState = await writer.getState(programConfig.programId);
      await writer.updateState(programConfig.programId, {
        lastSlot: txs[0]?.slot ?? currentState?.lastSlot ?? 0,
        lastSignature: pollerState.lastSignature,
        eventsIndexed: (currentState?.eventsIndexed ?? 0) + totalIndexed,
        lastPollAt: new Date(),
      });

      if (totalIndexed > 0) {
        console.log(`  📥 ${programConfig.name}: indexed ${totalIndexed} ${isShank ? 'instructions' : 'events'} from ${txs.length} transactions`);
      }
    });

    pollers.push(poller);
    console.log(`  🔄 Polling ${programConfig.name} every ${config.ingestion.pollIntervalMs}ms...`);
  }

  // -------------------------------------------------------------------------
  // 7. Start API server
  // -------------------------------------------------------------------------
  const app = await createServer(config, pool, parsedIdls);
  await startServer(app, config);
  console.log(`  🌐 API server listening on http://${config.api.host}:${config.api.port}`);

  // -------------------------------------------------------------------------
  // 8. Write PID file and state
  // -------------------------------------------------------------------------
  const uhoDir = join(process.cwd(), '.uho');
  if (!existsSync(uhoDir)) mkdirSync(uhoDir, { recursive: true });

  writeFileSync(join(uhoDir, 'pid'), process.pid.toString());
  writeFileSync(
    join(uhoDir, 'state.json'),
    JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
      config: {
        name: config.name,
        chain: config.chain,
        apiPort: config.api.port,
        programs: config.programs.map((p) => p.name),
      },
    }, null, 2)
  );

  // -------------------------------------------------------------------------
  // 9. Graceful shutdown handler
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string) => {
    console.log(`\n⏹️  Received ${signal}, shutting down...`);

    // Stop pollers
    for (const poller of pollers) {
      poller.stop();
    }

    // Update state to stopped for each program
    for (const programConfig of config.programs) {
      const parsedIdl = parsedIdls.find(
        (p) => p.programId === programConfig.programId
      );
      if (parsedIdl) {
        const writer = new EventWriter(pool, parsedIdl);
        await writer.updateState(programConfig.programId, { status: 'stopped' });
      }
    }

    // Close API server
    await app.close();

    // Close database pool
    await pool.end();

    // Clean up PID file
    try {
      const { unlinkSync } = await import('fs');
      unlinkSync(join(uhoDir, 'pid'));
    } catch { /* ignore */ }

    console.log('👋 Uho stopped.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
