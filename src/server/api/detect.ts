import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { analyzeLocally, type LocalAnalyzerLanguage } from "../utils/localAnalyzer";
import { detectWithGemini, geminiDetectorConfiguration } from "../../lib/ai/geminiDetectorService";
import { detectWithDeepSeek, deepSeekConfiguration } from "../../lib/ai/deepseekService";

const COOKIE = "oligens_session";

function authenticated(req: VercelRequest): boolean {
  const secret = process.env.AUTH_SECRET?.trim();
  const token = (req.headers.cookie ?? "")
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!secret || secret.length < 32 || !token) return false;
  try {
    jwt.verify(token, secret, { issuer: "oligens-detector" });
    return true;
  } catch {
    return false;
  }
}

function cloudFallbackEnabled(body: Record<string, unknown>): boolean {
  return body.useCloud === true || process.env.LOCAL_FIRST_CLOUD_FALLBACK === "true";
}

function languageOf(value: unknown): LocalAnalyzerLanguage {
  return value === "fr" || value === "en" ? value : "auto";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });
  }
  if (!authenticated(req)) {
    return res.status(401).json({ error: "Connexion requise.", code: "AUTH_REQUIRED" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Aucun texte fourni pour l'analyse.", code: "TEXT_EMPTY" });
  if (text.length > 100_000) return res.status(413).json({ error: "Le texte dépasse 100 000 caractères.", code: "TEXT_TOO_LARGE" });

  const startedAt = Date.now();
  try {
    // Vercel-safe path: pure TypeScript, in-process, no Python subprocess and
    // no paid/external provider is required for the normal request path.
    const local = analyzeLocally(text, languageOf(body.language));
    const localResult: Record<string, unknown> = {
      ...local,
      providers: {
        priority: "oligens-local",
        local: local.score,
        gemini: null,
        deepseek: null,
      },
      processing_time_ms: Date.now() - startedAt,
    };

    if (!cloudFallbackEnabled(body)) return res.status(200).json(localResult);

    const errors: string[] = [];
    if (geminiDetectorConfiguration().configured) {
      try {
        const cloud = await detectWithGemini(text);
        return res.status(200).json({
          ...localResult,
          score: Math.round(cloud.aiProbability * 100),
          analysis_mode: "cloud_fallback",
          offline_engine: false,
          providers: { ...localResult.providers as Record<string, unknown>, priority: "gemini", gemini: Math.round(cloud.aiProbability * 100) },
          external: { gemini: cloud },
          local_preview: local.analysis,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Gemini indisponible.");
      }
    }
    if (deepSeekConfiguration().configured) {
      try {
        const cloud = await detectWithDeepSeek(text);
        return res.status(200).json({
          ...localResult,
          score: Math.round(cloud.aiProbability * 100),
          analysis_mode: "cloud_fallback",
          offline_engine: false,
          providers: { ...localResult.providers as Record<string, unknown>, priority: "deepseek", deepseek: Math.round(cloud.aiProbability * 100) },
          external: { deepseek: cloud },
          local_preview: local.analysis,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "DeepSeek indisponible.");
      }
    }

    return res.status(200).json({
      ...localResult,
      analysis_mode: "local_fallback",
      fallback_reason: errors.length ? errors.join(" | ") : "Aucun fournisseur cloud configuré.",
      processing_time_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[detect] local engine error", error);
    return res.status(200).json({
      success: true,
      score: 0,
      analysis_mode: "local_fallback",
      offline_engine: true,
      engine: "oligens-local-typescript-error-fallback",
      providers: { priority: "local-error-fallback", local: 0, gemini: null, deepseek: null },
      trace: { external_dependency: false, python_subprocess: false },
      error: error instanceof Error ? error.message : "Moteur local indisponible.",
      processing_time_ms: Date.now() - startedAt,
    });
  }
}
