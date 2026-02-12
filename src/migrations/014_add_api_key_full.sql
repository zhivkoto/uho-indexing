-- Store full API key for reveal functionality
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_full TEXT;
