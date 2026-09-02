import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUser } from "./_lib/auth.js";
import { query } from "./_lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "Authentification requise." });

    const [summary, activity] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int AS analyses_count,
          COALESCE(AVG(ai_score),0)::float AS avg_ai,
          COALESCE(AVG(plagiarism_score),0)::float AS avg_plagiarism,
          COALESCE(AVG(processing_time_ms),0)::float AS avg_processing_ms,
          COALESCE(SUM(word_count),0)::bigint AS total_words
        FROM analyses WHERE user_id=$1`, [user.id]),
      query(`
        SELECT TO_CHAR(DATE_TRUNC('day',created_at),'YYYY-MM-DD') AS day,
               COUNT(*)::int AS analyses_count,
               COALESCE(AVG(ai_score),0)::float AS avg_ai
        FROM analyses
        WHERE user_id=$1 AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day',created_at)
        ORDER BY DATE_TRUNC('day',created_at) ASC`, [user.id]),
    ]);

    const reports = await query(`SELECT COUNT(*)::int AS reports_count FROM reports WHERE user_id=$1`, [user.id]);
    const databases = await query(`
      SELECT COUNT(*)::int AS database_count,
             COALESCE(SUM(document_count),0)::bigint AS database_documents
      FROM institutional_databases WHERE user_id=$1`, [user.id]);

    return res.status(200).json({
      analysesCount: Number(summary.rows[0]?.analyses_count ?? 0),
      reportsCount: Number(reports.rows[0]?.reports_count ?? 0),
      avgAi: Number(summary.rows[0]?.avg_ai ?? 0),
      avgPlagiarism: Number(summary.rows[0]?.avg_plagiarism ?? 0),
      avgProcessingMs: Number(summary.rows[0]?.avg_processing_ms ?? 0),
      totalWords: Number(summary.rows[0]?.total_words ?? 0),
      databaseCount: Number(databases.rows[0]?.database_count ?? 0),
      databaseDocuments: Number(databases.rows[0]?.database_documents ?? 0),
      activity: activity.rows,
    });
  } catch (error) {
    console.error("[stats] error", error);
    return res.status(503).json({ error: "Statistiques temporairement indisponibles.", code: "STATS_UNAVAILABLE" });
  }
}
