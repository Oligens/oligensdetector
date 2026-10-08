import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { Pool } from "pg";

const COOKIE = "oligens_admin_session";
let pool: Pool | undefined;

function getPool() {
  if (pool) return pool;
  const connectionString =
    process.env.DATABASE_URL?.trim() ||
    process.env.DIRECT_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.NEON_DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL non configurée.");
  pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
    application_name: "oligens-detector-admin-session",
  });
  return pool;
}

function tokenFromRequest(req: VercelRequest) {
  return (req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
}

function clearCookie(res: VercelResponse) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Oligens-Admin-Session", "2026-10-08-v2");

  if (req.method !== "GET") {
    return res.status(405).json({ authenticated: false, error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });
  }

  // No cookie: never touch Neon or AUTH_SECRET. This must always be a clean 200 probe.
  const token = tokenFromRequest(req);
  if (!token) return res.status(200).json({ authenticated: false, admin: null });

  try {
    const secret = process.env.AUTH_SECRET?.trim();
    if (!secret || secret.length < 32) {
      clearCookie(res);
      return res.status(200).json({ authenticated: false, admin: null, error: "Session administrateur indisponible.", code: "AUTH_SECRET_NOT_CONFIGURED" });
    }

    const payload = jwt.verify(token, secret, { issuer: "oligens-admin" }) as jwt.JwtPayload;
    if (!payload.sub) {
      clearCookie(res);
      return res.status(200).json({ authenticated: false, admin: null });
    }

    const result = await getPool().query(
      "SELECT id::text AS id, email FROM admin_users WHERE id=$1 LIMIT 1",
      [payload.sub],
    );
    const admin = result.rows[0];
    if (!admin) {
      clearCookie(res);
      return res.status(200).json({ authenticated: false, admin: null });
    }

    return res.status(200).json({
      authenticated: true,
      admin: { id: admin.id, email: admin.email },
    });
  } catch (error) {
    console.error("[admin/session]", error);
    clearCookie(res);
    return res.status(200).json({
      authenticated: false,
      admin: null,
      error: "Session administrateur invalide ou indisponible.",
      code: "ADMIN_SESSION_UNAUTHENTICATED",
    });
  }
}
