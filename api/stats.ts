import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dbQuery, internalError, requireUser } from "./_dashboardDb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const result = await dbQuery(`
      SELECT
        COUNT(*)::int AS total_analyses,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS analyses_today,
        COALESCE(SUM(word_count),0)::int AS total_words,
        COALESCE(AVG(ai_score),0)::numeric AS average_ai_score,
        COALESCE(AVG(plagiarism_score),0)::numeric AS average_plagiarism_score,
        COALESCE(AVG(human_score),0)::numeric AS average_human_score
      FROM analyses
      WHERE user_id=$1
    `, [user.id]);
    const reportCount = await dbQuery("SELECT COUNT(*)::int AS count FROM reports WHERE user_id=$1", [user.id]);
    const databaseCount = await dbQuery("SELECT COUNT(*)::int AS count FROM institutional_databases WHERE user_id=$1", [user.id]);
    const row = result.rows[0] ?? {};
    const stats = {
      totalAnalyses: Number(row.total_analyses ?? 0),
      analysesToday: Number(row.analyses_today ?? 0),
      totalWords: Number(row.total_words ?? 0),
      averageAiScore: Number(row.average_ai_score ?? 0),
      averagePlagiarismScore: Number(row.average_plagiarism_score ?? 0),
      averageHumanScore: Number(row.average_human_score ?? 0),
      totalReports: Number(reportCount.rows[0]?.count ?? 0),
      totalDatabases: Number(databaseCount.rows[0]?.count ?? 0),
    };
    return res.status(200).json({ ...stats, stats });
  } catch (error) {
    return internalError(res, "stats", error);
  }
}
