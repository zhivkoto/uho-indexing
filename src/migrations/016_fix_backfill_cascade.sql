-- Fix: backfill_jobs FK should CASCADE on delete (matches other child tables)
ALTER TABLE backfill_jobs
  DROP CONSTRAINT IF EXISTS backfill_jobs_user_program_id_fkey,
  ADD CONSTRAINT backfill_jobs_user_program_id_fkey
    FOREIGN KEY (user_program_id) REFERENCES user_programs(id) ON DELETE CASCADE;
