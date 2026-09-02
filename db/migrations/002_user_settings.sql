BEGIN;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  alert_threshold INTEGER NOT NULL DEFAULT 50 CHECK (alert_threshold BETWEEN 0 AND 100),
  min_words INTEGER NOT NULL DEFAULT 30 CHECK (min_words >= 0),
  worker_threshold INTEGER NOT NULL DEFAULT 10000 CHECK (worker_threshold >= 0),
  auto_flag BOOLEAN NOT NULL DEFAULT TRUE,
  archive_90_days BOOLEAN NOT NULL DEFAULT TRUE,
  auto_purge BOOLEAN NOT NULL DEFAULT TRUE,
  api_key TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_user_settings_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_user_settings_updated ON user_settings;
CREATE TRIGGER trg_user_settings_updated BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION set_user_settings_updated_at();

INSERT INTO user_settings(user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
