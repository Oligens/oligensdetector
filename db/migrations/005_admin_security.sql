-- 005_admin_security.sql
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

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (LOWER(email));

-- The password is stored only as a bcrypt hash. The supplied password was
-- hashed with bcrypt cost 12 before being placed here.
INSERT INTO admin_users (email, password_hash, gemini_api_keys)
VALUES (
  'cleefolig@gmail.com',
  '$2b$12$cQCh0LwHa1mlJKDM4Dulwe6x8K0SeRcMBrC7sOZt9TK0jc0h/FToy',
  ARRAY[]::TEXT[]
)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    updated_at = CURRENT_TIMESTAMP;

-- Optional hardening: the application never returns raw keys to the browser.
