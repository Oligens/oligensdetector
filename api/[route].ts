import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { Pool, type QueryResultRow } from "pg";
import crypto from "node:crypto";

const COOKIE = "oligens_session";
let pool: Pool | undefined;

type AuthUser = { id: string; email: string; email_verified: boolean };

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
    application_name: "oligens-detector-dashboard-api",
  });
  pool.on("error", error => console.error("[dashboard-api] database idle error", error));
  return pool;
}

async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("AUTH_SECRET is not configured correctly.");
  return value;
}

async function currentUser(req: VercelRequest): Promise<AuthUser | null> {
  const token = (req.headers.cookie ?? "")
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!token) return null;

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret(), { issuer: "oligens-detector" }) as jwt.JwtPayload;
  } catch {
    return null;
  }
  if (!payload.sub) return null;
  const result = await query<AuthUser>("SELECT id,email,email_verified FROM users WHERE id=$1", [payload.sub]);
  return result.rows[0] ?? null;
}

function jsonError(res: VercelResponse, error: unknown, code: string) {
  console.error(`[${code}]`, error);
  const message = error instanceof Error ? error.message : "Unknown error";
  if (/DATABASE_URL|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|SSL|certificate|connection/i.test(message)) {
    return res.status(503).json({ error: "Base de données temporairement indisponible.", code: "DATABASE_UNAVAILABLE" });
  }
  return res.status(500).json({ error: "Erreur interne du serveur.", code });
}

async function analyses(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  const parsed = Number(req.query.limit ?? 50);
  const limit = Math.min(100, Math.max(1, Number.isFinite(parsed) ? Math.trunc(parsed) : 50));
  const result = await query(
    `SELECT id,file_name,file_type,file_size_kb,word_count,ai_score,plagiarism_score,reference_score,human_score,language,analysis_result,processing_time_ms,created_at
     FROM analyses WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [user.id, limit],
  );
  return res.status(200).json({ analyses: result.rows });
}

async function institutionalDatabases(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (req.method === "GET") {
    const result = await query(
      `SELECT id,name,description,document_count,metadata,created_at,updated_at
       FROM institutional_databases WHERE user_id=$1 ORDER BY updated_at DESC`,
      [user.id],
    );
    return res.status(200).json({ databases: result.rows });
  }
  if (req.method === "POST") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "Nom requis." });
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO institutional_databases(id,user_id,name,description,document_count,metadata)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [
        id,
        user.id,
        name,
        typeof body.description === "string" ? body.description : null,
        Math.max(0, Math.trunc(Number(body.documentCount ?? 0) || 0)),
        JSON.stringify(body.metadata ?? {}),
      ],
    );
    return res.status(201).json({ id });
  }
  return res.status(405).json({ error: "Méthode non autorisée" });
}

async function reports(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  const result = await query(
    `SELECT id,analysis_id,report_type,file_url,report_data,created_at
     FROM reports WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [user.id],
  );
  return res.status(200).json({ reports: result.rows });
}

async function stats(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  const [total, averageAi, averageHuman, averagePlagiarism, usage] = await Promise.all([
    query<{ count: string }>("SELECT COUNT(*)::text AS count FROM analyses WHERE user_id=$1", [user.id]),
    query<{ value: string }>("SELECT COALESCE(AVG(ai_score),0)::text AS value FROM analyses WHERE user_id=$1", [user.id]),
    query<{ value: string }>("SELECT COALESCE(AVG(human_score),0)::text AS value FROM analyses WHERE user_id=$1", [user.id]),
    query<{ value: string }>("SELECT COALESCE(AVG(plagiarism_score),0)::text AS value FROM analyses WHERE user_id=$1", [user.id]),
    query<{ count: string }>("SELECT COUNT(*)::text AS count FROM usage_events WHERE user_id=$1", [user.id]),
  ]);
  return res.status(200).json({
    totalAnalyses: Number(total.rows[0]?.count ?? 0),
    averageAiScore: Number(averageAi.rows[0]?.value ?? 0),
    averageHumanScore: Number(averageHuman.rows[0]?.value ?? 0),
    averagePlagiarismScore: Number(averagePlagiarism.rows[0]?.value ?? 0),
    usageEvents: Number(usage.rows[0]?.count ?? 0),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.route;
  const route = Array.isArray(raw) ? raw[0] : raw;
  if (typeof route !== "string") return res.status(404).json({ error: "API route not found" });

  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: "Authentification requise." });
    switch (route) {
      case "analyses": return analyses(req, res, user);
      case "institutional-databases": return institutionalDatabases(req, res, user);
      case "reports": return reports(req, res, user);
      case "stats": return stats(req, res, user);
      default: return res.status(404).json({ error: "API route not found", path: `/api/${route}` });
    }
  } catch (error) {
    return jsonError(res, error, `api/${route}`);
  }
}
