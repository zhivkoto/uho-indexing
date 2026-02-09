-- ============================================================================
-- USER VIEWS (P2-1: custom aggregation views)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_views (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_program_id     UUID NOT NULL REFERENCES user_programs(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    definition          JSONB NOT NULL,
    materialized        BOOLEAN DEFAULT false,
    refresh_interval_ms INTEGER DEFAULT 60000,
    last_refreshed      TIMESTAMPTZ,
    status              TEXT DEFAULT 'pending'
                            CHECK (status IN ('pending', 'active', 'error', 'disabled')),
    error               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_views_user ON user_views(user_id);
CREATE INDEX IF NOT EXISTS idx_user_views_program ON user_views(user_program_id);
