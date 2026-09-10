import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { maskSecret } from "../src/lib/security/secretMask";

const COOKIE = "oligens_session";

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is not configured.");
  try {
    const url = new URL(value);
    const sslmode = url.searchParams.get("sslmode");
    if (sslmode && sslmode !== "verify-full") url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  } catch { return value; }
}

let pool: Pool | undefined;
function getPool() {
  if (pool) return pool;
  pool = new Pool({ connectionString: databaseUrl(), max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, ssl: { rejectUnauthorized: true }, application_name: "oligens-detector-settings" });
  pool.on("error", error => console.error("[settings] idle client error", error));
  return pool;
}

function token(req: VercelRequest) {
  return (req.headers.cookie ?? "").split(";").map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}

async function userId(req: VercelRequest) {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not configured.");
  const raw = token(req);
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, secret, { issuer: "oligens-detector" }) as jwt.JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch { return null; }
}

const defaults = { alert_threshold: 50, min_words: 30, worker_threshold: 10_000, auto_flag: true, archive_90_days: true, auto_purge: true, api_key: "", endpoint: "" };

function booleanValue(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function integerValue(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && Number.isFinite(n) ? n : NaN;
}

function clean(body: Record<string, unknown>, existingApiKey = "") {
  const suppliedApiKey = String(body.api_key ?? "").trim();
  const apiKey = suppliedApiKey && suppliedApiKey !== maskSecret(existingApiKey) ? suppliedApiKey.slice(0, 500) : existingApiKey;
  const alertThreshold = integerValue(body.alert_threshold, defaults.alert_threshold);
  const minWords = integerValue(body.min_words, defaults.min_words);
  const workerThreshold = integerValue(body.worker_threshold, defaults.worker_threshold);
  return {
    alert_threshold: Number.isNaN(alertThreshold) ? NaN : Math.min(100, Math.max(0, alertThreshold)),
    min_words: Number.isNaN(minWords) ? NaN : Math.max(0, minWords),
    worker_threshold: Number.isNaN(workerThreshold) ? NaN : Math.max(0, workerThreshold),
    auto_flag: booleanValue(body.auto_flag, defaults.auto_flag),
    archive_90_days: booleanValue(body.archive_90_days, defaults.archive_90_days),
    auto_purge: booleanValue(body.auto_purge, defaults.auto_purge),
    api_key: apiKey,
    endpoint: String(body.endpoint ?? defaults.endpoint).trim().slice(0, 1000),
  };
}

function publicSettings(row: Record<string, unknown>) {
  return { ...row, api_key: maskSecret(typeof row.api_key === "string" ? row.api_key : "") };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!["GET", "PUT", "PATCH"].includes(req.method ?? "")) return res.status(405).json({ error: "Méthode non autorisée." });
  try {
    const id = await userId(req);
    if (!id) return res.status(401).json({ error: "Authentification requise." });
    const db = getPool();

    if (req.method === "GET") {
      const r = await db.query("SELECT alert_threshold,min_words,worker_threshold,auto_flag,archive_90_days,auto_purge,api_key,endpoint,updated_at FROM user_settings WHERE user_id=$1", [id]);
      if (!r.rows[0]) {
        const created = await db.query("INSERT INTO user_settings(user_id) VALUES($1) RETURNING alert_threshold,min_words,worker_threshold,auto_flag,archive_90_days,auto_purge,api_key,endpoint,updated_at", [id]);
        return res.status(200).json({ settings: publicSettings(created.rows[0]) });
      }
      return res.status(200).json({ settings: publicSettings(r.rows[0]) });
    }

    const b = (req.body ?? {}) as Record<string, unknown>;
    const existing = await db.query<{ api_key: string }>("SELECT api_key FROM user_settings WHERE user_id=$1", [id]);
    const s = clean(b, existing.rows[0]?.api_key ?? "");
    if (![s.alert_threshold, s.min_words, s.worker_threshold].every(Number.isInteger)) return res.status(400).json({ error: "Paramètres numériques invalides.", code: "INVALID_SETTINGS" });

    const r = await db.query(`INSERT INTO user_settings(user_id,alert_threshold,min_words,worker_threshold,auto_flag,archive_90_days,auto_purge,api_key,endpoint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id) DO UPDATE SET alert_threshold=EXCLUDED.alert_threshold,min_words=EXCLUDED.min_words,worker_threshold=EXCLUDED.worker_threshold,auto_flag=EXCLUDED.auto_flag,archive_90_days=EXCLUDED.archive_90_days,auto_purge=EXCLUDED.auto_purge,api_key=EXCLUDED.api_key,endpoint=EXCLUDED.endpoint RETURNING alert_threshold,min_words,worker_threshold,auto_flag,archive_90_days,auto_purge,api_key,endpoint,updated_at`, [id,s.alert_threshold,s.min_words,s.worker_threshold,s.auto_flag,s.archive_90_days,s.auto_purge,s.api_key,s.endpoint]);
    return res.status(200).json({ settings: publicSettings(r.rows[0]) });
  } catch (error) {
    console.error("[settings]", error);
    const message = error instanceof Error ? error.message : "Service indisponible.";
    if (message.includes("DATABASE_URL") || message.includes("AUTH_SECRET")) return res.status(503).json({ error: message });
    if (/relation .*user_settings.*does not exist/i.test(message)) return res.status(503).json({ error: "Migration de base requise.", code: "DATABASE_MIGRATION_REQUIRED" });
    return res.status(500).json({ error: "Impossible de sauvegarder les paramètres." });
  }
}
