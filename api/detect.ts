import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { runCalibratedFullAnalysis } from "../src/lib/detector/calibratedFullAnalysis";
import { sanitizeDocument } from "../src/lib/detector/documentSanitizer";
import { detectWithGemini, geminiDetectorConfiguration } from "../src/lib/ai/geminiDetectorService";
import { copyleaksConfiguration, scanTextWithCopyleaks } from "../src/lib/detector/copyleaksService";

const COOKIE = "oligens_session";
const MAX_CHARS = 100_000;

function authUserId(req: VercelRequest): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not configured.");
  const raw = (req.headers.cookie ?? "").split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, secret, { issuer: "oligens-detector" }) as jwt.JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch { return null; }
}

function languageCode(value: string) {
  return value === "fr" || value === "en" || value === "es" || value === "de" || value === "it" || value === "pt" ? value : undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });

  try {
    if (!authUserId(req)) return res.status(401).json({ error: "Connexion requise.", code: "AUTH_REQUIRED" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "Le texte est vide.", code: "TEXT_EMPTY" });
    if (text.length > MAX_CHARS) return res.status(413).json({ error: "Le texte dépasse 100 000 caractères.", code: "TEXT_TOO_LARGE", maxCharacters: MAX_CHARS });
    const requestedLanguage = typeof body.language === "string" ? languageCode(body.language.slice(0, 2)) : undefined;

    // The server is the only source of truth. Bibliographies, references, footnotes
    // and formal quotations are excluded before both the local detector and external
    // AI detection are called.
    const sanitized = sanitizeDocument(text);
    const activeText = sanitized.activeText;
    if (activeText.trim().split(/\s+/).filter(Boolean).length < 30) {
      return res.status(400).json({ error: "Le corps actif contient moins de 30 mots après exclusion des références et citations.", code: "ACTIVE_TEXT_TOO_SHORT" });
    }

    const local = runCalibratedFullAnalysis(text, { language: requestedLanguage ?? "auto" });
    const external: Record<string, unknown> = {};
    let copyleaksScore: number | null = null;
    let geminiScore: number | null = null;

    // Copyleaks is the first external provider. It is synchronous and returns an
    // overall human/AI summary for the submitted text.
    const copyConfig = copyleaksConfiguration();
    if (copyConfig.configured && activeText.length >= 255) {
      try {
        const result = await scanTextWithCopyleaks(activeText, `oligens-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, { language: requestedLanguage, explain: true, sensitivity: 2 });
        copyleaksScore = Math.round(result.aiProbability * 100) / 100;
        external.copyleaks = result;
      } catch (error) {
        external.copyleaksError = error instanceof Error ? error.message : "Copyleaks indisponible.";
      }
    } else {
      external.copyleaks = { configured: copyConfig.configured, skipped: activeText.length < 255, environment: copyConfig.environment };
    }

    // Gemini is a secondary/hybrid signal. It is never given the bibliography or
    // formal quotation blocks, and it never receives an API key from the browser.
    const geminiConfig = geminiDetectorConfiguration();
    if (geminiConfig.configured) {
      try {
        const result = await detectWithGemini(activeText);
        geminiScore = Math.round(result.aiProbability * 100) / 100;
        external.gemini = result;
      } catch (error) {
        external.geminiError = error instanceof Error ? error.message : "Gemini indisponible.";
      }
    }

    const localScore = Math.round(local.probabilite_IA * 100);
    const candidateScores = [localScore];
    if (copyleaksScore !== null) candidateScores.push(Math.round(copyleaksScore * 100));
    if (geminiScore !== null) candidateScores.push(Math.round(geminiScore * 100));
    const finalScore = Math.min(100, Math.max(...candidateScores));

    // Hard business rule: the internal stylometric override can never be diluted
    // by an external provider that happens to return a low score.
    const zVocabulary = Number(local.z_scores[0] ?? 0) / 2;
    const zOriginality = Number(local.z_scores[15] ?? 0) / 2;
    const overrideTriggered = zOriginality <= -0.80 || zVocabulary <= -0.80;
    const authoritativeScore = overrideTriggered ? Math.max(finalScore, 85) : finalScore;
    local.probabilite_IA = Number((authoritativeScore / 100).toFixed(4));
    local.intervalle_confiance_95 = [Math.max(0, local.probabilite_IA - 0.08), Math.min(1, local.probabilite_IA + 0.08)];
    local.decision_precaution = overrideTriggered
      ? "Risque IA élevé : l'override stylométrique dominant a fixé un minimum de 85 %."
      : local.decision_precaution;

    return res.status(200).json({
      success: true,
      score: authoritativeScore,
      analysis: local,
      providers: {
        priority: copyleaksScore !== null ? "copyleaks" : geminiScore !== null ? "gemini" : "oligens-local",
        local: localScore,
        copyleaks: copyleaksScore === null ? null : Math.round(copyleaksScore * 100),
        gemini: geminiScore === null ? null : Math.round(geminiScore * 100),
        overrideTriggered,
      },
      sanitization: {
        activeCharacters: activeText.length,
        bibliographyCharacters: sanitized.bibliographyText.length,
        citationCharacters: sanitized.citationText.length,
        notesCharacters: sanitized.notesText.length,
        excludedBlocks: sanitized.excludedBlocks,
      },
      configuration: {
        copyleaks: copyConfig,
        gemini: geminiConfig,
        qwenConfigured: Boolean((process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY)?.trim()),
      },
    });
  } catch (error) {
    console.error("[detect] error", error);
    const message = error instanceof Error ? error.message : "Échec de la détection.";
    if (message.includes("AUTH_SECRET")) return res.status(503).json({ error: "Authentification serveur non configurée.", code: "AUTH_SECRET_NOT_CONFIGURED" });
    return res.status(502).json({ error: message, code: "DETECTOR_BACKEND_ERROR" });
  }
}
