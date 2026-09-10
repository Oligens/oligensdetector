import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { Pool } from "pg";

const COOKIE = "oligens_session";

type QuotaResult = {
  allowed: boolean;
  code?: string;
  maxWords?: number;
  limit?: number;
  plan?: string;
};

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is not configured.");
  try {
    const url = new URL(value);
    const sslmode = url.searchParams.get("sslmode");
    if (sslmode && sslmode !== "verify-full") url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  } catch {
    return value;
  }
}

function authSecret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("AUTH_SECRET is not configured.");
  return value;
}

let pool: Pool | undefined;
function db() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: databaseUrl(),
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true },
    application_name: "oligens-detector-usage",
  });
  pool.on("error", (error) => console.error("[usage/consume] database pool error", error));
  return pool;
}

function uid(req: VercelRequest) {
  const raw = (req.headers.cookie ?? "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, authSecret(), { issuer: "oligens-detector" }) as jwt.JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function errorResponse(res: VercelResponse, quota: QuotaResult) {
  switch (quota.code) {
    case "SUBSCRIPTION_INACTIVE":
      return res.status(403).json({ allowed: false, reason: quota.code, message: "Votre abonnement n'est pas actif." });
    case "NO_SUBSCRIPTION":
      return res.status(403).json({ allowed: false, reason: quota.code, message: "Aucun abonnement actif n'est associé à ce compte." });
    case "WORD_LIMIT":
      return res.status(403).json({
        allowed: false,
        reason: quota.code,
        maxWords: quota.maxWords,
        message: `Votre plan autorise ${Number(quota.maxWords ?? 0).toLocaleString("fr-FR")} mots maximum par analyse.`,
      });
    case "DAILY_LIMIT":
      return res.status(403).json({ allowed: false, reason: quota.code, limit: quota.limit ?? 1, message: "Le plan Flash / Découverte autorise 1 analyse par jour." });
    default:
      return res.status(403).json({ allowed: false, reason: quota.code ?? "ANALYSIS_NOT_ALLOWED", message: "Analyse non autorisée." });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  try {
    const userId = uid(req);
    if (!userId) return res.status(401).json({ allowed: false, reason: "AUTH_REQUIRED", message: "Connexion requise." });

    const words = Number((req.body as Record<string, unknown> | undefined)?.words ?? 0);
    if (!Number.isInteger(words) || words < 0) {
      return res.status(400).json({ allowed: false, reason: "INVALID_WORD_COUNT", message: "Nombre de mots invalide." });
    }

    // This endpoint is a preflight/check endpoint. It must never consume quota.
    // The actual analysis persistence path calls consume_analysis() atomically.
    const result = await db().query<{ result: QuotaResult }>(
      "SELECT check_analysis_quota($1,$2)::jsonb AS result",
      [userId, words],
    );
    const quota = result.rows[0]?.result;
    if (!quota?.allowed) return errorResponse(res, quota ?? { allowed: false, code: "ANALYSIS_NOT_ALLOWED" });

    return res.status(200).json({
      allowed: true,
      plan: quota.plan,
      words,
      maxWords: quota.maxWords ?? null,
    });
  } catch (error) {
    console.error("[usage/consume] error", error);
    const message = error instanceof Error ? error.message : "Service indisponible.";
    if (message.includes("DATABASE_URL")) return res.status(503).json({ allowed: false, reason: "DATABASE_NOT_CONFIGURED", message: "Base de données non configurée." });
    if (message.includes("AUTH_SECRET")) return res.status(503).json({ allowed: false, reason: "AUTH_SECRET_NOT_CONFIGURED", message: "Authentification serveur non configurée." });
    if (/check_analysis_quota|function .* does not exist/i.test(message)) return res.status(503).json({ allowed: false, reason: "DATABASE_MIGRATION_REQUIRED", message: "La migration de quota n'est pas encore appliquée." });
    return res.status(503).json({ allowed: false, reason: "USAGE_SERVICE_UNAVAILABLE", message: "Impossible de vérifier le quota d'analyse." });
  }
}
