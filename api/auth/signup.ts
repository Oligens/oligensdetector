import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { Pool } from "pg";

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
  pool = new Pool({ connectionString: databaseUrl(), max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, ssl: { rejectUnauthorized: true }, application_name: "oligens-detector-auth-signup" });
  pool.on("error", error => console.error("[auth/signup] database pool error", error));
  return pool;
}
function randomCode() { return String(crypto.randomInt(100000, 1000000)); }
function hashCode(code: string) { return crypto.createHash("sha256").update(code).digest("hex"); }
function mailer() {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) throw new Error("Gmail SMTP n'est pas configuré sur le serveur.");
  return nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Méthode non autorisée" }); }
  try {
    if (!process.env.DATABASE_URL?.trim()) return res.status(503).json({ error: "Base de données non configurée.", code: "DATABASE_NOT_CONFIGURED" });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    const firstName = String(b.firstName ?? b.first_name ?? "").trim() || null;
    const lastName = String(b.lastName ?? b.last_name ?? "").trim() || null;
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "E-mail invalide.", code: "INVALID_EMAIL" });
    if (password.length < 8) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères.", code: "WEAK_PASSWORD" });

    const db = getPool();
    const existing = await db.query<{ id: string; email_verified: boolean }>("SELECT id,email_verified FROM users WHERE lower(email)=lower($1) LIMIT 1", [email]);
    if (existing.rowCount) {
      if (existing.rows[0].email_verified) return res.status(409).json({ error: "Un compte existe déjà avec cet e-mail.", code: "EMAIL_EXISTS" });
      return res.status(409).json({ error: "Un compte existe déjà mais n'est pas encore vérifié. Utilisez le code reçu par e-mail.", code: "EMAIL_PENDING_VERIFICATION" });
    }

    const code = randomCode();
    const passwordHash = await bcrypt.hash(password, 12);
    const codeHash = hashCode(code);
    const userId = crypto.randomUUID();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const race = await client.query("SELECT id,email_verified FROM users WHERE lower(email)=lower($1) LIMIT 1 FOR UPDATE", [email]);
      if (race.rowCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: race.rows[0].email_verified ? "Un compte existe déjà avec cet e-mail." : "Un compte existe déjà mais n'est pas encore vérifié. Utilisez le code reçu par e-mail.", code: race.rows[0].email_verified ? "EMAIL_EXISTS" : "EMAIL_PENDING_VERIFICATION" });
      }
      await client.query(`INSERT INTO users (id,email,password_hash,first_name,last_name,email_verified,verification_code_hash,verification_code_expires_at,verification_attempts) VALUES ($1,$2,$3,$4,$5,FALSE,$6,NOW()+INTERVAL '15 minutes',0)`, [userId, email, passwordHash, firstName, lastName, codeHash]);
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (rollbackError) { console.error("[auth/signup] rollback error", rollbackError); }
      throw error;
    } finally { client.release(); }

    try {
      const transport = mailer();
      await transport.verify();
      await transport.sendMail({
        from: process.env.GMAIL_SMTP_USER,
        to: email,
        subject: "Votre code de vérification Oligens Detector",
        text: `Votre code Oligens Detector est ${code}. Il expire dans 15 minutes.`,
        html: `<h2>Oligens Detector</h2><p>Votre code de vérification :</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>Ce code expire dans 15 minutes.</p>`,
      });
    } catch (mailError) {
      console.error("[auth/signup] SMTP error", mailError);
      return res.status(503).json({ error: "Compte créé mais l'e-mail de vérification n'a pas pu être envoyé.", code: "EMAIL_SERVICE_UNAVAILABLE", canRetryVerification: true });
    }
    return res.status(201).json({ needsVerification: true, userId });
  } catch (error) {
    console.error("[auth/signup] error", error);
    const message = error instanceof Error ? error.message : "Inscription impossible.";
    if (message.includes("DATABASE_URL")) return res.status(503).json({ error: "Base de données non configurée.", code: "DATABASE_NOT_CONFIGURED" });
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|connection/i.test(message)) return res.status(503).json({ error: "Base de données temporairement indisponible.", code: "DATABASE_UNAVAILABLE" });
    return res.status(500).json({ error: "Erreur interne pendant l'inscription.", code: "SIGNUP_INTERNAL_ERROR" });
  }
}
