import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dbQuery, internalError, requireUser } from "./_dashboardDb";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const result = await dbQuery("SELECT r.* FROM reports r WHERE r.user_id=$1 ORDER BY r.created_at DESC", [user.id]);
    return res.status(200).json({ reports: result.rows });
  } catch (error) {
    return internalError(res, "reports", error);
  }
}
