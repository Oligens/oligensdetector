import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../src/server/api/copyleaksScan";

export default async function copyleaksScan(req: VercelRequest, res: VercelResponse) {
  try {
    return await handler(req, res);
  } catch (error) {
    console.error("[api/copyleaks/scan] unhandled error", error);
    return res.status(503).json({
      success: false,
      error: "Vérification Copyleaks temporairement indisponible.",
      code: "COPYLEAKS_UNAVAILABLE",
      result: { provider: "copyleaks", scanId: "", aiProbability: 0, humanProbability: 0, summary: { ai: 0, human: 0 }, raw: null, environment: "production", sandbox: false }
    });
  }
}