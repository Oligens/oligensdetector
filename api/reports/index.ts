import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUser } from "../_lib/auth.js";
import { query } from "../_lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "Authentification requise." });

    if (req.method === "GET") {
      const result = await query(`
        SELECT r.id,r.analysis_id,r.report_type,r.file_url,r.report_data,r.created_at,
               a.file_name,a.file_type,a.word_count,a.ai_score,a.plagiarism_score,a.created_at AS analysis_created_at
        FROM reports r
        LEFT JOIN analyses a ON a.id=r.analysis_id
        WHERE r.user_id=$1
        ORDER BY r.created_at DESC`, [user.id]);
      return res.status(200).json({ reports: result.rows });
    }

    if (req.method === "POST") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const analysisId = String(body.analysisId ?? "").trim();
      if (!analysisId) return res.status(400).json({ error: "analysisId requis." });
      const analysis = await query(`SELECT id,file_name,ai_score,plagiarism_score FROM analyses WHERE id=$1 AND user_id=$2`, [analysisId,user.id]);
      if (!analysis.rows[0]) return res.status(404).json({ error: "Analyse introuvable." });
      const hash = crypto.createHash("sha256").update(JSON.stringify(body.reportData ?? {})).digest("hex");
      const inserted = await query(`
        INSERT INTO reports(id,user_id,analysis_id,report_type,report_data,created_at)
        VALUES(gen_random_uuid()::TEXT,$1,$2,$3,$4::jsonb,NOW())
        RETURNING id,analysis_id,report_type,report_data,created_at`,
        [user.id,analysisId,String(body.reportType ?? "pdf"),JSON.stringify({ ...(body.reportData as Record<string, unknown> ?? {}), hash })]);
      return res.status(201).json({ report: inserted.rows[0], hash });
    }

    return res.status(405).json({ error: "Méthode non autorisée" });
  } catch (error) {
    console.error("[reports] error", error);
    return res.status(503).json({ error: "Rapports temporairement indisponibles.", code: "REPORTS_UNAVAILABLE" });
  }
}
