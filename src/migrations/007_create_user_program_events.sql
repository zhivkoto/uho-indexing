-- ============================================================================
-- USER PROGRAM EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_program_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_program_id     UUID NOT NULL REFERENCES user_programs(id) ON DELETE CASCADE,
    event_name          TEXT NOT NULL,
    event_type          TEXT NOT NULL DEFAULT 'event'
                            CHECK (event_type IN ('event', 'instruction')),
    enabled             BOOLEAN DEFAULT true,
    field_config        JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_program_id, event_name, event_type)
);

CREATE INDEX IF NOT EXISTS idx_user_program_events_program ON user_program_events(user_program_id);
