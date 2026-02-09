/**
 * Uho — Status Command
 *
 * Shows the current indexer status including process info,
 * per-program state, and API availability.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../core/config.js';
import { createPool } from '../core/db.js';

// =============================================================================
// Status Command
// =============================================================================

export async function statusCommand(options: { config?: string }): Promise<void> {
  console.log('\nUho Status');
  console.log('━━━━━━━━━━');

  // -------------------------------------------------------------------------
  // 1. Check PID file and process status
  // -------------------------------------------------------------------------
  const uhoDir = join(process.cwd(), '.uho');
  const pidFile = join(uhoDir, 'pid');
  const stateFile = join(uhoDir, 'state.json');

  let processRunning = false;
  let pid: number | null = null;

  if (existsSync(pidFile)) {
    pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    try {
      // Check if process is alive (signal 0 doesn't kill, just checks)
      process.kill(pid, 0);
      processRunning = true;
    } catch {
      processRunning = false;
    }
  }

  if (processRunning && pid) {
    // Read startup time from state file
    let uptime = '';
    if (existsSync(stateFile)) {
      try {
        const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
        const started = new Date(state.startedAt);
        const elapsed = Date.now() - started.getTime();
        uptime = formatDuration(elapsed);
      } catch { /* ignore */ }
    }
    console.log(`Process:  Running (PID ${pid})`);
    if (uptime) console.log(`Uptime:   ${uptime}`);
  } else {
    console.log('Process:  Stopped');
  }

  // -------------------------------------------------------------------------
  // 2. Query database for program states
  // -------------------------------------------------------------------------
  try {
    const config = loadConfig(options.config);
    const pool = createPool(config.database);

    try {
      const result = await pool.query('SELECT * FROM _uho_state ORDER BY program_name');

      if (result.rows.length > 0) {
        console.log('\nPrograms:');
        for (const row of result.rows) {
          const lastPollAgo = row.last_poll_at
            ? formatDuration(Date.now() - new Date(row.last_poll_at).getTime()) + ' ago'
            : 'never';

          console.log(`  ${row.program_name}`);
          console.log(`    Status:         ${row.status}`);
          console.log(`    Last Slot:      ${Number(row.last_slot).toLocaleString()}`);
          console.log(`    Events Indexed: ${Number(row.events_indexed).toLocaleString()}`);
          console.log(`    Last Poll:      ${lastPollAgo}`);
          if (row.error) {
            console.log(`    Error:          ${row.error}`);
          }
        }
      } else {
        console.log('\nNo programs tracked yet. Run `uho start` first.');
      }

      console.log(`\nAPI: http://${config.api.host}:${config.api.port}`);
    } finally {
      await pool.end();
    }
  } catch (err) {
    // Config or DB might not exist yet
    console.log(`\n⚠️  Could not read status: ${(err as Error).message}`);
  }

  console.log('');
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Formats a duration in milliseconds to a human-readable string.
 * Examples: "2h 15m", "45s", "3d 2h"
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
