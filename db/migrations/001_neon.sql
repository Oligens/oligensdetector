BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE subscription_plan AS ENUM ('free','flash','pro','gold');
CREATE TYPE subscription_status AS ENUM ('active','expired','cancelled','none');
CREATE TYPE billing_period AS ENUM ('month','year','lifetime');
CREATE TYPE payment_provider AS ENUM ('zakapro','moncash','natcash');
CREATE TYPE payment_status AS ENUM ('pending','paid','failed','cancelled','expired');
CREATE TYPE usage_event_type AS ENUM ('analysis','humanization','report','login');

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_code_hash TEXT,
  verification_expires_at TIMESTAMPTZ,
  verification_attempts INTEGER NOT NULL DEFAULT 0,
  last_verification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan subscription_plan NOT NULL DEFAULT 'free',
  status subscription_status NOT NULL DEFAULT 'active',
  billing_period billing_period,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  flash_started_at TIMESTAMPTZ,
  flash_daily_limit INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type usage_event_type NOT NULL,
  words INTEGER NOT NULL DEFAULT 0 CHECK (words >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_user_event_date ON usage_events(user_id,event_type,created_at DESC);

CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analyses_user_date ON analyses(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL DEFAULT 'analysis',
  storage_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  discount_amount_htg NUMERIC(12,2) CHECK (discount_amount_htg IS NULL OR discount_amount_htg >= 0),
  applicable_plans subscription_plan[],
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id UUID,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(promo_code_id,user_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider payment_provider NOT NULL,
  external_transaction_id TEXT UNIQUE,
  plan subscription_plan NOT NULL,
  billing_period billing_period NOT NULL,
  amount_htg NUMERIC(12,2) NOT NULL CHECK (amount_htg >= 0),
  phone TEXT,
  promo_code TEXT,
  status payment_status NOT NULL DEFAULT 'pending',
  checkout_url TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE promo_redemptions
  DROP CONSTRAINT IF EXISTS promo_redemptions_payment_id_fkey;
ALTER TABLE promo_redemptions
  ADD CONSTRAINT promo_redemptions_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_user_date ON payments(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_external ON payments(external_transaction_id);

CREATE TABLE IF NOT EXISTS institutional_databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  document_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id,expires_at);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_institutional_databases_updated_at ON institutional_databases;
CREATE TRIGGER trg_institutional_databases_updated_at BEFORE UPDATE ON institutional_databases FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION create_free_subscription() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions(user_id,plan,status) VALUES(NEW.id,'free','active') ON CONFLICT(user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_free_subscription ON users;
CREATE TRIGGER trg_create_free_subscription AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION create_free_subscription();

CREATE OR REPLACE FUNCTION expire_subscriptions() RETURNS INTEGER AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE subscriptions
  SET plan='free',status='active',billing_period=NULL,current_period_start=NULL,current_period_end=NULL,flash_started_at=NULL,flash_daily_limit=NULL
  WHERE plan <> 'free'
    AND status='active'
    AND ((current_period_end IS NOT NULL AND current_period_end <= now())
      OR (plan='flash' AND flash_started_at IS NOT NULL AND flash_started_at <= now() - interval '7 days'));
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION consume_analysis(p_user_id UUID, p_words INTEGER)
RETURNS TABLE(allowed BOOLEAN, plan subscription_plan, reason TEXT, analyses_today INTEGER) AS $$
DECLARE s subscriptions%ROWTYPE; today_count INTEGER;
BEGIN
  PERFORM expire_subscriptions();
  SELECT * INTO s FROM subscriptions WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE,'free'::subscription_plan,'subscription_missing'::TEXT,0;
    RETURN;
  END IF;
  IF p_words < 0 THEN
    RETURN QUERY SELECT FALSE,s.plan,'invalid_word_count'::TEXT,0; RETURN;
  END IF;
  IF s.plan='free' AND p_words > 2500 THEN
    RETURN QUERY SELECT FALSE,s.plan,'free_word_limit_2500'::TEXT,0; RETURN;
  END IF;
  SELECT count(*)::INTEGER INTO today_count FROM usage_events
    WHERE user_id=p_user_id AND event_type='analysis' AND created_at >= date_trunc('day',now());
  IF s.plan='flash' AND today_count >= 1 THEN
    RETURN QUERY SELECT FALSE,s.plan,'flash_daily_limit_reached'::TEXT,today_count; RETURN;
  END IF;
  INSERT INTO usage_events(user_id,event_type,words) VALUES(p_user_id,'analysis',p_words);
  RETURN QUERY SELECT TRUE,s.plan,'allowed'::TEXT,today_count+1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION redeem_promo(p_code TEXT, p_user_id UUID)
RETURNS TABLE(valid BOOLEAN, discount_percent NUMERIC, discount_amount_htg NUMERIC, reason TEXT) AS $$
DECLARE p promo_codes%ROWTYPE;
BEGIN
  SELECT * INTO p FROM promo_codes WHERE code=upper(trim(p_code)) AND active FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT FALSE,0::NUMERIC,0::NUMERIC,'invalid_code'::TEXT; RETURN; END IF;
  IF now() < p.valid_from OR (p.valid_until IS NOT NULL AND now() > p.valid_until) THEN
    RETURN QUERY SELECT FALSE,0::NUMERIC,0::NUMERIC,'expired_code'::TEXT; RETURN;
  END IF;
  IF p.max_uses IS NOT NULL AND p.used_count >= p.max_uses THEN
    RETURN QUERY SELECT FALSE,0::NUMERIC,0::NUMERIC,'usage_limit_reached'::TEXT; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM promo_redemptions WHERE promo_code_id=p.id AND user_id=p_user_id) THEN
    RETURN QUERY SELECT FALSE,0::NUMERIC,0::NUMERIC,'already_used'::TEXT; RETURN;
  END IF;
  RETURN QUERY SELECT TRUE,p.discount_percent,COALESCE(p.discount_amount_htg,0),'valid'::TEXT;
END;
$$ LANGUAGE plpgsql;

INSERT INTO promo_codes(code,discount_percent,active)
VALUES ('WELCOME10',10,TRUE)
ON CONFLICT(code) DO NOTHING;

COMMIT;
