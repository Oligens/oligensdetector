import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { Pool, type QueryResultRow } from "pg";

let pool: Pool | undefined;

function configuredDbUrl() {
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || process.env.POSTGRES_URL_NON_POOLING?.trim() || process.env.NEON_DATABASE_URL?.trim();
}

function getPool() {
  if (pool) return pool;
  const connectionString = configuredDbUrl();
  if (!connectionString) throw new Error("DATABASE_NOT_CONFIGURED");
  pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false }, application_name: "oligens-detector-dashboard" });
  pool.on("error", error => console.error("[dashboard-db] idle client error", error));
  return pool;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

function authSecret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("AUTH_SECRET_NOT_CONFIGURED");
  return value;
}

function sessionCookie(req: VercelRequest) {
  return (req.headers.cookie ?? "").split(";").map(value => value.trim()).find(value => value.startsWith("oligens_session="))?.slice("oligens_session=".length);
}

export async function requireUser(req: VercelRequest, res: VercelResponse) {
  try {
    const token = sessionCookie(req);
    if (!token) {
      res.status(401).json({ error: "Authentification requise.", code: "AUTH_REQUIRED" });
      return null;
    }
    const payload = jwt.verify(token, authSecret(), { issuer: "oligens-detector" }) as jwt.JwtPayload;
    if (!payload.sub) {
      res.status(401).json({ error: "Session invalide.", code: "INVALID_SESSION" });
      return null;
    }
    const result = await dbQuery<{ id: string; email: string; email_verified: boolean }>("SELECT id,email,email_verified FROM users WHERE id=$1 LIMIT 1", [payload.sub]);
    const user = result.rows[0];
    if (!user) {
      res.status(401).json({ error: "Session invalide.", code: "INVALID_SESSION" });
      return null;
    }
    return user;
  } catch (error) {
    console.error("[dashboard-auth] error", error);
    const message = error instanceof Error ? error.message : "DATABASE_UNAVAILABLE";
    const code = message === "AUTH_SECRET_NOT_CONFIGURED" ? message : "DATABASE_UNAVAILABLE";
    res.status(503).json({ error: code === "AUTH_SECRET_NOT_CONFIGURED" ? "Authentification non configurée sur le serveur." : "Base de données temporairement indisponible.", code });
    return null;
  }
}

export function internalError(res: VercelResponse, route: string, error: unknown) {
  console.error(`[${route}] error`, error);
  const message = error instanceof Error ? error.message : String(error);
  const code = /DATABASE_NOT_CONFIGURED/.test(message) ? "DATABASE_NOT_CONFIGURED" : /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|SSL|certificate|connection/i.test(message) ? "DATABASE_UNAVAILABLE" : "DATABASE_QUERY_FAILED";
  res.status(503).json({ error: "Service de données temporairement indisponible.", code });
}
