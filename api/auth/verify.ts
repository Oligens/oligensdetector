import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Pool } from "pg";

const COOKIE = "oligens_session";
let pool: Pool | undefined;
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
function getPool() {
  if (pool) return pool;
  pool = new Pool({ connectionString: databaseUrl(), max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, ssl: { rejectUnauthorized: true }, application_name: "oligens-detector-auth-verify" });
  pool.on("error", error => console.error("[auth/verify] database pool error", error));
  return pool;
}
function authSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  if (secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return secret;
}
function hashCode(code: string) { return crypto.createHash("sha256").update(code).digest("hex"); }
function setSession(res: VercelResponse, userId: string) {
  const token = jwt.sign({ sub: userId }, authSecret(), { expiresIn: "30d", issuer: "oligens-detector" });
  const secure = process.env.VERCEL_ENV === "production" ? " Secure;" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=2592000`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Méthode non autorisée" }); }
  try {
    if (!process.env.DATABASE_URL?.trim()) return res.status(503).json({ error: "Base de données non configurée.", code: "DATABASE_NOT_CONFIGURED" });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = String(b.email ?? "").trim().toLowerCase();
    const code = String(b.code ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "E-mail ou code invalide." });

    const db = getPool();
    const result = await db.query<{ id: string; email_verified: boolean; verification_code_hash: string | null; verification_code_expires_at: string | null; verification_attempts: number }>("SELECT id,email_verified,verification_code_hash,verification_code_expires_at,verification_attempts FROM users WHERE email=$1 LIMIT 1", [email]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: "Compte introuvable.", code: "USER_NOT_FOUND" });
    if (user.email_verified) { setSession(res, user.id); return res.status(200).json({ verified: true }); }
    if (!user.verification_code_hash || !user.verification_code_expires_at || new Date(user.verification_code_expires_at).getTime() <= Date.now()) return res.status(400).json({ error: "Code expiré. Demandez un nouveau code.", code: "VERIFICATION_CODE_EXPIRED" });
    if (Number(user.verification_attempts ?? 0) >= 5) return res.status(429).json({ error: "Trop de tentatives. Demandez un nouveau code.", code: "VERIFICATION_ATTEMPTS_EXCEEDED" });

    if (hashCode(code) !== user.verification_code_hash) {
      await db.query("UPDATE users SET verification_attempts=verification_attempts+1,updated_at=NOW() WHERE id=$1", [user.id]);
      return res.status(400).json({ error: "Code incorrect.", code: "INVALID_VERIFICATION_CODE" });
    }

    await db.query("UPDATE users SET email_verified=true,verification_code_hash=NULL,verification_code_expires_at=NULL,verification_attempts=0,updated_at=NOW() WHERE id=$1", [user.id]);
    setSession(res, user.id);
    return res.status(200).json({ verified: true });
  } catch (error) {
    console.error("[auth/verify] error", error);
    const message = error instanceof Error ? error.message : "Vérification impossible.";
    if (message.includes("AUTH_SECRET")) return res.status(503).json({ error: "Authentification non configurée sur le serveur.", code: "AUTH_SECRET_NOT_CONFIGURED" });
    if (message.includes("DATABASE_URL") || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|connection/i.test(message)) return res.status(503).json({ error: "Base de données temporairement indisponible.", code: "DATABASE_UNAVAILABLE" });
    return res.status(503).json({ error: "Vérification temporairement indisponible.", code: "VERIFY_UNAVAILABLE" });
  }
}
