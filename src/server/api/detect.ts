import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { runPythonDetectorPort } from "../../lib/engines/pythonPort/detectorEngine";

const COOKIE = "oligens_session";

function authenticated(req: VercelRequest): boolean {
  const secret = process.env.AUTH_SECRET?.trim();
  const token = (req.headers.cookie ?? "")
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!secret || secret.length < 32 || !token) return false;
  try { jwt.verify(token, secret, { issuer: "oligens-detector" }); return true; } catch { return false; }
}

function language(value: unknown, text: string): "fr" | "en" | "mixte" {
  if (value === "fr" || value === "en") return value;
  const lower = text.toLocaleLowerCase();
  const fr = (lower.match(/\b(le|la|les|des|une|est|dans|pour|avec|que|qui|et|du|au|aux)\b/gu) ?? []).length;
  const en = (lower.match(/\b(the|and|of|to|is|in|for|with|that|this|are|from)\b/gu) ?? []).length;
  if (!fr && !en) return "mixte";
  return fr >= en * 2 ? "fr" : en >= fr * 2 ? "en" : "mixte";
}

function confidence(wordCount: number): "Faible" | "Moyenne" | "Élevée" {
  if (wordCount < 100) return "Faible";
  if (wordCount < 650) return "Moyenne";
  return "Élevée";
}

function buildAnalysis(text: string, detector: ReturnType<typeof runPythonDetectorPort>) {
  const tokens = text.match(/[\p{L}\p{N}']+/gu) ?? [];
  const sentences = text.split(/[.!?]+\s*|\n+/).map(s => s.trim()).filter(Boolean);
  const wordCount = tokens.length;
  const chars = text.length;
  const ai = detector.probability;
  const features = detector.features;
  const report = [
    ["Python-port — signature IA", features.signatureScore / 100, features.signatureScore / 100],
    ["Python-port — diversité entropique", features.entropyDiversityIndex / 100, (100 - features.entropyDiversityIndex) / 100],
    ["Python-port — diversité verbale", features.verbDiversity / 100, (100 - features.verbDiversity) / 100],
    ["Python-port — marqueurs de prudence", features.hedgingPhrases / 100, features.hedgingPhrases / 100],
    ["Python-port — transitions LLM", features.transitionMarkers / 100, features.transitionMarkers / 100],
    ["Python-port — répétitions", features.repetitionPatterns / 100, features.repetitionPatterns / 100],
    ["Python-port — complexité moyenne", features.avgSentenceComplexity / 100, features.avgSentenceComplexity / 100],
    ["Python-port — variabilité ponctuation", features.punctuationVariability / 100, features.punctuationVariability / 100],
  ].map(([nom, z_score, contribution]) => ({ nom: String(nom), z_score: Number(z_score), contribution: Number(contribution) }));

  const models = Object.entries(features.signatureHits)
    .filter(([, hits]) => hits > 0)
    .map(([model, hits]) => ({ model, vendor: model, share: hits / Math.max(1, Object.values(features.signatureHits).reduce((a, b) => a + b, 0)) }));

  return {
    probabilite_IA: Number(ai.toFixed(4)),
    intervalle_confiance_95: [Math.max(0, ai - 0.15), Math.min(1, ai + 0.15)] as [number, number],
    confiance_analyse: confidence(wordCount),
    genre_detecte: "generic",
    rapport_detaille: report.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 10),
    decision_precaution: ai >= 0.75
      ? "Présence forte d'indices compatibles avec une génération IA."
      : ai >= 0.5
        ? "Indices modérés. Une interprétation prudente est recommandée."
        : "Aucun indice significatif de génération IA détecté.",
    features: {
      python_signature_score: features.signatureScore,
      entropy_diversity_index: features.entropyDiversityIndex,
      verb_diversity: features.verbDiversity,
      hedging_phrases: features.hedgingPhrases,
      transition_markers: features.transitionMarkers,
      repetition_patterns: features.repetitionPatterns,
      avg_sentence_complexity: features.avgSentenceComplexity,
      punctuation_variability: features.punctuationVariability,
    },
    z_scores: report.map(item => item.z_score),
    signature: {
      modele_principal: models.length ? models.sort((a, b) => b.share - a.share)[0].model : null,
      note: models.length ? "Signature linguistique détectée par le moteur Python-port TypeScript." : "Aucune signature automatisée dominante ne se détache.",
      modeles: models,
    },
    statistiques: { mots: wordCount, phrases: sentences.length, caracteres: chars },
    langue: language(undefined, text),
    references: { total: 0, douteuses: 0 },
    plagiat_estime: 0,
    processing: { mode: "direct" as const, durationMs: 0, words: wordCount },
    pythonDetector: detector,
  };
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });
  if (!authenticated(req)) return res.status(401).json({ error: "Connexion requise.", code: "AUTH_REQUIRED" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Aucun texte fourni pour l'analyse.", code: "TEXT_EMPTY" });
  if (text.length > 100_000) return res.status(413).json({ error: "Le texte dépasse 100 000 caractères.", code: "TEXT_TOO_LARGE" });

  const started = Date.now();
  try {
    const detector = runPythonDetectorPort(text);
    const analysis = buildAnalysis(text, detector);
    analysis.langue = language(body.language, text);
    analysis.processing.durationMs = Date.now() - started;
    return res.status(200).json({
      success: true,
      status: "success",
      score: detector.score,
      is_ai_generated: detector.probability >= 0.5,
      confidence_score: detector.score,
      analysis,
      data: { analysis, detector },
      result: analysis,
      engine: detector.engine,
      engine_used: detector.engine,
      analysis_mode: "python_port_typescript",
      offline_engine: true,
      python_subprocess: false,
      external_dependency: false,
      processing_time_ms: Date.now() - started,
    });
  } catch (error) {
    console.error("[detect] Python-port TypeScript engine error", error);
    return res.status(200).json({
      success: true,
      status: "fallback",
      score: 0,
      is_ai_generated: false,
      confidence_score: 0,
      analysis: buildAnalysis(text, { score: 0, probability: 0, engine: "python-detector-typescript-port", features: {
        signatureScore: 0, entropyDiversityIndex: 0, verbDiversity: 0, hedgingPhrases: 0,
        transitionMarkers: 0, repetitionPatterns: 0, avgSentenceComplexity: 0, punctuationVariability: 0,
        overallAiProbability: 0, signatureHits: {},
      }}),
      engine: "python-detector-typescript-port",
      engine_used: "python-detector-typescript-port",
      analysis_mode: "safe_fallback",
      offline_engine: true,
      python_subprocess: false,
      external_dependency: false,
      error: error instanceof Error ? error.message : "Moteur local indisponible.",
      processing_time_ms: Date.now() - started,
    });
  }
}
