import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUser } from "../_lib/auth.js";
import { query } from "../_lib/db.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const user = await getUser(req);
    if (!user) {
      return res.status(401).json({ error: "Connexion requise." });
    }

    const words = Number(req.body?.words ?? 0);
    if (!Number.isInteger(words) || words < 0) {
      return res.status(400).json({ error: "Nombre de mots invalide." });
    }

    const result = await query<{
      allowed: boolean;
      plan: string;
      reason: string | null;
      analyses_today: number;
    }>(
      "SELECT * FROM consume_analysis($1, $2)",
      [user.id, words],
    );

    const usage = result.rows[0];

    if (!usage?.allowed) {
      const message =
        usage?.reason === "free_word_limit_2500"
          ? "Le plan Free est limité à 2 500 mots par analyse."
          : usage?.reason === "flash_daily_limit_reached"
            ? "Le plan Flash autorise une analyse par jour."
            : "Analyse non autorisée.";

      return res.status(403).json({
        allowed: false,
        reason: usage?.reason,
        message,
      });
    }

    return res.status(200).json(usage);
  } catch (error) {
    console.error("[usage/consume]", error);
    return res.status(500).json({ error: "Impossible de valider le quota." });
  }
}
