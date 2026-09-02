import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUser } from "../_lib/auth.js";
import { query } from "../_lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "Authentification requise." });

    if (req.method === "GET") {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
      const result = await query(`
        SELECT id, file_name, file_type, file_size_kb, word_count, ai_score,
               plagiarism_score, reference_score, human_score, language,
               analysis_result, processing_time_ms, created_at
        FROM analyses
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`, [user.id, limit]);
      return res.status(200).json({ analyses: result.rows });
    }

    return res.status(405).json({ error: "Méthode non autorisée" });
  } catch (error) {
    console.error("[analyses] error", error);
    return res.status(503).json({ error: "Données d'analyse temporairement indisponibles.", code: "ANALYSES_UNAVAILABLE" });
  }
}
