# Frontend Changes — Historical Backfill UI

## Files Changed

### `dashboard/src/lib/types.ts`
- Added `demoLimitation: string | null` to `BackfillStatus` interface

### `dashboard/src/app/(dashboard)/programs/new/page.tsx`
- Added cyan info banner below the "Include Historical Data" toggle explaining the demo limit: ~1,000 slots (~7 minutes)
- Banner uses `Info` icon, accent-tinted background (`rgba(34,211,238,0.06)`), subtle accent border
- Wrapped the existing start-slot input and the new banner in a `space-y-3` container

### `dashboard/src/app/(dashboard)/programs/[id]/page.tsx`
- Added `demoLimitation` display in the backfill progress card (same cyan info banner style)
- Shows between the stats grid and the error block, only when `demoLimitation` is non-null

## Notes
- The historical data toggle, backfill progress bar, status badges, retry/cancel buttons, and API integration (`includeHistoricalData`, `startFromSlot`) were **already implemented** — only the demo info banner and `demoLimitation` display were missing.
- All styling uses existing CSS variables and design system patterns. No new components created.
- Committed to `feat/historical-backfill`, not pushed.
