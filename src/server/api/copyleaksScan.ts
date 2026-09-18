import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Méthode non autorisée.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  // Copyleaks est volontairement désactivé en production.
  // La vérification locale Oligens reste la source d'analyse.
  return res.status(200).json({
    success: true,
    copyleaks_enabled: false,
    message:
      "Module Copyleaks désactivé - Utilisation exclusive du moteur local Oligens.",
    result: {
      provider: "copyleaks",
      scanId: "",
      aiProbability: 0,
      humanProbability: 100,
      summary: {
        ai: 0,
        human: 100,
      },
      matched_sources: 0,
      similarity_score: 0,
      notice: "Vérification externe désactivée avec succès.",
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
