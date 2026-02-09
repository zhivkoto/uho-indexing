/**
 * Uho — Library Entrypoint
 *
 * Re-exports all core modules for programmatic usage.
 */

// Core
export * from './core/types.js';
export * from './core/idl-parser.js';
export * from './core/config.js';
export * from './core/schema-generator.js';
export * from './core/db.js';

// Ingestion
export { TransactionPoller } from './ingestion/poller.js';
export { EventDecoder } from './ingestion/decoder.js';
export { EventWriter } from './ingestion/writer.js';

// API
export { createServer, startServer } from './api/server.js';
export { registerEventRoutes, registerStatusRoute, registerHealthRoute } from './api/routes.js';
