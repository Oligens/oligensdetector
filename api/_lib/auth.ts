import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { query } from "./db";

const COOKIE = "oligens_session";
const secret = process.env.AUTH_SECRET;
if (!secret) console.warn("AUTH_SECRET is not configured.");

export type AuthUser = { id: string; email: string; email_verified: boolean };

function sign(userId: string) {
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return jwt.sign({ sub: userId }, secret, { expiresIn: "30d", issuer: "oligens-detector" });
}

export function setSession(res: VercelResponse, userId: string) {
  const token = sign(userId);
  const isProduction = process.env.VERCEL_ENV === "production";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; ${isProduction ? "Secure; " : ""}Max-Age=2592000`);
}

export function clearSession(res: VercelResponse) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function cookie(req: VercelRequest) {
  return (req.headers.cookie ?? "").split(";").map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}

export async function getUser(req: VercelRequest): Promise<AuthUser | null> {
  const token = cookie(req);
  if (!token || !secret) return null;
  try {
    const payload = jwt.verify(token, secret, { issuer: "oligens-detector" }) as jwt.JwtPayload;
    if (!payload.sub) return null;
    const result = await query<AuthUser>("SELECT id,email,email_verified FROM users WHERE id=$1", [payload.sub]);
    return result.rows[0] ?? null;
  } catch { return null; }
}

export function requireMethod(req: VercelRequest, res: VercelResponse, method: string) {
  if (req.method !== method) { res.status(405).json({ error: "Méthode non autorisée" }); return false; }
  return true;
}

export async function hashPassword(password: string) { return bcrypt.hash(password, 12); }
export async function verifyPassword(password: string, hash: string) { return bcrypt.compare(password, hash); }
export function randomCode() { return String(crypto.randomInt(100000, 1000000)); }
export function hashCode(code: string) { return crypto.createHash("sha256").update(code).digest("hex"); }
export { COOKIE };
