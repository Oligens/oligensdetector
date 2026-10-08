import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { Pool, type QueryResultRow } from "pg";

const COOKIE = "oligens_admin_session";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL?.trim() || "cleefolig@gmail.com").toLowerCase();

type Admin = { id: string; email: string };

let pool: Pool | undefined;

function dbUrl() {
  const value =
    process.env.DATABASE_URL?.trim() ||
    process.env.DIRECT_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.NEON_DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL non configurée.");
  return value;
}

function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: dbUrl(),
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
    application_name: "oligens-detector-admin",
  });
  pool.on("error", (error) => console.error("[admin-db] idle error", error));
  return pool;
}

async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
) {
  return getPool().query<T>(sql, values);
}

let adminUsersSchemaPromise: Promise<void> | undefined;
let serviceKeysSchemaPromise: Promise<void> | undefined;

async function ensureAdminUsersSchema() {
  if (adminUsersSchemaPromise) return adminUsersSchemaPromise;

  adminUsersSchemaPromise = (async () => {
    await query(`
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
      )
    `);

    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS gemini_api_keys TEXT[] NOT NULL DEFAULT '{}'`);
    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ NULL`);
    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL`);
    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    await query(`CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (LOWER(email))`);

    const existing = await query<{ id: string }>(
      "SELECT id FROM admin_users WHERE LOWER(email)=LOWER($1) LIMIT 1",
      [ADMIN_EMAIL],
    );
    if (!existing.rowCount) {
      const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
      if (!bootstrapPassword || bootstrapPassword.length < 12) {
        throw new Error("ADMIN_BOOTSTRAP_PASSWORD doit contenir au moins 12 caractères lors du premier bootstrap.");
      }
      const passwordHash = await bcrypt.hash(bootstrapPassword, 12);
      await query(
        `INSERT INTO admin_users (email,password_hash,gemini_api_keys)
         VALUES ($1,$2,ARRAY[]::TEXT[])
         ON CONFLICT (email) DO NOTHING`,
        [ADMIN_EMAIL, passwordHash],
      );
    }
  })().catch((error) => {
    adminUsersSchemaPromise = undefined;
    throw error;
  });

  return adminUsersSchemaPromise;
}

async function ensureServiceKeysSchema() {
  if (serviceKeysSchemaPromise) return serviceKeysSchemaPromise;

  serviceKeysSchemaPromise = (async () => {
    await ensureAdminUsersSchema();
    await query(`
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
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_api_service_keys_active ON api_service_keys(service_name,is_active,priority)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_api_service_keys_service ON api_service_keys(service_name)`);
    await query(`
      CREATE OR REPLACE FUNCTION touch_api_service_keys_updated_at()
      RETURNS TRIGGER AS $
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $ LANGUAGE plpgsql
    `);
    await query("DROP TRIGGER IF EXISTS trg_api_service_keys_updated_at ON api_service_keys");
    await query(`
      CREATE TRIGGER trg_api_service_keys_updated_at
      BEFORE UPDATE ON api_service_keys
      FOR EACH ROW EXECUTE FUNCTION touch_api_service_keys_updated_at()
    `);
  })().catch((error) => {
    serviceKeysSchemaPromise = undefined;
    throw error;
  });

  return serviceKeysSchemaPromise;
}

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET doit contenir au moins 32 caractères.");
  }
  return value;
}

function requestBody(req: VercelRequest) {
  return (req.body ?? {}) as Record<string, unknown>;
}

function adminToken(req: VercelRequest) {
  return (req.headers.cookie ?? "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
}

function setAdminSession(res: VercelResponse, adminId: string) {
  const token = jwt.sign(
    { sub: adminId, role: "admin" },
    secret(),
    { expiresIn: "8h", issuer: "oligens-admin" },
  );
  const secure = process.env.VERCEL_ENV === "production" ? " Secure;" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict;${secure} Max-Age=28800`,
  );
}

function clearAdminSession(res: VercelResponse) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  );
}

async function requireAdmin(req: VercelRequest) {
  // A public session probe must not touch Neon when there is no admin cookie.
  // This prevents a database/schema outage from turning a normal unauthenticated
  // request into a 503. Login is the operation that requires the database.
  const token = adminToken(req);
  if (!token) return null;

  await ensureAdminUsersSchema();

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret(), {
      issuer: "oligens-admin",
    }) as jwt.JwtPayload;
  } catch {
    return null;
  }

  if (!payload.sub) return null;
  const result = await query<Admin>(
    "SELECT id,email FROM admin_users WHERE id=$1",
    [payload.sub],
  );
  return result.rows[0] ?? null;
}

function maskKey(key: string) {
  const value = key.trim();
  if (!value) return "";
  if (value.length <= 10) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

function jsonError(res: VercelResponse, status: number, error: string, code: string) {
  return res.status(status).json({ success: false, error, code });
}

export async function login(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return jsonError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");

  try {
    await ensureAdminUsersSchema();
    const b = requestBody(req);
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");

    if (email !== ADMIN_EMAIL || password.length < 1) {
      return jsonError(res, 401, "Identifiants administrateur invalides.", "INVALID_CREDENTIALS");
    }

    const result = await query<{
      id: string;
      email: string;
      password_hash: string;
      failed_login_attempts: number;
      locked_until: string | null;
    }>(
      "SELECT id,email,password_hash,failed_login_attempts,locked_until FROM admin_users WHERE LOWER(email)=LOWER($1) LIMIT 1",
      [email],
    );
    const admin = result.rows[0];

    if (!admin) return jsonError(res, 401, "Identifiants administrateur invalides.", "INVALID_CREDENTIALS");

    if (admin.locked_until && new Date(admin.locked_until).getTime() > Date.now()) {
      return jsonError(res, 423, "Compte administrateur temporairement verrouillé.", "ADMIN_LOCKED");
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      const attempts = Number(admin.failed_login_attempts ?? 0) + 1;
      const lock = attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
      await query(
        "UPDATE admin_users SET failed_login_attempts=$1, locked_until=$2, updated_at=NOW() WHERE id=$3",
        [lock ? 0 : attempts, lock, admin.id],
      );
      return jsonError(res, 401, "Identifiants administrateur invalides.", "INVALID_CREDENTIALS");
    }

    await query(
      "UPDATE admin_users SET failed_login_attempts=0, locked_until=NULL, last_login_at=NOW(), updated_at=NOW() WHERE id=$1",
      [admin.id],
    );
    setAdminSession(res, admin.id);
    return res.status(200).json({ authenticated: true, admin: { id: admin.id, email: admin.email } });
  } catch (error) {
    console.error("[admin/login]", error);
    const message = error instanceof Error ? error.message : "Service administrateur indisponible.";
    // Login failures caused by infrastructure/configuration are service-unavailable,
    // never an opaque 500. The client can then distinguish a bad password (401)
    // from a broken deployment/database (503).
    if (/DATABASE_URL|POSTGRES_URL|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|certificate|SSL|connection|timeout/i.test(message)) {
      return jsonError(res, 503, "Base de données administrateur temporairement indisponible.", "ADMIN_DATABASE_UNAVAILABLE");
    }
    if (/AUTH_SECRET/i.test(message)) {
      return jsonError(res, 503, "Authentification administrateur temporairement indisponible.", "AUTH_SECRET_NOT_CONFIGURED");
    }
    if (/admin_users|relation .* does not exist|permission denied|schema/i.test(message)) {
      return jsonError(res, 503, "Le stockage administrateur est temporairement indisponible.", "ADMIN_STORAGE_UNAVAILABLE");
    }
    if (/bcrypt|compare|hash|password_hash/i.test(message)) {
      return jsonError(res, 503, "Le service de vérification administrateur est temporairement indisponible.", "ADMIN_CRYPTO_UNAVAILABLE");
    }
    return jsonError(res, 503, "Service administrateur temporairement indisponible.", "ADMIN_LOGIN_UNAVAILABLE");
  }
}

export async function session(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return jsonError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");
  try {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(401).json({ authenticated: false });
    return res.status(200).json({ authenticated: true, admin });
  } catch (error) {
    // Session is a probe: any failure to validate an existing/stale cookie
    // must fail closed as unauthenticated, not break the application with a 500.
    console.error("[admin/session]", error);
    clearAdminSession(res);
    return res.status(401).json({
      success: false,
      authenticated: false,
      error: "Session administrateur invalide ou indisponible.",
      code: "ADMIN_SESSION_UNAUTHENTICATED",
    });
  }
}

export async function logout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return jsonError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");
  clearAdminSession(res);
  return res.status(200).json({ ok: true });
}

type ApiService = "gemini" | "humanizer" | "plagiarism" | "hallucination" | "references";

function encryptionKey() {
  const value = process.env.API_KEY_ENCRYPTION_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("API_KEY_ENCRYPTION_SECRET doit contenir au moins 32 caractères.");
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function encryptApiKey(value: string) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function maskStoredKey(value: string) {
  try {
    const parts = value.split(".");
    if (parts.length === 4 && parts[0] === "v1") return "••••••••••••";
  } catch {}
  return maskKey(value);
}

export async function serviceKeys(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureServiceKeysSchema();
    const admin = await requireAdmin(req);
    if (!admin) return jsonError(res, 401, "Authentification administrateur requise.", "ADMIN_AUTH_REQUIRED");

    const rawService = typeof req.query.service === "string" ? req.query.service : undefined;
    const requestedService = String(requestBody(req).service ?? rawService ?? "gemini") as ApiService;
    const services: ApiService[] = ["gemini", "humanizer", "plagiarism", "hallucination", "references"];
    if (!services.includes(requestedService)) {
      return jsonError(res, 400, "Service API invalide.", "INVALID_API_SERVICE");
    }

    if (req.method === "GET") {
      const result = await query<{
        id: string;
        service_name: ApiService;
        key_name: string;
        encrypted_api_key: string;
        is_active: boolean;
        priority: number;
        usage_count: string;
        failure_count: number;
        last_used_at: string | null;
        last_failure_at: string | null;
        created_at: string;
      }>(
        `SELECT id::text AS id,service_name,key_name,encrypted_api_key,is_active,priority,
                usage_count::text AS usage_count,failure_count,last_used_at,last_failure_at,created_at
         FROM api_service_keys
         WHERE service_name=$1
         ORDER BY priority ASC,created_at ASC`,
        [requestedService],
      );
      return res.status(200).json({
        service: requestedService,
        keys: result.rows.map(row => ({
          id: row.id,
          service: row.service_name,
          name: row.key_name,
          masked: maskStoredKey(row.encrypted_api_key),
          active: row.is_active,
          priority: row.priority,
          usageCount: Number(row.usage_count ?? 0),
          failureCount: row.failure_count,
          lastUsedAt: row.last_used_at,
          lastFailureAt: row.last_failure_at,
          createdAt: row.created_at,
        })),
      });
    }

    if (req.method === "POST") {
      if (!process.env.API_KEY_ENCRYPTION_SECRET?.trim()) {
        return jsonError(res, 503, "Le coffre de chiffrement API_KEY_ENCRYPTION_SECRET n'est pas configuré sur Vercel.", "API_KEY_ENCRYPTION_SECRET_NOT_CONFIGURED");
      }
      const b = requestBody(req);
      const value = String(b.key ?? "").trim();
      const keyName = String(b.name ?? `${requestedService}-${Date.now()}`).trim().slice(0, 120);
      const priority = Math.max(0, Math.min(100000, Number(b.priority ?? 100)));
      if (value.length < 8 || value.length > 4096) return jsonError(res, 400, "Clé API invalide.", "INVALID_API_KEY");
      if (!keyName) return jsonError(res, 400, "Nom de clé requis.", "INVALID_KEY_NAME");
      if (!Number.isInteger(priority)) return jsonError(res, 400, "Priorité invalide.", "INVALID_PRIORITY");

      const duplicate = await query<{ id: string }>(
        "SELECT id::text AS id FROM api_service_keys WHERE service_name=$1 AND key_name=$2 LIMIT 1",
        [requestedService, keyName],
      );
      if (duplicate.rowCount) return jsonError(res, 409, "Une clé portant ce nom existe déjà pour ce service.", "DUPLICATE_KEY_NAME");

      const encrypted = encryptApiKey(value);
      const inserted = await query<{ id: string }>(
        `INSERT INTO api_service_keys(service_name,key_name,encrypted_api_key,is_active,priority,created_by,updated_by)
         VALUES($1,$2,$3,TRUE,$4,$5,$5) RETURNING id::text AS id`,
        [requestedService, keyName, encrypted, priority, admin.id],
      );
      return res.status(201).json({
        ok: true,
        key: { id: inserted.rows[0]?.id, service: requestedService, name: keyName, masked: "••••••••••••", active: true, priority },
      });
    }

    if (req.method === "PATCH") {
      const id = String(requestBody(req).id ?? "").trim();
      if (!id) return jsonError(res, 400, "Identifiant de clé requis.", "INVALID_KEY_ID");
      const active = requestBody(req).active;
      const priority = requestBody(req).priority;
      if (typeof active !== "boolean" && priority === undefined) {
        return jsonError(res, 400, "Aucune modification demandée.", "NO_KEY_UPDATE");
      }
      if (typeof active === "boolean" && priority !== undefined) {
        const n = Number(priority);
        if (!Number.isInteger(n) || n < 0) return jsonError(res, 400, "Priorité invalide.", "INVALID_PRIORITY");
        await query("UPDATE api_service_keys SET is_active=$1,priority=$2,updated_by=$3 WHERE id=$4 AND service_name=$5", [active,n,admin.id,id,requestedService]);
      } else if (typeof active === "boolean") {
        await query("UPDATE api_service_keys SET is_active=$1,updated_by=$2 WHERE id=$3 AND service_name=$4", [active,admin.id,id,requestedService]);
      } else {
        const n = Number(priority);
        if (!Number.isInteger(n) || n < 0) return jsonError(res, 400, "Priorité invalide.", "INVALID_PRIORITY");
        await query("UPDATE api_service_keys SET priority=$1,updated_by=$2 WHERE id=$3 AND service_name=$4", [n,admin.id,id,requestedService]);
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const id = String(requestBody(req).id ?? req.query.id ?? "").trim();
      if (!id) return jsonError(res, 400, "Identifiant de clé requis.", "INVALID_KEY_ID");
      await query("DELETE FROM api_service_keys WHERE id=$1 AND service_name=$2", [id,requestedService]);
      return res.status(200).json({ ok: true });
    }

    return jsonError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");
  } catch (error) {
    console.error("[admin/service-keys]", error);
    const message = error instanceof Error ? error.message : "Gestion des clés indisponible.";
    if (message.includes("API_KEY_ENCRYPTION_SECRET")) return jsonError(res, 503, message, "API_KEY_ENCRYPTION_SECRET_NOT_CONFIGURED");
    return jsonError(res, 503, "Gestion des clés API temporairement indisponible.", "ADMIN_SERVICE_KEYS_UNAVAILABLE");
  }
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.all;
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("/") : [];
  const path = parts.filter(Boolean).join("/");
  if (path === "login") return login(req, res);
  if (path === "session") return session(req, res);
  if (path === "logout") return logout(req, res);
  if (path === "keys") return serviceKeys(req, res);
  return jsonError(res, 404, "Route administrateur introuvable.", "ADMIN_ROUTE_NOT_FOUND");
}
