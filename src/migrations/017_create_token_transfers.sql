-- 017: Create _token_transfers table for cross-cutting SPL Token transfer tracking
-- Stores decoded Transfer, TransferChecked, MintTo, and Burn instructions
-- from both SPL Token and Token-2022 programs.

CREATE TABLE IF NOT EXISTS _token_transfers (
    id                  BIGSERIAL PRIMARY KEY,
    program_id          TEXT NOT NULL,
    instruction_type    TEXT NOT NULL,
    source              TEXT NOT NULL,
    destination         TEXT NOT NULL,
    authority           TEXT NOT NULL,
    mint                TEXT,
    amount              NUMERIC(39,0) NOT NULL,
    decimals            INTEGER,
    slot                BIGINT NOT NULL,
    block_time          TIMESTAMPTZ,
    tx_signature        TEXT NOT NULL,
    ix_index            INTEGER NOT NULL,
    inner_ix_index      INTEGER,
    indexed_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_transfers_slot ON _token_transfers(slot);
CREATE INDEX IF NOT EXISTS idx_token_transfers_tx ON _token_transfers(tx_signature);
CREATE INDEX IF NOT EXISTS idx_token_transfers_source ON _token_transfers(source);
CREATE INDEX IF NOT EXISTS idx_token_transfers_destination ON _token_transfers(destination);
CREATE INDEX IF NOT EXISTS idx_token_transfers_mint ON _token_transfers(mint);
CREATE INDEX IF NOT EXISTS idx_token_transfers_block_time ON _token_transfers(block_time);
CREATE INDEX IF NOT EXISTS idx_token_transfers_type ON _token_transfers(instruction_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_token_transfers_tx ON _token_transfers(tx_signature, ix_index, COALESCE(inner_ix_index, -1));
