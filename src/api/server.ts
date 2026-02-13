/**
 * Uho — API Server
 *
 * Fastify-based REST API server with auto-generated routes from IDL definitions.
 * Supports both CLI mode (single-user, no auth) and platform mode (multi-tenant, auth-gated).
 * Includes CORS, health checks, BigInt serialization, and graceful shutdown.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type pg from 'pg';
import { randomUUID } from 'crypto';
import type { UhoConfig, ParsedIDL } from '../core/types.js';
import type { PlatformConfig } from '../core/platform-config.js';
import { registerEventRoutes, registerInstructionRoutes, registerStatusRoute, registerHealthRoute } from './routes.js';
import { eventTableNameRaw, instructionTableNameRaw, quoteIdent } from '../core/schema-generator.js';
import { registerAuthRoutes } from './auth-routes.js';
import { registerOAuthRoutes } from './oauth-routes.js';
import { registerUserRoutes } from './user-routes.js';
import { registerProgramRoutes } from './program-routes.js';
import { registerDataRoutes } from './data-routes.js';
import { registerViewRoutes } from './view-routes.js';
import { registerWebhookRoutes } from './webhook-routes.js';
import { registerSchemaRoutes } from './schema-routes.js';
import { initAuthMiddleware, authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { initSchemaMiddleware, registerSchemaCleanup } from '../middleware/schema.js';
import { registerRateLimiting } from '../middleware/rate-limit.js';
import { registerUsageTracking } from '../middleware/usage.js';
import { UserService } from '../services/user-service.js';
import { ProgramService } from '../services/program-service.js';
import { ViewService } from '../services/view-service.js';
import { WebhookService } from '../services/webhook-service.js';
import { IdlDiscoveryService } from '../services/idl-discovery.js';
import { UsageService } from '../services/usage-service.js';
import { AppError } from '../core/errors.js';
import { getPlatformRpcUrl } from '../core/platform-config.js';

// =============================================================================
// CLI Mode Server Creation (unchanged)
// =============================================================================

/**
 * Creates and configures the Fastify server with all auto-generated routes.
 * This is the original CLI mode — no auth, single-user.
 *
 * @param config - The Uho configuration
 * @param pool - PostgreSQL connection pool
 * @param parsedIdls - Array of parsed IDLs (one per configured program)
 */
export async function createServer(
  config: UhoConfig,
  pool: pg.Pool,
  parsedIdls: ParsedIDL[]
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Enable CORS for browser access during development
  await app.register(cors, {
    origin: true,
    methods: ['GET'],
  });

  // Register health and status endpoints
  registerHealthRoute(app, config.rpcUrl);
  registerStatusRoute(app, pool, config, parsedIdls);

  // Register auto-generated event routes for each program's events
  for (const parsedIdl of parsedIdls) {
    for (const event of parsedIdl.events) {
      registerEventRoutes(app, pool, parsedIdl.programName, event);
    }
    // Register auto-generated instruction routes
    for (const instruction of parsedIdl.instructions) {
      registerInstructionRoutes(app, pool, parsedIdl.programName, instruction);
    }
  }

  return app;
}

/**
 * Starts the Fastify server and begins listening on the configured host:port.
 */
export async function startServer(
  app: FastifyInstance,
  config: UhoConfig
): Promise<void> {
  await app.listen({
    port: config.api.port,
    host: config.api.host,
  });
}

// =============================================================================
// Platform Mode Server Creation
// =============================================================================

/**
 * Creates and configures the Fastify server for platform (multi-tenant) mode.
 * Includes auth middleware, rate limiting, and all platform routes.
 */
export async function createPlatformServer(
  pool: pg.Pool,
  config: PlatformConfig
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        config.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            }
          : undefined,
    },
  });

  // ---------------------------------------------------------------------------
  // Plugins
  // ---------------------------------------------------------------------------

  // S1.1 — CORS with Access-Control-Max-Age and X-API-Key allowed
  // Allow all origins in dev, restrict in production via CORS_ORIGINS
  await app.register(cors, {
    origin: config.nodeEnv === 'production' ? config.corsOrigins : true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
    maxAge: 86400, // Cache preflight for 24h
  });

  await app.register(cookie);

  // S2.3 — OpenAPI / Swagger
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Uho API',
        description: 'Solana IDL-driven event indexer — feed it an IDL, get a typed API in minutes.',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${config.apiPort}`, description: 'Local development' }],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
          },
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // ---------------------------------------------------------------------------
  // Rate Limiting
  // ---------------------------------------------------------------------------
  await registerRateLimiting(app);

  // ---------------------------------------------------------------------------
  // Quick Win: X-Request-Id + X-Response-Time headers on all responses
  // ---------------------------------------------------------------------------
  app.addHook('onRequest', async (request) => {
    // Use performance.now() instead of hrtime.bigint() to avoid BigInt mixing issues
    (request as any)._startTime = performance.now();
    (request as any)._requestId = (request.headers['x-request-id'] as string) || randomUUID();
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const requestId = (request as any)._requestId as string | undefined;
    const startTime = (request as any)._startTime as number | undefined;

    if (requestId) {
      reply.header('X-Request-Id', requestId);
    }
    if (startTime !== undefined) {
      const elapsed = performance.now() - startTime;
      reply.header('X-Response-Time', `${elapsed.toFixed(1)}ms`);
    }

    // Ensure Content-Type: application/json on all JSON responses
    const ct = reply.getHeader('content-type');
    if (!ct && payload && typeof payload === 'string') {
      reply.header('content-type', 'application/json; charset=utf-8');
    }

    return payload;
  });

  // ---------------------------------------------------------------------------
  // Initialize Middleware
  // ---------------------------------------------------------------------------
  initAuthMiddleware(pool, config.jwtSecret);
  initSchemaMiddleware(pool);
  registerSchemaCleanup(app);

  // ---------------------------------------------------------------------------
  // S1.3 — Standardized Error Handler
  // All errors return { error: { code, message, details? } }
  // ---------------------------------------------------------------------------
  app.setErrorHandler((rawError, _request, reply) => {
    const error = rawError as Error & {
      statusCode?: number;
      validation?: unknown;
      code?: string;
    };

    // Structured AppError subclasses (400, 401, 403, 404, 409, 422, 429)
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toResponse());
    }

    // Fastify validation errors → 422
    if (error.validation) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: { validation: error.validation },
        },
      });
    }

    // Fastify 404 (unknown routes)
    if (error.statusCode === 404 || error.code === 'FST_ERR_NOT_FOUND') {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: error.message || 'Route not found' },
      });
    }

    // Rate limit errors from @fastify/rate-limit (already handled by errorResponseBuilder,
    // but catch any that bubble up)
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: error.message || 'Rate limit exceeded' },
      });
    }

    // Catch-all — 500 Internal
    const isProduction = config.nodeEnv === 'production';
    console.error('[API] Unhandled error:', error);
    return reply.status(error.statusCode || 500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: isProduction ? 'Internal server error' : error.message || 'Internal server error',
      },
    });
  });

  // Handle 404 for routes that don't exist
  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // ---------------------------------------------------------------------------
  // Services
  // ---------------------------------------------------------------------------
  const userService = new UserService(pool, config.jwtSecret, config.jwtRefreshSecret, config.resendApiKey);
  const programService = new ProgramService(pool);
  const viewService = new ViewService(pool);
  const webhookService = new WebhookService(pool);
  const usageService = new UsageService(pool);

  const rpcUrl = getPlatformRpcUrl();
  let idlDiscoveryService: IdlDiscoveryService | null = null;
  if (config.heliusApiKey) {
    idlDiscoveryService = new IdlDiscoveryService(rpcUrl);
  }

  // ---------------------------------------------------------------------------
  // Usage Tracking (after auth, before routes)
  // ---------------------------------------------------------------------------
  registerUsageTracking(app, usageService);

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  // Quick Win: Root route — API discovery
  app.get('/', async () => ({
    name: 'Uho',
    version: '0.1.0',
    docs: '/api/docs',
    openapi: '/api/v1/openapi.json',
    health: '/api/v1/health',
  }));

  // S2.3 — OpenAPI spec endpoint
  app.get('/api/v1/openapi.json', async () => {
    return app.swagger();
  });

  // Health (no auth) — includes current Solana slot
  let cachedSlot = 0;
  let slotFetchedAt = 0;
  app.get('/api/v1/health', async () => {
    if (config.rpcUrl && Date.now() - slotFetchedAt > 10_000) {
      try {
        const res = await fetch(config.rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
        });
        const json = await res.json() as { result?: number };
        if (json.result) { cachedSlot = json.result; slotFetchedAt = Date.now(); }
      } catch { /* ignore */ }
    }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      ...(cachedSlot ? { currentSlot: cachedSlot } : {}),
    };
  });

  // Auth routes (no auth required)
  registerAuthRoutes(app, userService, config);
  registerOAuthRoutes(app, userService, config);

  // User routes (JWT only for writes, JWT or API Key for reads)
  registerUserRoutes(app, userService, pool);

  // Backfill manager
  const { BackfillManager } = await import('../ingestion/backfill-manager.js');
  const backfillManager = new BackfillManager(pool);

  // Program routes
  registerProgramRoutes(app, programService, idlDiscoveryService, backfillManager);

  // Data routes (auth + schema middleware)
  registerDataRoutes(app, pool);

  // S2.2 — Schema introspection routes
  registerSchemaRoutes(app, pool);

  // View routes
  registerViewRoutes(app, viewService, pool);

  // Webhook routes
  registerWebhookRoutes(app, webhookService);

  // ---------------------------------------------------------------------------
  // S2.5 — Chain head slot cache (10s TTL) for indexer lag calculation
  // ---------------------------------------------------------------------------
  let _chainHeadCache: { slot: number; fetchedAt: number } | null = null;
  const CHAIN_HEAD_TTL_MS = 10_000;

  async function getChainHeadSlot(): Promise<number | null> {
    const now = Date.now();
    if (_chainHeadCache && now - _chainHeadCache.fetchedAt < CHAIN_HEAD_TTL_MS) {
      return _chainHeadCache.slot;
    }
    try {
      const rpc = getPlatformRpcUrl();
      const resp = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'confirmed' }] }),
      });
      const json = await resp.json() as { result?: number };
      if (json.result) {
        _chainHeadCache = { slot: json.result, fetchedAt: now };
        return json.result;
      }
    } catch (err) {
      console.error('[API] Failed to fetch chain head slot:', err);
    }
    return _chainHeadCache?.slot ?? null;
  }

  // Status endpoint (auth-gated)
  app.get('/api/v1/status', { preHandler: optionalAuthMiddleware }, async (request) => {
    const auth = request.authPayload;
    if (!auth) {
      return { indexer: { status: 'ok', version: '0.1.0' }, programs: [] };
    }

    const programs = await programService.listPrograms(auth.userId);

    // Build eventCounts from listPrograms data (which already has correct counts for both events and instructions)
    const programsWithCounts = programs.map((p) => {
      const eventCounts: Record<string, number> = {};
      for (const event of p.events) {
        if (event.enabled) {
          eventCounts[event.name] = event.count ?? 0;
        }
      }

      return {
        name: p.name,
        programId: p.programId,
        status: p.status,
        events: p.events.filter((e) => e.enabled).map((e) => e.name),
        eventCounts,
        eventsIndexed: Object.values(eventCounts).reduce((a, b) => a + b, 0),
        lastSlot: p.lastSlot ?? 0,
      };
    });

    // Compute overall currentSlot as max of all program lastSlots
    const currentSlot = programsWithCounts.reduce((max, p) => Math.max(max, p.lastSlot || 0), 0);

    // S2.5 — Indexer lag calculation
    const chainHeadSlot = await getChainHeadSlot();
    const lagSlots = chainHeadSlot && currentSlot ? chainHeadSlot - currentSlot : null;
    // Approximate: ~400ms per slot on Solana
    const lagSeconds = lagSlots !== null ? Math.round(lagSlots * 0.4) : null;

    return {
      indexer: {
        status: 'running',
        version: '0.1.0',
        currentSlot,
        chainHeadSlot: chainHeadSlot ?? undefined,
        lagSlots: lagSlots ?? undefined,
        lagSeconds: lagSeconds ?? undefined,
      },
      programs: programsWithCounts,
    };
  });

  // -------------------------------------------------------------------------
  // Metrics endpoint — throughput time series
  // -------------------------------------------------------------------------
  app.get('/api/v1/metrics/throughput', { preHandler: authMiddleware }, async (request) => {
    const auth = request.authPayload!;
    const query = request.query as { hours?: string; programId?: string };
    const hours = Math.min(Math.max(parseInt(query.hours || '24', 10), 1), 168); // 1h to 7d

    const userSchema = `u_${auth.userId.replace(/-/g, '').slice(0, 8)}`;
    const programs = await programService.listPrograms(auth.userId);

    // Filter to specific program if requested
    const targetPrograms = query.programId
      ? programs.filter((p) => p.id === query.programId)
      : programs;

    const bucketMinutes = hours <= 1 ? 1 : hours <= 6 ? 5 : 15; // adaptive bucket size
    const bucketCount = Math.ceil((hours * 60) / bucketMinutes);

    // Build time buckets (aligned to bucket interval boundaries)
    const now = new Date();
    // Round current time down to nearest bucket boundary
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const roundedMinutes = Math.floor(currentMinutes / bucketMinutes) * bucketMinutes;
    const alignedNow = new Date(now);
    alignedNow.setHours(Math.floor(roundedMinutes / 60), roundedMinutes % 60, 0, 0);

    const buckets: { time: string; value: number }[] = [];
    const bucketMap = new Map<string, { time: string; value: number }>();
    for (let i = bucketCount - 1; i >= 0; i--) {
      const bucketTime = new Date(alignedNow.getTime() - i * bucketMinutes * 60 * 1000);
      const hh = String(bucketTime.getHours()).padStart(2, '0');
      const mm = String(bucketTime.getMinutes()).padStart(2, '0');
      const key = `${hh}:${mm}`;
      const bucket = { time: key, value: 0 };
      buckets.push(bucket);
      bucketMap.set(key, bucket);
    }

    // Aggregate events from all enabled event tables
    for (const prog of targetPrograms) {
      for (const event of prog.events) {
        if (!event.enabled) continue;
        const tableName = event.type === 'instruction'
          ? instructionTableNameRaw(prog.name, event.name)
          : eventTableNameRaw(prog.name, event.name);
        try {
          const result = await pool.query(`
            SELECT
              date_trunc('minute', block_time) as bucket,
              COUNT(*)::int as cnt
            FROM ${quoteIdent(userSchema)}.${quoteIdent(tableName)}
            WHERE block_time > now() - interval '${hours} hours'
            GROUP BY bucket
            ORDER BY bucket
          `);
          for (const row of result.rows) {
            const rowTime = new Date(row.bucket as string);
            const hh = String(rowTime.getHours()).padStart(2, '0');
            // Round minutes to bucket boundary
            const roundedMin = Math.floor(rowTime.getMinutes() / bucketMinutes) * bucketMinutes;
            const key = `${hh}:${String(roundedMin).padStart(2, '0')}`;
            const bucket = bucketMap.get(key);
            if (bucket) bucket.value += row.cnt as number;
          }
        } catch {
          // Table might not exist
        }
      }
    }

    return { data: buckets, bucketMinutes };
  });

  return app;
}
