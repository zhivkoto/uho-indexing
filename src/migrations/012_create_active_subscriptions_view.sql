-- ============================================================================
-- ACTIVE PROGRAM SUBSCRIPTIONS (materialized view for indexer)
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS active_program_subscriptions AS
SELECT
    up.program_id,
    up.chain,
    jsonb_agg(jsonb_build_object(
        'user_id', up.user_id,
        'user_program_id', up.id,
        'schema_name', u.schema_name,
        'program_name', up.name,
        'idl', up.idl,
        'config', up.config,
        'enabled_events', (
            SELECT jsonb_agg(jsonb_build_object(
                'event_name', upe.event_name,
                'event_type', upe.event_type,
                'field_config', upe.field_config
            ))
            FROM user_program_events upe
            WHERE upe.user_program_id = up.id AND upe.enabled = true
        )
    )) AS subscribers
FROM user_programs up
JOIN users u ON u.id = up.user_id
WHERE up.status IN ('running', 'provisioning')
GROUP BY up.program_id, up.chain;

CREATE UNIQUE INDEX IF NOT EXISTS idx_aps_program ON active_program_subscriptions(program_id);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_active_subscriptions()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY active_program_subscriptions;
END;
$$ LANGUAGE plpgsql;
