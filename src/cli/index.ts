#!/usr/bin/env node
/**
 * Uho — CLI Entrypoint
 *
 * Command-line interface for the Uho Solana event indexer.
 * Supports init, start, status, stop, and schema commands.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env file (Node 20+ compatible, no external deps)
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

import { Command } from 'commander';
import { initCommand } from './init.js';
import { startCommand } from './start.js';
import { statusCommand } from './status.js';
import { stopCommand } from './stop.js';
import { schemaCommand } from './schema.js';
import { platformStartCommand, platformMigrateCommand, platformStopCommand } from './platform.js';

const program = new Command()
  .name('uho')
  .description('Solana IDL-driven event indexer — feed it an IDL, get a typed API in minutes')
  .version('0.1.0');

program
  .command('init')
  .description('Scaffold a new Uho project')
  .option('-n, --name <name>', 'Project name')
  .option('-d, --dir <dir>', 'Project directory', '.')
  .action(initCommand);

program
  .command('start')
  .description('Start indexing + API server')
  .option('-c, --config <path>', 'Path to uho.yaml')
  .action(startCommand);

program
  .command('status')
  .description('Show indexer status')
  .option('-c, --config <path>', 'Path to uho.yaml')
  .action(statusCommand);

program
  .command('stop')
  .description('Stop the running indexer')
  .action(stopCommand);

program
  .command('schema')
  .description('Generate/apply DB schema from IDL')
  .option('-c, --config <path>', 'Path to uho.yaml')
  .option('--apply', 'Apply schema to database (default: dry run)')
  .action(schemaCommand);

// Platform mode commands
const platform = program
  .command('platform')
  .description('Manage Uho platform (multi-tenant mode)');

platform
  .command('start')
  .description('Start platform services')
  .option('-s, --service <service>', 'Start a specific service (api|indexer|ws)')
  .action(platformStartCommand);

platform
  .command('migrate')
  .description('Run database migrations')
  .action(platformMigrateCommand);

platform
  .command('stop')
  .description('Stop running platform services')
  .action(platformStopCommand);

program.parse();
