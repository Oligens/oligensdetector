import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUser } from "../_lib/auth.js";
import { query } from "../_lib/db.js";

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "Authentification requise." });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const fileName = String(body.fileName ?? "").trim();
    const result = (body.result ?? {}) as Record<string, unknown>;
    if (!fileName) return res.status(400).json({ error: "Nom de fichier requis." });

    const fileType = fileName.toLowerCase().endsWith(".pdf") ? "pdf" : fileName.toLowerCase().endsWith(".docx") || fileName.toLowerCase().endsWith(".doc") ? "docx" : "txt";
    const wordCount = Math.max(0, Math.round(asNumber((result.engine as Record<string, unknown> | undefined)?.words)));
    const processingTime = Math.max(0, Math.round(asNumber((result.engine as Record<string, unknown> | undefined)?.durationMs)));

    const inserted = await query(`
      INSERT INTO analyses (
        id,user_id,file_name,file_type,file_size_kb,word_count,
        ai_score,plagiarism_score,reference_score,human_score,language,
        analysis_result,processing_time_ms
      ) VALUES (
        gen_random_uuid()::TEXT,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12
      )
      RETURNING id,file_name,file_type,file_size_kb,word_count,ai_score,
                plagiarism_score,reference_score,human_score,language,
                analysis_result,processing_time_ms,created_at`,
      [
        user.id,
        fileName,
        fileType,
        Math.max(0, asNumber(body.sizeKo)),
        wordCount,
        asNumber(result.ia),
        asNumber(result.plagiat),
        asNumber(result.refs),
        asNumber(result.human),
        result.language ? String(result.language) : null,
        JSON.stringify(result),
        processingTime,
      ],
    );
    return res.status(201).json({ analysis: inserted.rows[0] });
  } catch (error) {
    console.error("[analyses/create] error", error);
    return res.status(503).json({ error: "Impossible d'enregistrer l'analyse.", code: "ANALYSIS_PERSISTENCE_ERROR" });
  }
}
