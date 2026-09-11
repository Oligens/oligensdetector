import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { Pool, type QueryResultRow } from "pg";

const COOKIE = "oligens_session";
let pool: Pool | undefined;

type AuthUser = { id: string; email: string; email_verified: boolean };
type SubscriptionRow = { plan: "free" | "flash" | "pro" | "gold"; status: "active" | "expired" | "cancelled" | "pending"; billing_period: "monthly" | "yearly" | "lifetime" | null; expires_at: string | null; started_at: string };

function dbUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is not configured.");
  return value;
}
function getPool() {
  if (pool) return pool;
  pool = new Pool({ connectionString: dbUrl(), max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, ssl: { rejectUnauthorized: true }, application_name: "oligens-detector-auth" });
  pool.on("error", error => console.error("[auth] idle client error", error));
  return pool;
}
async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}
function authSecret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) throw new Error("AUTH_SECRET is not configured.");
  if (value.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return value;
}
function requestBody(req: VercelRequest) { return (req.body ?? {}) as Record<string, unknown>; }
function requestCookie(req: VercelRequest) {
  return (req.headers.cookie ?? "").split(";").map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}
async function getUser(req: VercelRequest): Promise<AuthUser | null> {
  const token = requestCookie(req);
  if (!token) return null;
  let payload: jwt.JwtPayload;
  try { payload = jwt.verify(token, authSecret(), { issuer: "oligens-detector" }) as jwt.JwtPayload; } catch { return null; }
  if (!payload.sub) return null;
  const result = await query<AuthUser>("SELECT id,email,email_verified FROM users WHERE id=$1", [payload.sub]);
  return result.rows[0] ?? null;
}
function setSession(res: VercelResponse, userId: string) {
  const token = jwt.sign({ sub: userId }, authSecret(), { expiresIn: "30d", issuer: "oligens-detector" });
  const secure = process.env.VERCEL_ENV === "production" ? " Secure;" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=2592000`);
}
function clearSession(res: VercelResponse) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
function hashCode(code: string) { return crypto.createHash("sha256").update(code).digest("hex"); }
function randomCode() { return String(crypto.randomInt(100000, 1000000)); }
function routePath(req: VercelRequest) {
  const raw = req.query.route;
  const route = Array.isArray(raw) ? raw.join("/") : typeof raw === "string" ? raw : "";
  if (route) return route.replace(/^\/+|\/+$/g, "");
  const url = req.url ?? "";
  return url.split("?")[0].replace(/^\/api\/auth\/?/, "").replace(/\/$/, "");
}
function method(req: VercelRequest, res: VercelResponse, expected: string) {
  if (req.method !== expected) { res.status(405).json({ error: "Méthode non autorisée" }); return false; }
  return true;
}

async function me(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, "GET")) return;
  try {
    if (!process.env.DATABASE_URL?.trim()) return res.status(503).json({ error: "Base de données non configurée.", code: "DATABASE_NOT_CONFIGURED" });
    const user = await getUser(req);
    if (!user) return res.status(401).json({ user: null });
    const result = await query<SubscriptionRow>(`SELECT CASE WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW() THEN 'free'::subscription_plan ELSE plan END AS plan, CASE WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW() THEN 'active'::subscription_status ELSE status END AS status, CASE WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW() THEN 'monthly'::billing_period ELSE billing_period END AS billing_period, CASE WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW() THEN NULL ELSE expires_at END AS expires_at, started_at FROM subscriptions WHERE user_id=$1 LIMIT 1`, [user.id]);
    const sub = result.rows[0] ?? { plan: "free" as const, status: "active" as const, billing_period: "monthly" as const, expires_at: null, started_at: new Date().toISOString() };
    let flashAnalysesToday = 0;
    if (sub.plan === "flash") {
      const usage = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM usage_events WHERE user_id=$1 AND event_type='analysis' AND created_at >= DATE_TRUNC('day', NOW())`, [user.id]);
      flashAnalysesToday = Number(usage.rows[0]?.count ?? 0);
    }
    return res.status(200).json({ user, subscription: { plan: sub.plan, status: sub.status, period: sub.billing_period, currentPeriodEnd: sub.expires_at, flashStartedAt: sub.plan === "flash" ? sub.started_at : null, flashAnalysesToday } });
  } catch (error) {
    console.error("[auth/me] error", error);
    const message = error instanceof Error ? error.message : "Service indisponible.";
    if (message.includes("AUTH_SECRET")) return res.status(503).json({ error: "Authentification non configurée sur le serveur.", code: "AUTH_SECRET_NOT_CONFIGURED" });
    if (message.includes("DATABASE_URL") || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|connection/i.test(message)) return res.status(503).json({ error: "Base de données temporairement indisponible.", code: "DATABASE_UNAVAILABLE" });
    return res.status(500).json({ error: "Erreur interne pendant la récupération de la session.", code: "AUTH_ME_INTERNAL_ERROR" });
  }
}

async function signin(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, "POST")) return;
  try {
    if (!process.env.DATABASE_URL?.trim()) return res.status(503).json({ error: "Base de données non configurée.", code: "DATABASE_NOT_CONFIGURED" });
    if (!process.env.AUTH_SECRET?.trim()) return res.status(503).json({ error: "Authentification non configurée.", code: "AUTH_SECRET_NOT_CONFIGURED" });
    const b = requestBody(req), email = String(b.email ?? "").trim().toLowerCase(), password = String(b.password ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email) || !password) return res.status(400).json({ error: "E-mail ou mot de passe invalide." });
    const result = await query<{ id: string; password_hash: string; email_verified: boolean }>("SELECT id,password_hash,email_verified FROM users WHERE email=$1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "E-mail ou mot de passe incorrect." });
    if (!user.email_verified) return res.status(403).json({ error: "Vérifiez votre e-mail avant de vous connecter.", code: "EMAIL_NOT_VERIFIED" });
    setSession(res, user.id);
    return res.status(200).json({ user: { id: user.id, email } });
  } catch (error) {
    console.error("[auth/signin] error", error);
    const message = error instanceof Error ? error.message : "Connexion impossible.";
    if (message.includes("AUTH_SECRET")) return res.status(503).json({ error: "Authentification non configurée sur le serveur.", code: "AUTH_SECRET_NOT_CONFIGURED" });
    return res.status(503).json({ error: "Base de données ou service d'authentification indisponible.", code: "AUTH_DATABASE_UNAVAILABLE" });
  }
}

function signout(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, "POST")) return;
  clearSession(res);
  return res.status(200).json({ ok: true });
}
function mailer() {
  const user = process.env.GMAIL_SMTP_USER?.trim(), pass = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) throw new Error("Gmail SMTP n'est pas configuré sur le serveur.");
  return nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
}
async function signup(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, "POST")) return;
  try {
    if (!process.env.DATABASE_URL?.trim()) return res.status(503).json({ error: "Base de données non configurée.", code: "DATABASE_NOT_CONFIGURED" });
    const b = requestBody(req), email = String(b.email ?? "").trim().toLowerCase(), password = String(b.password ?? ""), firstName = String(b.firstName ?? b.first_name ?? "").trim() || null, lastName = String(b.lastName ?? b.last_name ?? "").trim() || null;
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "E-mail invalide.", code: "INVALID_EMAIL" });
    if (password.length < 8) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères.", code: "WEAK_PASSWORD" });
    const existing = await query<{ id: string }>("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [email]);
    if (existing.rowCount) return res.status(409).json({ error: "Un compte existe déjà avec cet e-mail.", code: "EMAIL_EXISTS" });
    const code = randomCode(), passwordHash = await bcrypt.hash(password, 12), codeHash = hashCode(code), userId = crypto.randomUUID();
    await query(`INSERT INTO users (id,email,password_hash,first_name,last_name,email_verified,verification_code_hash,verification_code_expires_at,verification_attempts) VALUES ($1,$2,$3,$4,$5,FALSE,$6,NOW()+INTERVAL '15 minutes',0)`, [userId,email,passwordHash,firstName,lastName,codeHash]);
    try {
      const transport = mailer();
      await transport.sendMail({ from: process.env.GMAIL_SMTP_USER, to: email, subject: "Votre code de vérification Oligens Detector", text: `Votre code Oligens Detector est ${code}. Il expire dans 15 minutes.` });
    } catch (mailError) {
      console.error("[auth/signup] SMTP error", mailError);
      return res.status(503).json({ error: "Compte créé mais l'e-mail de vérification n'a pas pu être envoyé.", code: "EMAIL_SERVICE_UNAVAILABLE", canRetryVerification: true });
    }
    return res.status(201).json({ needsVerification: true, userId });
  } catch (error) {
    console.error("[auth/signup] error", error);
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === "23505" || code === "EMAIL_EXISTS") return res.status(409).json({ error: "Un compte existe déjà avec cet e-mail.", code: "EMAIL_EXISTS" });
    return res.status(500).json({ error: "Erreur interne pendant l'inscription.", code: "SIGNUP_INTERNAL_ERROR" });
  }
}
async function verify(req: VercelRequest, res: VercelResponse) {
  if (!method(req, res, "POST")) return;
  try {
    const b = requestBody(req), email = String(b.email ?? "").trim().toLowerCase(), code = String(b.code ?? "").trim();
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "E-mail ou code invalide." });
    const result = await query<{ id: string; verification_code_hash: string | null; verification_expires_at: string | null }>("SELECT id,verification_code_hash,verification_code_expires_at AS verification_expires_at FROM users WHERE email=$1", [email]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: "Compte introuvable." });
    if (!user.verification_code_hash || !user.verification_expires_at || new Date(user.verification_expires_at) <= new Date()) return res.status(400).json({ error: "Code expiré. Demandez un nouveau code." });
    if (hashCode(code) !== user.verification_code_hash) return res.status(400).json({ error: "Code incorrect." });
    await query("UPDATE users SET email_verified=true,verification_code_hash=NULL,verification_code_expires_at=NULL,verification_attempts=0 WHERE id=$1", [user.id]);
    setSession(res, user.id);
    return res.status(200).json({ verified: true });
  } catch (error) {
    console.error("[auth/verify] error", error);
    return res.status(503).json({ error: "Vérification temporairement indisponible." });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  switch (routePath(req)) {
    case "me": return me(req, res);
    case "signin": return signin(req, res);
    case "signout": return signout(req, res);
    case "signup": return signup(req, res);
    case "verify": return verify(req, res);
    default: return res.status(404).json({ error: "Route d'authentification introuvable.", path: `/api/auth/${routePath(req)}` });
  }
}
