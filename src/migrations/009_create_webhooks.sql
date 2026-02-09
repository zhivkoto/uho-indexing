-- ============================================================================
-- WEBHOOKS (P2-4)
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhooks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_program_id     UUID NOT NULL REFERENCES user_programs(id) ON DELETE CASCADE,
    url                 TEXT NOT NULL,
    secret              TEXT NOT NULL,
    events              TEXT[] NOT NULL DEFAULT '{}',
    filters             JSONB DEFAULT '{}'::jsonb,
    active              BOOLEAN DEFAULT true,
    last_triggered      TIMESTAMPTZ,
    failure_count       INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_program ON webhooks(user_program_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active) WHERE active = true;
