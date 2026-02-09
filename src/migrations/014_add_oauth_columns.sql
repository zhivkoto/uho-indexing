-- ============================================================================
-- OAUTH COLUMNS
-- Add Google, GitHub, and wallet auth identifiers to users table.
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Allow password_hash to be empty for OAuth-only users
ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id) WHERE github_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address) WHERE wallet_address IS NOT NULL;
