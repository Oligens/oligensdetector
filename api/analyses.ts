import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dbQuery, internalError, requireUser } from "./_dashboardDb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 50));
    // Select the complete row instead of naming optional columns. This keeps the endpoint compatible
    // with both the historical and the current production schema.
    const result = await dbQuery("SELECT a.* FROM analyses a WHERE a.user_id=$1 ORDER BY a.created_at DESC LIMIT $2", [user.id, limit]);
    return res.status(200).json({ analyses: result.rows });
  } catch (error) {
    return internalError(res, "analyses", error);
  }
}
