import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { Pool, type PoolClient } from "pg";

const COOKIE = "oligens_session";
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

let pool: Pool | undefined;

type Body = Record<string, unknown>;

type Subscription = {
  id: string;
  plan: "free" | "flash" | "pro" | "gold";
  status: "active" | "expired" | "cancelled" | "pending";
  expires_at: string | null;
};

function getPool() {
  if (pool) return pool;
  const connectionString = databaseUrl();
  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true },
    application_name: "oligens-detector-analysis-create",
  });
  pool.on("error", (error) => console.error("[analyses/create] idle client error", error));
  return pool;
}

function authUserId(req: VercelRequest): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not configured.");
  const raw = (req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, secret, { issuer: "oligens-detector" }) as jwt.JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (rollbackError) { console.error("[analyses/create] rollback error", rollbackError); }
    throw error;
  } finally {
    client.release();
  }
}

function body(req: VercelRequest): Body {
  return (req.body ?? {}) as Body;
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sendError(res: VercelResponse, status: number, error: string, code: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ error, code, ...extra });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return sendError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");

  try {
    const userId = authUserId(req);
    if (!userId) return sendError(res, 401, "Connexion requise.", "AUTH_REQUIRED");

    const b = body(req);
    const fileName = String(b.fileName ?? "").trim();
    const result = (b.result ?? {}) as Record<string, unknown>;
    if (!fileName) return sendError(res, 400, "Nom de fichier requis.", "INVALID_FILE_NAME");

    const engine = (result.engine ?? {}) as Record<string, unknown>;
    const wordCount = Math.max(0, Math.round(numberValue(engine.words)));
    const processingTime = Math.max(0, Math.round(numberValue(engine.durationMs)));
    if (wordCount < 30) return sendError(res, 400, "Le texte doit contenir au moins 30 mots pour une analyse fiable.", "TEXT_TOO_SHORT", { minWords: 30 });
    if (wordCount > 100_000) return sendError(res, 413, "Le texte dépasse la limite de 100 000 mots par analyse.", "TEXT_TOO_LARGE", { maxWords: 100_000 });

    const inserted = await transaction(async (client) => {
      let subscription = (await client.query<Subscription>(
        `SELECT id,plan,status,expires_at FROM subscriptions WHERE user_id=$1 FOR UPDATE`,
        [userId]
      )).rows[0];

      if (!subscription) {
        subscription = (await client.query<Subscription>(
          `INSERT INTO subscriptions(id,user_id,plan,status,billing_period,max_words_per_analysis,analyses_per_day,unlimited_database,advanced_reports,advanced_statistics,advanced_history)
           VALUES(gen_random_uuid()::TEXT,$1,'free','active','monthly',2500,NULL,FALSE,FALSE,FALSE,FALSE)
           RETURNING id,plan,status,expires_at`,
          [userId]
        )).rows[0];
      }

      if (subscription.plan !== "free" && subscription.expires_at && new Date(subscription.expires_at) <= new Date()) {
        await client.query(
          `UPDATE subscriptions SET plan='free',status='active',billing_period='monthly',expires_at=NULL,max_words_per_analysis=2500,analyses_per_day=NULL,unlimited_database=FALSE,advanced_reports=FALSE,advanced_statistics=FALSE,advanced_history=FALSE WHERE id=$1`,
          [subscription.id]
        );
        subscription = { ...subscription, plan: "free", status: "active", expires_at: null };
      }

      if (subscription.status !== "active") {
        throw Object.assign(new Error("Votre abonnement n'est pas actif."), { code: "SUBSCRIPTION_INACTIVE" });
      }

      const maxWords = subscription.plan === "free" || subscription.plan === "flash" ? 2500 : null;
      if (maxWords !== null && wordCount > maxWords) {
        throw Object.assign(new Error(`Le plan ${subscription.plan === "flash" ? "Flash / Découverte" : "Free"} autorise ${maxWords.toLocaleString("fr-FR")} mots maximum par analyse.`), {
          code: "WORD_LIMIT",
          maxWords,
        });
      }

      if (subscription.plan === "flash") {
        const usage = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM usage_events WHERE user_id=$1 AND event_type='analysis' AND created_at>=CURRENT_DATE AND created_at<CURRENT_DATE+INTERVAL '1 day'`,
          [userId]
        );
        if (Number(usage.rows[0]?.count ?? 0) >= 1) {
          throw Object.assign(new Error("Le plan Flash / Découverte autorise 1 analyse par jour."), { code: "DAILY_LIMIT", limit: 1 });
        }
      }

      const lower = fileName.toLowerCase();
      const fileType = lower.endsWith(".pdf") ? "pdf" : lower.endsWith(".docx") || lower.endsWith(".doc") ? "docx" : "txt";
      const analysis = await client.query(
        `INSERT INTO analyses (id,user_id,file_name,file_type,file_size_kb,word_count,ai_score,plagiarism_score,reference_score,human_score,language,analysis_result,processing_time_ms)
         VALUES (gen_random_uuid()::TEXT,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
         RETURNING id,file_name,file_type,file_size_kb,word_count,ai_score,plagiarism_score,reference_score,human_score,language,analysis_result,processing_time_ms,created_at`,
        [
          userId,
          fileName,
          fileType,
          Math.max(0, numberValue(b.sizeKo)),
          wordCount,
          numberValue(result.ia),
          numberValue(result.plagiat),
          numberValue(result.refs),
          numberValue(result.human),
          result.language ? String(result.language) : null,
          JSON.stringify(result),
          processingTime,
        ]
      );

      await client.query(
        `INSERT INTO usage_events(id,user_id,event_type,word_count) VALUES(gen_random_uuid()::TEXT,$1,'analysis',$2)`,
        [userId, wordCount]
      );

      return analysis.rows[0];
    });

    return res.status(201).json({ analysis: inserted });
  } catch (error) {
    console.error("[analyses/create] error", error);
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (code === "SUBSCRIPTION_INACTIVE") return sendError(res, 403, (error as Error).message, code);
    if (code === "WORD_LIMIT") return sendError(res, 403, (error as Error).message, code, { maxWords: (error as { maxWords?: number }).maxWords });
    if (code === "DAILY_LIMIT") return sendError(res, 403, (error as Error).message, code, { limit: 1 });
    const message = error instanceof Error ? error.message : "Impossible d'enregistrer l'analyse.";
    if (message.includes("DATABASE_URL")) return sendError(res, 503, "Base de données non configurée.", "DATABASE_NOT_CONFIGURED");
    if (message.includes("AUTH_SECRET")) return sendError(res, 503, "Authentification serveur non configurée.", "AUTH_SECRET_NOT_CONFIGURED");
    return sendError(res, 503, "Impossible d'enregistrer l'analyse. Votre analyse n'a pas été comptabilisée si l'enregistrement a échoué.", "ANALYSIS_PERSISTENCE_ERROR");
  }
}
