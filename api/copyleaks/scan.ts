import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function copyleaksScan(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Méthode non autorisée.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  // Compatibility endpoint only. No authentication, database, SDK,
  // environment variable or external Copyleaks request is performed.
  return res.status(200).json({
    success: true,
    copyleaks_enabled: false,
    message: "Copyleaks désactivé. Le moteur local Oligens est utilisé.",
    result: {
      provider: "copyleaks",
      scanId: "",
      aiProbability: 0,
      humanProbability: 100,
      summary: { ai: 0, human: 100 },
      matched_sources: 0,
      similarity_score: 0,
      notice: "Vérification externe désactivée.",
      raw: null,
      environment: "production",
      sandbox: false,
    },
    configuration: {
      enabled: false,
      external_dependency: false,
    },
  });
}
