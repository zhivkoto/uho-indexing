-- ============================================================================
-- USER PROGRAMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_programs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    idl         JSONB NOT NULL,
    chain       TEXT NOT NULL DEFAULT 'solana-mainnet',
    status      TEXT NOT NULL DEFAULT 'provisioning'
                    CHECK (status IN ('provisioning', 'running', 'paused', 'error', 'archived')),
    config      JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, program_id)
);

CREATE INDEX IF NOT EXISTS idx_user_programs_user ON user_programs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_programs_program ON user_programs(program_id);
CREATE INDEX IF NOT EXISTS idx_user_programs_status ON user_programs(status);
