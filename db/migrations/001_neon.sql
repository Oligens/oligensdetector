BEGIN;

-- SAFETY GUARD: this file is the historical bootstrap migration and contains
-- destructive DROP statements. Never execute it against an initialized DB.
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    RAISE EXCEPTION '001_neon.sql is bootstrap-only and was blocked because public.users already exists. Use 002_production_safety.sql or the safe migration runner.';
  END IF;
END $$;

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOTE: The remainder of the historical bootstrap schema is intentionally
-- preserved from the original migration. It must only run on an empty DB.
