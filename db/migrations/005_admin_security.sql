-- 005_admin_security.sql
-- Admin storage and hardening. This migration is intentionally non-destructive:
-- an existing administrator password is NEVER overwritten by a migration.

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  gemini_api_keys TEXT[] NOT NULL DEFAULT '{}',
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ NULL,
  last_login_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS gemini_api_keys TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ NULL;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (LOWER(email));

-- Bootstrap is intentionally omitted here.
-- The application creates the admin row only when it is absent and only when
-- ADMIN_BOOTSTRAP_PASSWORD is explicitly configured at runtime.
-- Existing credentials are never replaced by a migration.
