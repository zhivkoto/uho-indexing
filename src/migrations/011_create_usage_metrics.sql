-- ============================================================================
-- USAGE METRICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS usage_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric_type     TEXT NOT NULL
                        CHECK (metric_type IN ('api_call', 'event_indexed', 'ws_message', 'webhook_delivery')),
    count           BIGINT NOT NULL DEFAULT 0,
    period_start    TIMESTAMPTZ NOT NULL,
    period_end      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_user ON usage_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_type ON usage_metrics(user_id, metric_type, period_start);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_metrics ON usage_metrics(user_id, metric_type, period_start);
