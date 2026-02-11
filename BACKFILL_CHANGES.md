# Backfill Changes — Demo-Limited Historical Backfill

## Summary
Enforces a 1,000 slot demo limit on historical backfill. Uses the existing RPC poller approach instead of the Rust sidecar for this small range.

## Files Modified

### `src/ingestion/backfill-manager.ts`
- **Added** `DEMO_BACKFILL_SLOT_LIMIT = 1000` constant (exported)
- **Added** `demoLimitation` field to `BackfillStatus` interface
- **Added** `validateDemoRange()` method — fetches current slot, calculates `minAllowedSlot = currentSlot - 1000`, rejects if requested startSlot is too far back, defaults to `currentSlot - 1000` if no startSlot specified
- **Modified** `startBackfill()` — now calls `validateDemoRange()` and `runRpcBackfill()` instead of `runSidecar()`
- **Added** `runRpcBackfill()` private method — fetches signatures via `getSignaturesForAddress`, filters to slot range, fetches full transactions, decodes events, writes to user schema. Includes progress tracking and rate limiting.
- **Modified** `getJobStatus()` and `getJobByUserProgram()` — both now include `demoLimitation` info in responses
- **Kept** `runSidecar()` intact (commented as "not used in demo") for future production use
- **Added** imports: `PublicKey` from `@solana/web3.js`, `TransactionPoller` from `./poller.js`

### `src/api/program-routes.ts`
- **Changed** import to include `DEMO_BACKFILL_SLOT_LIMIT` from backfill-manager
- **Modified** POST `/api/v1/programs` response — includes `demoLimitation` object when a backfill job is created

## Unchanged Files
- `src/ingestion/poller.ts` — no changes needed (TransactionPoller imported but RPC backfill uses direct Connection calls for more control over slot-range filtering)
- `src/core/config.ts` — no changes needed
- `src/services/program-service.ts` — no changes needed

## How It Works
1. When backfill is requested, `validateDemoRange()` fetches the current slot and ensures the range doesn't exceed 1,000 slots
2. `runRpcBackfill()` uses standard `@solana/web3.js` RPC calls to fetch and process transactions in the allowed range
3. All status responses include `demoLimitation` so frontend/API consumers are aware of the restriction
4. The Rust sidecar is never spawned — kept for future production use
