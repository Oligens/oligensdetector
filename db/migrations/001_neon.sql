BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS promo_redemptions, payments, reports, analyses, usage_events, institutional_databases, auth_sessions, subscriptions, promo_codes, plan_prices, users CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS payment_provider CASCADE;
DROP TYPE IF EXISTS billing_period CASCADE;
DROP TYPE IF EXISTS subscription_status CASCADE;
DROP TYPE IF EXISTS subscription_plan CASCADE;

CREATE TYPE subscription_plan AS ENUM ('free','flash','pro','gold');
CREATE TYPE subscription_status AS ENUM ('active','expired','cancelled','pending');
CREATE TYPE billing_period AS ENUM ('monthly','yearly','lifetime');
CREATE TYPE payment_provider AS ENUM ('zakapro','moncash','natcash');
CREATE TYPE payment_status AS ENUM ('pending','processing','paid','failed','cancelled','expired','refunded');

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_code_hash TEXT,
  verification_code_expires_at TIMESTAMPTZ,
  verification_attempts INTEGER NOT NULL DEFAULT 0,
  password_reset_token_hash TEXT,
  password_reset_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX idx_users_email ON users(email);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan subscription_plan NOT NULL DEFAULT 'free',
  status subscription_status NOT NULL DEFAULT 'active',
  billing_period billing_period,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  analyses_per_day INTEGER,
  max_words_per_analysis INTEGER,
  unlimited_database BOOLEAN NOT NULL DEFAULT FALSE,
  advanced_reports BOOLEAN NOT NULL DEFAULT FALSE,
  advanced_statistics BOOLEAN NOT NULL DEFAULT FALSE,
  advanced_history BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_expires_at ON subscriptions(expires_at);

CREATE TABLE plan_prices (
  id TEXT PRIMARY KEY,
  plan subscription_plan NOT NULL,
  billing_period billing_period NOT NULL,
  price_htg NUMERIC(12,2) NOT NULL CHECK (price_htg >= 0),
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan,billing_period)
);

INSERT INTO plan_prices(id,plan,billing_period,price_htg,discount_percent) VALUES
(gen_random_uuid()::TEXT,'free','monthly',0,0),
(gen_random_uuid()::TEXT,'flash','monthly',65.85,0),
(gen_random_uuid()::TEXT,'pro','monthly',250,0),
(gen_random_uuid()::TEXT,'pro','yearly',2610,13),
(gen_random_uuid()::TEXT,'gold','monthly',2500,0),
(gen_random_uuid()::TEXT,'gold','yearly',26100,13);

CREATE TABLE promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_percent NUMERIC(5,2),
  discount_amount NUMERIC(12,2),
  applicable_period TEXT,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promo_period_check CHECK (applicable_period IS NULL OR applicable_period IN ('monthly','yearly','lifetime')),
  CONSTRAINT promo_discount_check CHECK ((discount_percent IS NOT NULL AND discount_amount IS NULL) OR (discount_percent IS NULL AND discount_amount IS NOT NULL)),
  CONSTRAINT promo_percent_check CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100),
  CONSTRAINT promo_amount_check CHECK (discount_amount IS NULL OR discount_amount >= 0),
  CONSTRAINT promo_max_uses_check CHECK (max_uses IS NULL OR max_uses > 0)
);
CREATE INDEX idx_promo_codes_code ON promo_codes(code);
CREATE INDEX idx_promo_codes_active ON promo_codes(is_active);

INSERT INTO promo_codes(id,code,discount_percent,applicable_period,max_uses,expires_at,is_active) VALUES
(gen_random_uuid()::TEXT,'MENSUEL20',20,'monthly',100,NOW()+INTERVAL '1 year',TRUE),
(gen_random_uuid()::TEXT,'ANNUEL30',30,'yearly',500,NOW()+INTERVAL '1 year',TRUE),
(gen_random_uuid()::TEXT,'LIFETIMEVIP',100,'lifetime',10,NOW()+INTERVAL '6 months',TRUE);

CREATE TABLE promo_redemptions (
  id TEXT PRIMARY KEY,
  promo_code_id TEXT NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  billing_period billing_period NOT NULL,
  original_amount NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) NOT NULL,
  final_amount NUMERIC(12,2) NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(promo_code_id,user_id)
);
CREATE INDEX idx_promo_redemptions_user ON promo_redemptions(user_id);
CREATE INDEX idx_promo_redemptions_promo ON promo_redemptions(promo_code_id);

CREATE TABLE analyses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size_kb NUMERIC(12,2),
  word_count INTEGER NOT NULL DEFAULT 0,
  character_count INTEGER,
  sentence_count INTEGER,
  ai_score NUMERIC(5,2),
  plagiarism_score NUMERIC(5,2),
  reference_score NUMERIC(5,2),
  human_score NUMERIC(5,2),
  language TEXT,
  analysis_result JSONB,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_analyses_user ON analyses(user_id);
CREATE INDEX idx_analyses_created ON analyses(created_at DESC);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  analysis_id TEXT REFERENCES analyses(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL DEFAULT 'pdf',
  file_url TEXT,
  report_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reports_user ON reports(user_id);

CREATE TABLE institutional_databases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  document_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_institutional_databases_user ON institutional_databases(user_id);

CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_usage_user_date ON usage_events(user_id,created_at DESC);
CREATE INDEX idx_usage_analysis ON usage_events(user_id,event_type,created_at DESC);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider payment_provider NOT NULL,
  provider_transaction_id TEXT UNIQUE,
  plan subscription_plan NOT NULL,
  billing_period billing_period NOT NULL,
  phone_number TEXT,
  original_amount NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'HTG',
  promo_code_id TEXT REFERENCES promo_codes(id) ON DELETE SET NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  checkout_url TEXT,
  provider_response JSONB,
  webhook_received_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_transaction ON payments(provider_transaction_id);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_institutional_databases_updated BEFORE UPDATE ON institutional_databases FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION create_free_subscription() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO subscriptions(id,user_id,plan,status,billing_period,max_words_per_analysis,analyses_per_day,unlimited_database,advanced_reports,advanced_statistics,advanced_history)
  VALUES(gen_random_uuid()::TEXT,NEW.id,'free','active','monthly',2500,NULL,FALSE,FALSE,FALSE,FALSE);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_create_free_subscription AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION create_free_subscription();

CREATE OR REPLACE FUNCTION expire_subscriptions() RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE affected INTEGER;
BEGIN
  UPDATE subscriptions SET status='expired',plan='free',billing_period='monthly',expires_at=NULL,analyses_per_day=NULL,max_words_per_analysis=2500,unlimited_database=FALSE,advanced_reports=FALSE,advanced_statistics=FALSE,advanced_history=FALSE,updated_at=NOW()
  WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= NOW() AND plan <> 'free';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION redeem_promo(p_user_id TEXT,p_code TEXT,p_billing_period billing_period,p_original_amount NUMERIC)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_promo promo_codes%ROWTYPE; v_discount NUMERIC(12,2); v_final NUMERIC(12,2);
BEGIN
  p_code := UPPER(TRIM(p_code));
  SELECT * INTO v_promo FROM promo_codes WHERE code=p_code FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',FALSE,'code','INVALID_PROMO','message','Code promo invalide.'); END IF;
  IF NOT v_promo.is_active THEN RETURN jsonb_build_object('success',FALSE,'code','PROMO_INACTIVE','message','Ce code promo est désactivé.'); END IF;
  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at <= NOW() THEN RETURN jsonb_build_object('success',FALSE,'code','PROMO_EXPIRED','message','Ce code promo a expiré.'); END IF;
  IF v_promo.max_uses IS NOT NULL AND v_promo.used_count >= v_promo.max_uses THEN RETURN jsonb_build_object('success',FALSE,'code','PROMO_LIMIT_REACHED','message','Le nombre maximum d''utilisations est atteint.'); END IF;
  IF v_promo.applicable_period IS NOT NULL AND v_promo.applicable_period <> p_billing_period::TEXT THEN RETURN jsonb_build_object('success',FALSE,'code','PROMO_PERIOD_MISMATCH','message','Ce code promo ne correspond pas à la période choisie.'); END IF;
  IF EXISTS(SELECT 1 FROM promo_redemptions WHERE promo_code_id=v_promo.id AND user_id=p_user_id) THEN RETURN jsonb_build_object('success',FALSE,'code','PROMO_ALREADY_USED','message','Vous avez déjà utilisé ce code promo.'); END IF;
  IF v_promo.discount_percent IS NOT NULL THEN v_discount=ROUND(p_original_amount*v_promo.discount_percent/100,2); ELSE v_discount=LEAST(v_promo.discount_amount,p_original_amount); END IF;
  v_discount=GREATEST(0,LEAST(v_discount,p_original_amount));
  v_final=GREATEST(0,p_original_amount-v_discount);
  UPDATE promo_codes SET used_count=used_count+1 WHERE id=v_promo.id;
  INSERT INTO promo_redemptions(id,promo_code_id,user_id,billing_period,original_amount,discount_amount,final_amount)
  VALUES(gen_random_uuid()::TEXT,v_promo.id,p_user_id,p_billing_period,p_original_amount,v_discount,v_final);
  RETURN jsonb_build_object('success',TRUE,'promoCode',v_promo.code,'billingPeriod',p_billing_period::TEXT,'originalAmount',p_original_amount,'discountPercent',v_promo.discount_percent,'discountAmount',v_discount,'finalAmount',v_final);
END;
$$;

CREATE OR REPLACE FUNCTION consume_analysis(p_user_id TEXT,p_word_count INTEGER)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_subscription subscriptions%ROWTYPE; v_today_count INTEGER;
BEGIN
  PERFORM expire_subscriptions();
  SELECT * INTO v_subscription FROM subscriptions WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed',FALSE,'code','NO_SUBSCRIPTION'); END IF;
  IF v_subscription.status <> 'active' THEN RETURN jsonb_build_object('allowed',FALSE,'code','SUBSCRIPTION_INACTIVE'); END IF;
  IF p_word_count < 0 THEN RETURN jsonb_build_object('allowed',FALSE,'code','INVALID_WORD_COUNT'); END IF;
  IF v_subscription.max_words_per_analysis IS NOT NULL AND p_word_count > v_subscription.max_words_per_analysis THEN RETURN jsonb_build_object('allowed',FALSE,'code','WORD_LIMIT','maxWords',v_subscription.max_words_per_analysis); END IF;
  IF v_subscription.plan='flash' THEN
    SELECT COUNT(*) INTO v_today_count FROM usage_events WHERE user_id=p_user_id AND event_type='analysis' AND created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day';
    IF v_today_count >= 1 THEN RETURN jsonb_build_object('allowed',FALSE,'code','DAILY_LIMIT','limit',1); END IF;
  END IF;
  INSERT INTO usage_events(id,user_id,event_type,word_count) VALUES(gen_random_uuid()::TEXT,p_user_id,'analysis',p_word_count);
  RETURN jsonb_build_object('allowed',TRUE,'plan',v_subscription.plan::TEXT,'words',p_word_count);
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='id' AND data_type='text') THEN RAISE EXCEPTION 'users.id doit être TEXT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='auth_sessions' AND column_name='user_id' AND data_type='text') THEN RAISE EXCEPTION 'auth_sessions.user_id doit être TEXT'; END IF;
END;
$$;

COMMIT;
