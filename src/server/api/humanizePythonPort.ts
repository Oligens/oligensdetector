import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { runPythonHumanizerPort } from "../../lib/engines/pythonPort/humanizerEngine";
import { humanizerEngine } from "../../lib/humanizer/humanizerUltimate";
import { humanizeWithDeepSeek, deepSeekConfiguration } from "../../lib/ai/deepseekService";
import { humanizeWithGemini, geminiConfiguration } from "../../lib/ai/geminiService";

const COOKIE = "oligens_session";

function authenticated(req: VercelRequest): boolean {
  const secret = process.env.AUTH_SECRET?.trim();
  const token = (req.headers.cookie ?? "").split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!secret || secret.length < 32 || !token) return false;
  try { jwt.verify(token, secret, { issuer: "oligens-detector" }); return true; } catch { return false; }
}

function cloudFallbackEnabled(body: Record<string, unknown>): boolean {
  return body.useCloud === true || process.env.LOCAL_FIRST_CLOUD_FALLBACK === "true";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });
  if (!authenticated(req)) return res.status(401).json({ error: "Connexion requise.", code: "AUTH_REQUIRED" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 20) return res.status(400).json({ error: "Le texte à humaniser est trop court.", code: "TEXT_TOO_SHORT" });
  if (text.length > 100_000) return res.status(413).json({ error: "Le texte dépasse 100 000 caractères.", code: "TEXT_TOO_LARGE" });

  const startedAt = Date.now();
  try {
    const local = await runPythonHumanizerPort(text, {
      intensity: Number(body.intensity ?? 0.95),
      warmth: Number(body.warmth ?? 0.5),
      seed: typeof body.seed === "number" ? body.seed : undefined,
      language: body.language === "fr" || body.language === "en" ? body.language : "mixte",
      targetScore: Number(body.targetScore ?? 0.05),
      maxIterations: Number(body.maxIterations ?? 12),
    });

    const result: Record<string, unknown> = {
      success: true,
      ...local,
      text: local.humanized_text,
      texteFinal: local.humanized_text,
      provider: "local",
      engine_used: local.engine_used,
      fallback_engine: false,
      analysis_mode: "python_port_local_first",
      offline_engine: true,
      processing_time_ms: Date.now() - startedAt,
      trace: {
        external_dependency: false,
        python_subprocess: false,
        source_contract: "text_humanizer.py + text_humanizer_v2.py",
      },
    };

    if (!cloudFallbackEnabled(body)) return res.status(200).json(result);

    const cloudErrors: string[] = [];
    if (deepSeekConfiguration().configured) {
      try {
        const cloud = await humanizeWithDeepSeek(text, { language: local.detected_language === "mixed" ? undefined : local.detected_language, mode: "standard" });
        return res.status(200).json({ success: true, ...cloud, provider: "deepseek", engine_used: "cloud_deepseek", fallback_engine: false, local_first: true, local_preview: local.humanized_text, python_port_local: local, processing_time_ms: Date.now() - startedAt });
      } catch (error) { cloudErrors.push(error instanceof Error ? error.message : "DeepSeek indisponible."); }
    }
    if (geminiConfiguration().configured) {
      try {
        const cloud = await humanizeWithGemini(text, { language: local.detected_language === "mixed" ? undefined : local.detected_language, mode: "standard" });
        return res.status(200).json({ success: true, ...cloud, provider: "gemini", engine_used: "cloud_gemini", fallback_engine: false, local_first: true, local_preview: local.humanized_text, python_port_local: local, processing_time_ms: Date.now() - startedAt });
      } catch (error) { cloudErrors.push(error instanceof Error ? error.message : "Gemini indisponible."); }
    }
    return res.status(200).json({ ...result, fallback_reason: cloudErrors.length ? cloudErrors.join(" | ") : "Aucun fournisseur cloud configuré." });
  } catch (error) {
    console.error("[humanize] Python-port engine error", error);
    try {
      const fallback = await humanizerEngine.humanizeUltimateStream(text, {
        seuilCible: 0.05,
        iterationsMax: 12,
        intensite: 0.95,
        langue: body.language === "en" ? "en" : body.language === "fr" ? "fr" : "mixte",
        modeAggressif: false,
      });
      return res.status(200).json({ success: true, text: fallback.texteFinal, texteFinal: fallback.texteFinal, original_text: text, humanized_text: fallback.texteFinal, provider: "local", engine_used: "oligens-ultimate-emergency", fallback_engine: true, analysis_mode: "ultimate_emergency_fallback", offline_engine: true, report: fallback.rapport, error_message: error instanceof Error ? error.message : "Moteur local indisponible.", processing_time_ms: Date.now() - startedAt });
    } catch (fallbackError) {
      return res.status(200).json({ success: true, text, original_text: text, humanized_text: text, provider: "local", engine_used: "identity_emergency_fallback", fallback_engine: true, analysis_mode: "identity_fallback", offline_engine: true, error_message: fallbackError instanceof Error ? fallbackError.message : "Moteur local indisponible.", processing_time_ms: Date.now() - startedAt });
    }
  }
}
