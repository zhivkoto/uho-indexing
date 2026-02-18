# Design: Inner CPI Transfer Tracking & Token Balance Deltas

**Author:** Uho team · **Date:** 2026-02-18 · **Status:** Draft

---

## 1. Overview

### Problem

Uho decodes Anchor instructions and events from program transactions, but many Solana programs perform their real work via **inner CPI calls** — particularly SPL Token transfers. A `distributeRewards` instruction might take only a merkle `proof` as its arg, while the actual fund movements happen as inner `transfer` / `transferChecked` calls that Uho currently ignores.

Users like G (program `dzrevZC94tBLwuHw1dyynZxaXTWyp7yocsinyEVPtt4`) need to see *who received tokens and how much* — data that only exists in `meta.innerInstructions` and `meta.preTokenBalances` / `meta.postTokenBalances`.

### Solution

Two complementary features:

1. **CPI Transfer Tracking** — Decode SPL Token `transfer` and `transferChecked` from `meta.innerInstructions` for every transaction matching a user's program. Store as structured rows linked to the parent instruction.

2. **Token Balance Deltas** — Extract `meta.preTokenBalances` and `meta.postTokenBalances`, compute per-account-per-mint deltas, and store them. Simpler than Feature 1, provides immediate value.

Both are **program-scoped** (only for transactions that already match a user's indexed program) and **opt-in** per program.

---

## 2. Architecture

### Current Pipeline

```
RPC (getParsedTransaction)
  → TransactionPoller.poll()           # fetches ParsedTransactionWithMeta[]
    → EventDecoder.decodeTransaction() # Anchor events from logs
    → InstructionDecoder.decodeTx()    # Anchor instructions from ix data
      → FanoutWriter.writeToSubscribers()
        → EventWriter.writeEvents/writeInstructions per schema
```

### Extended Pipeline

```
RPC (getParsedTransaction)  ← already returns innerInstructions + tokenBalances
  → TransactionPoller.poll()
    → EventDecoder.decodeTransaction()
    → InstructionDecoder.decodeTransaction()
    → CpiTransferDecoder.decodeTransaction()     ← NEW
    → BalanceDeltaDecoder.decodeTransaction()     ← NEW
      → FanoutWriter.writeToSubscribers()
        → EventWriter.writeEvents/writeInstructions
        → EventWriter.writeCpiTransfers()          ← NEW
        → EventWriter.writeBalanceDeltas()         ← NEW
```

**Key insight:** `getParsedTransaction` already returns `meta.innerInstructions` and `meta.preTokenBalances`/`meta.postTokenBalances`. No additional RPC calls needed.

### New Modules

| Module | Path | Purpose |
|--------|------|---------|
| `CpiTransferDecoder` | `src/ingestion/cpi-decoder.ts` | Decodes SPL Token transfers from `meta.innerInstructions` |
| `BalanceDeltaDecoder` | `src/ingestion/balance-delta-decoder.ts` | Computes token balance deltas from pre/post balances |

Both are stateless decoders — no IDL needed. SPL Token instruction layouts are well-known constants.

---

## 3. Data Model

### 3.1 `_cpi_transfers` table (per user schema)

One row per inner SPL Token transfer/transferChecked instruction within a matched transaction.

```sql
CREATE TABLE IF NOT EXISTS _cpi_transfers (
    id                 BIGSERIAL PRIMARY KEY,
    tx_signature       TEXT NOT NULL,
    slot               BIGINT NOT NULL,
    block_time         TIMESTAMPTZ,
    program_id         TEXT NOT NULL,          -- parent program that triggered the CPI
    parent_ix_index    INTEGER NOT NULL,       -- top-level instruction index
    inner_ix_index     INTEGER NOT NULL,       -- position within inner instructions
    transfer_type      TEXT NOT NULL,          -- 'transfer' | 'transferChecked'
    from_account       TEXT NOT NULL,          -- source token account
    to_account         TEXT NOT NULL,          -- destination token account
    authority          TEXT NOT NULL,          -- signer/delegate
    amount             NUMERIC(20,0) NOT NULL, -- raw amount (no decimals applied)
    mint               TEXT,                   -- populated for transferChecked; NULL for transfer
    decimals           SMALLINT,               -- populated for transferChecked
    token_program_id   TEXT NOT NULL,          -- TokenkegQ... or Token2022...
    indexed_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpi_transfers_tx       ON _cpi_transfers (tx_signature);
CREATE INDEX IF NOT EXISTS idx_cpi_transfers_slot     ON _cpi_transfers (slot);
CREATE INDEX IF NOT EXISTS idx_cpi_transfers_from     ON _cpi_transfers (from_account);
CREATE INDEX IF NOT EXISTS idx_cpi_transfers_to       ON _cpi_transfers (to_account);
CREATE INDEX IF NOT EXISTS idx_cpi_transfers_mint     ON _cpi_transfers (mint);
CREATE INDEX IF NOT EXISTS idx_cpi_transfers_program  ON _cpi_transfers (program_id);
CREATE INDEX IF NOT EXISTS idx_cpi_transfers_time     ON _cpi_transfers (block_time);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cpi_transfers
    ON _cpi_transfers (tx_signature, parent_ix_index, inner_ix_index);
```

**Why `NUMERIC(20,0)` for amount?** SPL Token amounts are u64 (max ~1.8×10¹⁹). `BIGINT` caps at ~9.2×10¹⁸ which is sufficient for most tokens but not all edge cases. `NUMERIC(20,0)` is safe and the storage cost difference is negligible.

### 3.2 `_token_balance_changes` table (per user schema)

One row per account-mint pair that changed balances in a matched transaction.

```sql
CREATE TABLE IF NOT EXISTS _token_balance_changes (
    id                 BIGSERIAL PRIMARY KEY,
    tx_signature       TEXT NOT NULL,
    slot               BIGINT NOT NULL,
    block_time         TIMESTAMPTZ,
    program_id         TEXT NOT NULL,          -- the user's indexed program
    account_index      INTEGER NOT NULL,       -- accountKeys index
    account            TEXT NOT NULL,          -- token account address
    mint               TEXT NOT NULL,
    owner              TEXT,                   -- token account owner (may be null in old txs)
    pre_amount         NUMERIC(20,0) NOT NULL,
    post_amount        NUMERIC(20,0) NOT NULL,
    delta              NUMERIC(20,0) NOT NULL, -- post - pre (signed)
    decimals           SMALLINT NOT NULL,
    indexed_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tbc_tx       ON _token_balance_changes (tx_signature);
CREATE INDEX IF NOT EXISTS idx_tbc_slot     ON _token_balance_changes (slot);
CREATE INDEX IF NOT EXISTS idx_tbc_account  ON _token_balance_changes (account);
CREATE INDEX IF NOT EXISTS idx_tbc_mint     ON _token_balance_changes (mint);
CREATE INDEX IF NOT EXISTS idx_tbc_owner    ON _token_balance_changes (owner);
CREATE INDEX IF NOT EXISTS idx_tbc_program  ON _token_balance_changes (program_id);
CREATE INDEX IF NOT EXISTS idx_tbc_time     ON _token_balance_changes (block_time);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tbc
    ON _token_balance_changes (tx_signature, account_index);
```

Both tables live in the user's schema alongside existing event/instruction tables. The `program_id` column distinguishes data across multiple indexed programs.

---

## 4. Implementation Plan

### 4.1 New Modules

#### `src/ingestion/cpi-decoder.ts`

```typescript
// Stateless decoder. Takes ParsedTransactionWithMeta, returns DecodedCpiTransfer[].
// SPL Token program IDs:
//   TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA   (Token Program)
//   TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb   (Token-2022)
//
// For each innerInstruction set:
//   1. Check if program is SPL Token or Token-2022
//   2. Read discriminator byte: 3 = transfer, 12 = transferChecked
//   3. Decode: transfer → [amount:u64], transferChecked → [amount:u64, decimals:u8]
//   4. Map account indices to pubkeys from the instruction's accounts array
//
// Transfer accounts layout:
//   [0] source, [1] destination, [2] authority
// TransferChecked accounts layout:
//   [0] source, [1] mint, [2] destination, [3] authority
```

#### `src/ingestion/balance-delta-decoder.ts`

```typescript
// Stateless decoder. Takes ParsedTransactionWithMeta, returns DecodedBalanceDelta[].
//
// Algorithm:
//   1. Build map from (accountIndex) → preTokenBalance
//   2. Build map from (accountIndex) → postTokenBalance
//   3. Union the keys
//   4. For each key, compute delta = post.uiTokenAmount.amount - pre.uiTokenAmount.amount
//   5. Skip rows where delta == 0 (no change)
//   6. Resolve account address from tx.transaction.message.accountKeys[accountIndex]
```

### 4.2 File Changes

| File | Change | Effort |
|------|--------|--------|
| `src/core/types.ts` | Add `DecodedCpiTransfer` and `DecodedBalanceDelta` interfaces; add `cpiTransfers: boolean` and `balanceDeltas: boolean` to `SubscriberInfo` | S |
| `src/core/schema-generator.ts` | Add `generateCpiTransfersTable()` and `generateBalanceChangesTable()` functions; call from `generateUserSchemaDDL()` when features enabled | S |
| `src/ingestion/cpi-decoder.ts` | **New file.** ~120 lines. | M |
| `src/ingestion/balance-delta-decoder.ts` | **New file.** ~80 lines. | S |
| `src/ingestion/orchestrator.ts` | Instantiate the two new decoders (one per orchestrator, no IDL needed). Call them in `runLoop()` alongside existing decoders. Pass results to fanout writer. | S |
| `src/ingestion/fanout-writer.ts` | Accept `cpiTransfers[]` and `balanceDeltas[]` in `writeToSubscribers()`. Filter by subscriber config. Pass to writer. | S |
| `src/ingestion/writer.ts` | Add `writeCpiTransfers()` and `writeBalanceDeltas()` methods with batch INSERT. | M |
| `src/api/data-routes.ts` | Add 4 new endpoints (see §5). | M |
| DB migration | Add `cpi_transfers_enabled` and `balance_deltas_enabled` columns to `user_programs` table. | S |

**S** = small (~1-2h), **M** = medium (~3-4h)

### 4.3 Type Additions

```typescript
export interface DecodedCpiTransfer {
  txSignature: string;
  slot: number;
  blockTime: number | null;
  programId: string;         // user's indexed program
  parentIxIndex: number;
  innerIxIndex: number;
  transferType: 'transfer' | 'transferChecked';
  fromAccount: string;
  toAccount: string;
  authority: string;
  amount: string;            // string for u64 safety
  mint: string | null;
  decimals: number | null;
  tokenProgramId: string;
}

export interface DecodedBalanceDelta {
  txSignature: string;
  slot: number;
  blockTime: number | null;
  programId: string;
  accountIndex: number;
  account: string;
  mint: string;
  owner: string | null;
  preAmount: string;
  postAmount: string;
  delta: string;             // signed, string for precision
  decimals: number;
}
```

---

## 5. API Surface

### New Endpoints

All endpoints are user-scoped (require auth + schema middleware, same pattern as existing data routes).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/data/:program/cpi-transfers` | List CPI transfers for a program. Supports all existing filter patterns: `?from_account=X`, `?to_account=X`, `?mint=X`, `?amount_gte=N`, time/slot ranges, `after_id` cursor. |
| `GET` | `/api/v1/data/:program/cpi-transfers/:txSignature` | CPI transfers for a specific transaction. |
| `GET` | `/api/v1/data/:program/balance-changes` | Token balance deltas for a program. Filters: `?account=X`, `?mint=X`, `?owner=X`, `?delta_gt=0` (inflows), `?delta_lt=0` (outflows). |
| `GET` | `/api/v1/data/:program/balance-changes/:txSignature` | Balance changes for a specific transaction. |

### Existing Endpoint Changes

- `GET /api/v1/data/all` — Add optional `?include=cpi_transfers,balance_changes` to include these in the unified feed (stretch goal, not MVP).

### Response Format

Same pagination envelope as existing data routes:

```json
{
  "data": [...],
  "pagination": { "limit": 50, "next_cursor": 12345, "has_more": true }
}
```

---

## 6. Configuration

### Opt-In Model

Per-program toggles stored in `user_programs.config` JSONB:

```json
{
  "cpi_transfers_enabled": true,
  "balance_deltas_enabled": true
}
```

**Default:** both `false` for existing programs; `true` for new programs created after this feature ships.

### Activation Flow

1. User toggles via API: `PATCH /api/v1/programs/:id` with `{ "config": { "cpi_transfers_enabled": true } }`.
2. Backend runs migration for that user's schema (creates table if not exists).
3. Orchestrator picks up config change via PG NOTIFY (existing mechanism).
4. `SubscriberInfo` is extended with `cpiTransfers` and `balanceDeltas` booleans, parsed from `config` in `parseSubscribers()`.
5. FanoutWriter skips writing CPI/balance data for subscribers that haven't opted in.

### Schema Provisioning

Add to `generateUserSchemaDDL()`:

```typescript
if (config.cpi_transfers_enabled) {
  ddl.push(generateCpiTransfersTable());
}
if (config.balance_deltas_enabled) {
  ddl.push(generateBalanceChangesTable());
}
```

Tables use `IF NOT EXISTS` so re-provisioning is idempotent.

---

## 7. Effort Estimate

| Task | Hours | Notes |
|------|-------|-------|
| Types + interfaces | 1 | `DecodedCpiTransfer`, `DecodedBalanceDelta` |
| `cpi-decoder.ts` | 3 | Decode SPL Token transfer/transferChecked from raw bytes. Unit tests with real tx fixtures. |
| `balance-delta-decoder.ts` | 2 | Straightforward pre/post diff. Unit tests. |
| Schema generator changes | 2 | New table DDL, conditional generation |
| Writer changes | 3 | Batch INSERT for both new types, ON CONFLICT dedup |
| Orchestrator integration | 2 | Wire decoders, pass data through pipeline |
| Fanout writer changes | 1 | Filter by subscriber config, pass to writer |
| API endpoints (4 routes) | 3 | Reuse existing filter/pagination patterns |
| DB migration | 1 | `user_programs.config` column defaults |
| Integration tests | 3 | End-to-end with real mainnet tx fixtures |
| Docs / changelog | 1 | API docs, migration guide |
| **Total** | **~22h** | ~3 developer-days |

Recommended order: Types → Decoders (testable in isolation) → Schema → Writer → Orchestrator → API → Integration tests.

---

## 8. Tradeoffs & Risks

### Storage Growth

- **CPI transfers:** A DeFi swap tx typically has 2-4 inner transfers. At ~200 bytes/row, 1M transactions ≈ 800MB. Manageable per user, but programs like Jupiter could be noisy.
- **Balance deltas:** Typically 2-6 rows per tx. Similar growth profile.
- **Mitigation:** Both features are opt-in. Add a note about storage implications in the UI. Consider a retention policy / auto-archive for older data in a future sprint.

### RPC Data Availability

- `getParsedTransaction` returns `innerInstructions` and `preTokenBalances` / `postTokenBalances` by default. No additional RPC cost.
- **Risk:** Some RPC providers may not return `innerInstructions` for very old transactions (before a certain slot). The decoder should handle `null` gracefully.
- **Risk:** `preTokenBalances` / `postTokenBalances` can be incomplete if the validator didn't record them. Pre-2022 transactions may lack owner info. We store `NULL` for missing fields.

### Edge Cases

| Case | Handling |
|------|----------|
| `transfer` without mint info | `mint` column is NULL. Users can JOIN with on-chain token account data or use balance-changes (which always has mint). |
| Token-2022 transfers | Same instruction layout. `token_program_id` column distinguishes them. |
| Transactions with no inner instructions | Decoder returns empty array. No rows written. |
| CPI depth > 1 (nested CPIs) | `meta.innerInstructions` flattens all depths. We capture everything under the parent ix. Inner ix index is the position in the flat list. |
| Multiple programs in same tx | We only capture inner instructions whose parent ix matches the user's program. Filter by `inner.index` matching the user program's top-level ix indices. |
| Failed transactions | Poller already skips failed txs (`sig.err` check). No change needed. |

### Design Decisions

- **Per-schema tables (not per-program tables):** `_cpi_transfers` and `_token_balance_changes` store a `program_id` column to distinguish data across programs. This avoids table proliferation and simplifies the API.
- **Raw amounts (not human-readable):** We store raw u64 amounts without dividing by 10^decimals. `decimals` is included for `transferChecked` and balance changes. This avoids precision loss and lets the client format as needed.
- **Decode from raw bytes, not parsed instructions:** `getParsedTransaction` gives parsed inner instructions for known programs, but the format is inconsistent (varies by RPC version). Decoding from raw `data` bytes is deterministic and future-proof.

---

## 9. Future Extensions

1. **SOL transfers (system program):** Same pattern — decode SystemProgram `transfer` (discriminator `[2, 0, 0, 0]`, then u64 lamports) from inner instructions. Add a `_sol_transfers` table or extend `_cpi_transfers` with a `currency` discriminator.

2. **Other CPI programs:** Associated Token Account creates, Metaplex instructions, etc. The decoder pattern is extensible — add a registry of known program → instruction layouts.

3. **Mint resolution for `transfer`:** Enrich `transfer` rows (which lack mint) by looking up the token account's mint via RPC `getAccountInfo` or by cross-referencing with `_token_balance_changes` in the same tx.

4. **Real-time WebSocket streaming:** Extend the existing PG NOTIFY → WebSocket pipeline to include CPI transfers and balance changes. Payload: `{ type: "cpi_transfer", ... }`.

5. **Aggregation views:** Pre-built views like "net inflow per account per day" or "top recipients by volume" using the existing custom views system.

6. **Retention policies:** Auto-archive or drop rows older than N days for high-volume programs. Configurable per user.
