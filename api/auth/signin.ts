import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Pool } from "pg";

const COOKIE = "oligens_session";
let pool: Pool | undefined;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
    application_name: "oligens-detector-auth-signin",
  });
  pool.on("error", (error) => console.error("[auth/signin] database pool error", error));
  return pool;
}

function authSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  if (secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return secret;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    if (!process.env.DATABASE_URL?.trim()) {
      return res.status(503).json({ error: "Base de données non configurée.", code: "DATABASE_NOT_CONFIGURED" });
    }
    if (!process.env.AUTH_SECRET?.trim()) {
      return res.status(503).json({ error: "Authentification non configurée.", code: "AUTH_SECRET_NOT_CONFIGURED" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!/^\S+@\S+\.\S+$/.test(email) || !password) {
      return res.status(400).json({ error: "E-mail ou mot de passe invalide." });
    }

    const result = await getPool().query<{ id: string; password_hash: string; email_verified: boolean }>(
      "SELECT id,password_hash,email_verified FROM users WHERE email=$1 LIMIT 1",
      [email],
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "E-mail ou mot de passe incorrect." });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        error: "Vérifiez votre e-mail avant de vous connecter.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    const token = jwt.sign({ sub: user.id }, authSecret(), {
      expiresIn: "30d",
      issuer: "oligens-detector",
    });
    const secure = process.env.VERCEL_ENV === "production" ? " Secure;" : "";

    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=2592000`,
    );

    return res.status(200).json({ user: { id: user.id, email } });
  } catch (error) {
    console.error("[auth/signin] error", error);
    const message = error instanceof Error ? error.message : "Connexion impossible.";
    if (message.includes("AUTH_SECRET")) {
      return res.status(503).json({
        error: "Authentification non configurée sur le serveur.",
        code: "AUTH_SECRET_NOT_CONFIGURED",
      });
    }
    return res.status(503).json({
      error: "Base de données ou service d'authentification indisponible.",
      code: "AUTH_DATABASE_UNAVAILABLE",
    });
  }
}
