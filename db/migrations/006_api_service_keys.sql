-- 006_api_service_keys.sql
-- Stockage normalisé et chiffré des clés tierces gérées depuis la console admin.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS api_service_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL CHECK (service_name IN ('gemini','humanizer','plagiarism','hallucination','references')),
  key_name TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  usage_count BIGINT NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_used_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT,
  updated_by BIGINT,
  UNIQUE(service_name, key_name)
);

CREATE INDEX IF NOT EXISTS idx_api_service_keys_active
  ON api_service_keys(service_name, is_active, priority);

CREATE INDEX IF NOT EXISTS idx_api_service_keys_service
  ON api_service_keys(service_name);

CREATE OR REPLACE FUNCTION touch_api_service_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_api_service_keys_updated_at ON api_service_keys;
CREATE TRIGGER trg_api_service_keys_updated_at
BEFORE UPDATE ON api_service_keys
FOR EACH ROW EXECUTE FUNCTION touch_api_service_keys_updated_at();
