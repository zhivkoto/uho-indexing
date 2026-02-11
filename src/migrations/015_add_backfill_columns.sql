-- Add backfill tracking columns to _uho_state table.
-- These columns are added dynamically per-schema via ALTER TABLE since
-- _uho_state lives in user schemas. This migration tracks the schema version.
--
-- The actual column additions happen at runtime via BackfillManager when
-- it initializes for a schema. This migration creates a platform-level
-- tracking table for backfill jobs.

CREATE TABLE IF NOT EXISTS backfill_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    user_program_id UUID NOT NULL REFERENCES user_programs(id),
    program_id      TEXT NOT NULL,
    schema_name     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed
    progress        REAL DEFAULT 0,
    start_slot      BIGINT,
    end_slot        BIGINT,
    current_slot    BIGINT,
    events_found    INTEGER DEFAULT 0,
    events_skipped  INTEGER DEFAULT 0,
    error           TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backfill_jobs_user ON backfill_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_backfill_jobs_program ON backfill_jobs(user_program_id);
CREATE INDEX IF NOT EXISTS idx_backfill_jobs_status ON backfill_jobs(status);
