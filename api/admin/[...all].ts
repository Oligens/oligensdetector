import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Pool, type QueryResultRow } from "pg";

const COOKIE = "oligens_admin_session";
const ADMIN_EMAIL = "cleefolig@gmail.com";
const DEFAULT_PASSWORD_HASH = "$2b$12$cQCh0LwHa1mlJKDM4Dulwe6x8K0SeRcMBrC7sOZt9TK0jc0h/FToy";

type Admin = { id: string; email: string };
let pool: Pool | undefined;
let schemaPromise: Promise<void> | undefined;

function dbUrl() {
  const raw =
    process.env.DATABASE_URL?.trim() ||
    process.env.DIRECT_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.NEON_DATABASE_URL?.trim();
  if (!raw) throw new Error("DATABASE_URL non configurée.");

  // pg-connection-string emits a warning for libpq sslmode values such as
  // require. Neon connections are explicitly configured below with TLS.
  // Remove those URL options so they cannot override the Pool ssl object.
  try {
    const url = new URL(raw);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("uselibpqcompat");
    return url.toString();
  } catch {
    return raw;
  }
}

function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: dbUrl(),
    max: 3,
    min: 0,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    maxUses: 500,
    ssl: { rejectUnauthorized: false },
    application_name: "oligens-detector-admin",
  });
  pool.on("error", (error) => console.error("[admin-db] idle error", sanitizeError(error)));
  return pool;
}

async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  return getPool().query<T>(sql, values);
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://***");
    return { name: error.name, message, stack: error.stack?.split("\n").slice(0, 4).join("\n") };
  }
  return { message: String(error) };
}

function classifyDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/DATABASE_URL|POSTGRES_URL|not configured|non configurée/i.test(message)) return "ADMIN_DATABASE_URL_MISSING";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timeout/i.test(message)) return "ADMIN_DATABASE_NETWORK";
  if (/certificate|SSL|self-signed/i.test(message)) return "ADMIN_DATABASE_SSL";
  if (/permission denied|must be owner|insufficient_privilege/i.test(message)) return "ADMIN_DATABASE_PERMISSION";
  if (/relation .* does not exist|admin_users/i.test(message)) return "ADMIN_USERS_SCHEMA_ERROR";
  return "ADMIN_DATABASE_ERROR";
}

function jsonError(res: VercelResponse, status: number, error: string, code: string, detail?: unknown) {
  const body: Record<string, unknown> = { success: false, error, code };
  if (detail) body.detail = sanitizeError(detail);
  return res.status(status).json(body);
}

async function ensureAdminUsers() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    // pgcrypto is used elsewhere by the application, but admin_users itself
    // does not depend on it. Keep this table bootstrap independent.
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

    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`);
    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS gemini_api_keys TEXT[] NOT NULL DEFAULT '{}'`);
    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ NULL`);
    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL`);
    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email_unique ON admin_users (LOWER(email))`);

    // Non-destructive seed: never replace an existing administrator password.
    await query(
      `INSERT INTO admin_users (email,password_hash,gemini_api_keys)
       VALUES ($1,$2,ARRAY[]::TEXT[])
       ON CONFLICT (email) DO NOTHING`,
      [ADMIN_EMAIL, DEFAULT_PASSWORD_HASH],
    );
  })().catch((error) => {
    schemaPromise = undefined;
    console.error("[admin/schema] bootstrap failed", sanitizeError(error));
    throw error;
  });
  return schemaPromise;
}

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("AUTH_SECRET doit contenir au moins 32 caractères.");
  return value;
}

function body(req: VercelRequest) {
  return (req.body ?? {}) as Record<string, unknown>;
}

function tokenFromRequest(req: VercelRequest) {
  return (req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
}

function setSession(res: VercelResponse, adminId: string) {
  const token = jwt.sign({ sub: adminId, role: "admin" }, secret(), {
    expiresIn: "8h",
    issuer: "oligens-admin",
  });
  const secure = process.env.VERCEL_ENV === "production" ? " Secure;" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict;${secure} Max-Age=28800`);
}

function clearSession(res: VercelResponse) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

async function currentAdmin(req: VercelRequest): Promise<Admin | null> {
  const token = tokenFromRequest(req);
  if (!token) return null;

  await ensureAdminUsers();
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret(), { issuer: "oligens-admin" }) as jwt.JwtPayload;
  } catch {
    return null;
  }
  if (!payload.sub) return null;

  const result = await query<Admin>("SELECT id::text AS id,email FROM admin_users WHERE id=$1 LIMIT 1", [payload.sub]);
  return result.rows[0] ?? null;
}

async function login(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return jsonError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");
  try {
    await ensureAdminUsers();
    const input = body(req);
    const email = String(input.email ?? "").trim().toLowerCase();
    const password = String(input.password ?? "");

    if (email !== ADMIN_EMAIL || !password) {
      return jsonError(res, 401, "Identifiants administrateur invalides.", "INVALID_CREDENTIALS");
    }

    const result = await query<{
      id: string;
      email: string;
      password_hash: string;
      failed_login_attempts: number;
      locked_until: string | null;
    }>(
      `SELECT id::text AS id,email,password_hash,failed_login_attempts,locked_until
       FROM admin_users WHERE LOWER(email)=LOWER($1) LIMIT 1`,
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
        `UPDATE admin_users SET failed_login_attempts=$1,locked_until=$2,updated_at=NOW() WHERE id=$3`,
        [lock ? 0 : attempts, lock, admin.id],
      );
      return jsonError(res, 401, "Identifiants administrateur invalides.", "INVALID_CREDENTIALS");
    }

    await query(
      `UPDATE admin_users SET failed_login_attempts=0,locked_until=NULL,last_login_at=NOW(),updated_at=NOW() WHERE id=$1`,
      [admin.id],
    );
    setSession(res, admin.id);
    return res.status(200).json({ authenticated: true, admin: { id: admin.id, email: admin.email } });
  } catch (error) {
    console.error("[admin/login] failure", sanitizeError(error));
    if (/AUTH_SECRET/i.test(error instanceof Error ? error.message : String(error))) {
      return jsonError(res, 500, "AUTH_SECRET est absent ou invalide sur le serveur.", "AUTH_SECRET_NOT_CONFIGURED");
    }
    return jsonError(res, 500, "Connexion administrateur impossible.", classifyDatabaseError(error), error);
  }
}

async function session(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return jsonError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");

  // Deterministic public probe: no cookie means no authentication and no DB dependency.
  if (!tokenFromRequest(req)) return res.status(401).json({ authenticated: false });

  try {
    const admin = await currentAdmin(req);
    if (!admin) {
      clearSession(res);
      return res.status(401).json({ authenticated: false });
    }
    return res.status(200).json({ authenticated: true, admin });
  } catch (error) {
    console.error("[admin/session] failure", sanitizeError(error));
    clearSession(res);
    return jsonError(
      res,
      500,
      "Impossible de valider la session administrateur.",
      classifyDatabaseError(error),
      error,
    );
  }
}

async function logout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return jsonError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");
  clearSession(res);
  return res.status(200).json({ ok: true, authenticated: false });
}

async function legacyAdminHandler(req: VercelRequest, res: VercelResponse) {
  // Service-key management keeps using the existing implementation so no
  // API-key feature is removed while login/session are isolated from its bundle.
  const module = await import("../../src/server/api/admin.ts");
  return module.default(req, res);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.all;
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("/") : [];
  const path = parts.filter(Boolean).join("/");

  if (path === "session") return session(req, res);
  if (path === "login") return login(req, res);
  if (path === "logout") return logout(req, res);

  if (path === "keys") {
    try {
      return await legacyAdminHandler(req, res);
    } catch (error) {
      console.error("[admin/keys] legacy handler failure", sanitizeError(error));
      return jsonError(res, 503, "Gestion des clés API temporairement indisponible.", "ADMIN_KEYS_HANDLER_ERROR", error);
    }
  }

  return jsonError(res, 404, "Route administrateur introuvable.", "ADMIN_ROUTE_NOT_FOUND");
}
