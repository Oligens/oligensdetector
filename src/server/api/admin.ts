import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Pool, type QueryResultRow } from "pg";

const COOKIE = "oligens_admin_session";
const ADMIN_EMAIL = "cleefolig@gmail.com";

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
  const token = adminToken(req);
  if (!token) return null;

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
  return res.status(status).json({ error, code });
}

async function login(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return jsonError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");

  try {
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
    return jsonError(res, 503, "Service administrateur temporairement indisponible.", "ADMIN_SERVICE_UNAVAILABLE");
  }
}

async function session(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return jsonError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");
  try {
    const admin = await requireAdmin(req);
    if (!admin) return res.status(401).json({ authenticated: false });
    return res.status(200).json({ authenticated: true, admin });
  } catch (error) {
    console.error("[admin/session]", error);
    return jsonError(res, 503, "Session administrateur indisponible.", "ADMIN_SESSION_UNAVAILABLE");
  }
}

async function logout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return jsonError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");
  clearAdminSession(res);
  return res.status(200).json({ ok: true });
}

async function keys(req: VercelRequest, res: VercelResponse) {
  try {
    const admin = await requireAdmin(req);
    if (!admin) return jsonError(res, 401, "Authentification administrateur requise.", "ADMIN_AUTH_REQUIRED");

    const result = await query<{ gemini_api_keys: string[] | null }>(
      "SELECT gemini_api_keys FROM admin_users WHERE id=$1",
      [admin.id],
    );
    const raw = Array.isArray(result.rows[0]?.gemini_api_keys) ? result.rows[0].gemini_api_keys : [];
    const masked = raw.map((key, index) => ({
      id: String(index),
      label: `Clé Gemini ${index + 1}`,
      masked: maskKey(String(key)),
    }));

    if (req.method === "GET") {
      return res.status(200).json({ keys: masked, count: masked.length });
    }

    if (req.method === "POST") {
      const value = String(requestBody(req).key ?? "").trim();
      if (value.length < 20 || value.length > 512) {
        return jsonError(res, 400, "Clé Gemini invalide.", "INVALID_GEMINI_KEY");
      }
      if (raw.includes(value)) {
        return jsonError(res, 409, "Cette clé est déjà enregistrée.", "DUPLICATE_GEMINI_KEY");
      }
      if (raw.length >= 50) {
        return jsonError(res, 400, "Limite de 50 clés atteinte.", "KEY_LIMIT_REACHED");
      }
      await query(
        "UPDATE admin_users SET gemini_api_keys=array_append(COALESCE(gemini_api_keys,'{}'::text[]),$1), updated_at=NOW() WHERE id=$2",
        [value, admin.id],
      );
      return res.status(201).json({ ok: true, key: { id: String(raw.length), label: `Clé Gemini ${raw.length + 1}`, masked: maskKey(value) } });
    }

    if (req.method === "DELETE") {
      const index = Number(requestBody(req).index ?? req.query.index);
      if (!Number.isInteger(index) || index < 0 || index >= raw.length) {
        return jsonError(res, 400, "Index de clé invalide.", "INVALID_KEY_INDEX");
      }
      const next = raw.filter((_, i) => i !== index);
      await query(
        "UPDATE admin_users SET gemini_api_keys=$1::text[], updated_at=NOW() WHERE id=$2",
        [next, admin.id],
      );
      return res.status(200).json({ ok: true, count: next.length });
    }

    return jsonError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");
  } catch (error) {
    console.error("[admin/keys]", error);
    return jsonError(res, 503, "Gestion des clés temporairement indisponible.", "ADMIN_KEYS_UNAVAILABLE");
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.all;
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("/") : [];
  const path = parts.filter(Boolean).join("/");
  if (path === "login") return login(req, res);
  if (path === "session") return session(req, res);
  if (path === "logout") return logout(req, res);
  if (path === "keys") return keys(req, res);
  return jsonError(res, 404, "Route administrateur introuvable.", "ADMIN_ROUTE_NOT_FOUND");
}
