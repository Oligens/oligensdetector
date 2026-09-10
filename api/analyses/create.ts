import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { Pool, type PoolClient } from "pg";

const COOKIE = "oligens_session";
function databaseUrl() { const value = process.env.DATABASE_URL?.trim(); if (!value) throw new Error("DATABASE_URL is not configured."); try { const url = new URL(value); const sslmode = url.searchParams.get("sslmode"); if (sslmode && sslmode !== "verify-full") url.searchParams.set("sslmode", "verify-full"); return url.toString(); } catch { return value; } }
let pool: Pool | undefined;
function getPool() { if (pool) return pool; pool = new Pool({ connectionString: databaseUrl(), max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000, ssl: { rejectUnauthorized: true }, application_name: "oligens-detector-analysis-create" }); pool.on("error", (error) => console.error("[analyses/create] idle client error", error)); return pool; }
function authUserId(req: VercelRequest): string | null { const secret = process.env.AUTH_SECRET?.trim(); if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not configured."); const raw = (req.headers.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1); if (!raw) return null; try { const payload = jwt.verify(raw, secret, { issuer: "oligens-detector" }) as jwt.JwtPayload; return typeof payload.sub === "string" ? payload.sub : null; } catch { return null; } }
async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> { const client = await getPool().connect(); try { await client.query("BEGIN"); const result = await fn(client); await client.query("COMMIT"); return result; } catch (error) { try { await client.query("ROLLBACK"); } catch (rollbackError) { console.error("[analyses/create] rollback error", rollbackError); } throw error; } finally { client.release(); } }
function body(req: VercelRequest) { return (req.body ?? {}) as Record<string, unknown>; }
function numberValue(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function sendError(res: VercelResponse, status: number, error: string, code: string, extra: Record<string, unknown> = {}) { return res.status(status).json({ error, code, ...extra }); }
function quotaError(result: { code?: string; maxWords?: number }): never { if (result.code === "SUBSCRIPTION_INACTIVE") throw Object.assign(new Error("Votre abonnement n'est pas actif."), { code: result.code }); if (result.code === "NO_SUBSCRIPTION") throw Object.assign(new Error("Aucun abonnement actif n'est associé à ce compte."), { code: result.code }); if (result.code === "WORD_LIMIT") throw Object.assign(new Error(`Votre plan autorise ${Number(result.maxWords ?? 0).toLocaleString("fr-FR")} mots maximum par analyse.`), { code: result.code, maxWords: result.maxWords }); if (result.code === "DAILY_LIMIT") throw Object.assign(new Error("Le plan Flash / Découverte autorise 1 analyse par jour."), { code: result.code, limit: 1 }); throw Object.assign(new Error("Analyse non autorisée."), { code: result.code ?? "ANALYSIS_NOT_ALLOWED" }); }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return sendError(res, 405, "Méthode non autorisée.", "METHOD_NOT_ALLOWED");
  try {
    const userId = authUserId(req); if (!userId) return sendError(res, 401, "Connexion requise.", "AUTH_REQUIRED");
    const b = body(req), fileName = String(b.fileName ?? "").trim(), result = (b.result ?? {}) as Record<string, unknown>;
    if (!fileName) return sendError(res, 400, "Nom de fichier requis.", "INVALID_FILE_NAME");
    const engine = (result.engine ?? {}) as Record<string, unknown>;
    const wordCount = Math.max(0, Math.round(numberValue(engine.words))), processingTime = Math.max(0, Math.round(numberValue(engine.durationMs)));
    if (wordCount < 30) return sendError(res, 400, "Le texte doit contenir au moins 30 mots pour une analyse fiable.", "TEXT_TOO_SHORT", { minWords: 30 });
    if (wordCount > 100_000) return sendError(res, 413, "Le texte dépasse la limite de 100 000 mots par analyse.", "TEXT_TOO_LARGE", { maxWords: 100_000 });

    const inserted = await transaction(async (client) => {
      const account = await client.query<{ is_active: boolean; email_verified: boolean }>("SELECT is_active,email_verified FROM users WHERE id=$1 FOR SHARE", [userId]);
      const user = account.rows[0];
      if (!user || !user.is_active) throw Object.assign(new Error("Compte désactivé."), { code: "ACCOUNT_INACTIVE" });
      if (!user.email_verified) throw Object.assign(new Error("E-mail non vérifié."), { code: "EMAIL_NOT_VERIFIED" });

      const quotaRow = await client.query<{ result: { allowed: boolean; code?: string; maxWords?: number; limit?: number; plan?: string } }>("SELECT consume_analysis($1,$2)::jsonb AS result", [userId, wordCount]);
      const quota = quotaRow.rows[0]?.result; if (!quota?.allowed) quotaError(quota ?? { allowed: false, code: "ANALYSIS_NOT_ALLOWED" });
      const lower = fileName.toLowerCase(), fileType = lower.endsWith(".pdf") ? "pdf" : lower.endsWith(".docx") || lower.endsWith(".doc") ? "docx" : "txt";
      const analysis = await client.query(
        `INSERT INTO analyses (id,user_id,file_name,file_type,file_size_kb,word_count,ai_score,plagiarism_score,reference_score,human_score,language,analysis_result,processing_time_ms)
         VALUES (gen_random_uuid()::TEXT,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
         RETURNING id,file_name,file_type,file_size_kb,word_count,ai_score,plagiarism_score,reference_score,human_score,language,analysis_result,processing_time_ms,created_at`,
        [userId,fileName,fileType,Math.max(0,numberValue(b.sizeKo)),wordCount,numberValue(result.ia),numberValue(result.plagiat),numberValue(result.refs),numberValue(result.human),result.language ? String(result.language) : null,JSON.stringify(result),processingTime],
      );
      return analysis.rows[0];
    });
    return res.status(201).json({ analysis: inserted });
  } catch (error) {
    console.error("[analyses/create] error", error);
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
    if (["SUBSCRIPTION_INACTIVE","NO_SUBSCRIPTION","WORD_LIMIT","DAILY_LIMIT","ANALYSIS_NOT_ALLOWED","ACCOUNT_INACTIVE","EMAIL_NOT_VERIFIED"].includes(code)) return sendError(res, code === "ACCOUNT_INACTIVE" || code === "EMAIL_NOT_VERIFIED" ? 403 : 403, (error as Error).message, code, code === "WORD_LIMIT" ? { maxWords: (error as { maxWords?: number }).maxWords } : code === "DAILY_LIMIT" ? { limit: 1 } : {});
    const message = error instanceof Error ? error.message : "Impossible d'enregistrer l'analyse.";
    if (message.includes("DATABASE_URL")) return sendError(res, 503, "Base de données non configurée.", "DATABASE_NOT_CONFIGURED");
    if (message.includes("AUTH_SECRET")) return sendError(res, 503, "Authentification serveur non configurée.", "AUTH_SECRET_NOT_CONFIGURED");
    if (/consume_analysis|function .* does not exist/i.test(message)) return sendError(res, 503, "La migration de sécurité de la base de données n'est pas encore appliquée.", "DATABASE_MIGRATION_REQUIRED");
    return sendError(res, 503, "Impossible d'enregistrer l'analyse. Votre analyse n'a pas été comptabilisée si l'enregistrement a échoué.", "ANALYSIS_PERSISTENCE_ERROR");
  }
}
