-- ============================================================================
-- NOTIFY TRIGGER: fires when user_programs changes
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_program_change()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('uho_program_changes', json_build_object(
        'action', TG_OP,
        'program_id', COALESCE(NEW.program_id, OLD.program_id),
        'user_id', COALESCE(NEW.user_id, OLD.user_id),
        'status', COALESCE(NEW.status, OLD.status)
    )::text);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to be idempotent
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_programs_change'
    ) THEN
        DROP TRIGGER trg_user_programs_change ON user_programs;
    END IF;
END
$$;

CREATE TRIGGER trg_user_programs_change
    AFTER INSERT OR UPDATE OR DELETE ON user_programs
    FOR EACH ROW EXECUTE FUNCTION notify_program_change();
