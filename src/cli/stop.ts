/**
 * Uho — Stop Command
 *
 * Gracefully stops a running Uho indexer process by sending SIGTERM,
 * with a fallback to SIGKILL if the process doesn't exit in time.
 */

import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

// =============================================================================
// Stop Command
// =============================================================================

export async function stopCommand(): Promise<void> {
  const uhoDir = join(process.cwd(), '.uho');
  const pidFile = join(uhoDir, 'pid');

  // -------------------------------------------------------------------------
  // 1. Read PID file
  // -------------------------------------------------------------------------
  if (!existsSync(pidFile)) {
    console.log('⚠️  No PID file found. Is Uho running?');
    console.log('   If the process is running but the PID file is missing,');
    console.log('   find and kill it manually: ps aux | grep uho');
    return;
  }

  const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);

  if (isNaN(pid)) {
    console.log('❌ Invalid PID file. Cleaning up...');
    unlinkSync(pidFile);
    return;
  }

  // -------------------------------------------------------------------------
  // 2. Check if process is running
  // -------------------------------------------------------------------------
  let isRunning = false;
  try {
    process.kill(pid, 0); // Signal 0 = check existence
    isRunning = true;
  } catch {
    isRunning = false;
  }

  if (!isRunning) {
    console.log(`⚠️  Process ${pid} is not running. Cleaning up PID file.`);
    unlinkSync(pidFile);
    return;
  }

  // -------------------------------------------------------------------------
  // 3. Send SIGTERM for graceful shutdown
  // -------------------------------------------------------------------------
  console.log(`⏹️  Sending SIGTERM to process ${pid}...`);
  process.kill(pid, 'SIGTERM');

  // Wait up to 5 seconds for graceful shutdown
  const maxWait = 5000;
  const checkInterval = 250;
  let waited = 0;

  while (waited < maxWait) {
    await sleep(checkInterval);
    waited += checkInterval;

    try {
      process.kill(pid, 0);
      // Still running
    } catch {
      // Process exited
      console.log('✅ Uho stopped gracefully.');
      cleanupPidFile(pidFile);
      return;
    }
  }

  // -------------------------------------------------------------------------
  // 4. Fallback: SIGKILL
  // -------------------------------------------------------------------------
  console.log('⚠️  Process did not stop gracefully. Sending SIGKILL...');
  try {
    process.kill(pid, 'SIGKILL');
    console.log('✅ Uho force-killed.');
  } catch (err) {
    console.log(`❌ Failed to kill process: ${(err as Error).message}`);
  }

  cleanupPidFile(pidFile);
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanupPidFile(pidFile: string): void {
  try {
    if (existsSync(pidFile)) {
      unlinkSync(pidFile);
    }
  } catch { /* ignore cleanup errors */ }
}
