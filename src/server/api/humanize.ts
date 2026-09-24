import type { VercelRequest, VercelResponse } from "@vercel/node";
import { humanizeLocal, MAX_TEXT_LENGTH, verifySessionCookie } from "./humanizeCore";
import { generateGeminiText } from "../gemini";

function requestText(req: VercelRequest): string {
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  return typeof body.text === "string" ? body.text.trim() : "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Oligens-Humanizer", "gemini-neon-v1");

  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });
  if (!verifySessionCookie(req.headers.cookie)) return res.status(401).json({ success: false, error: "Connexion requise.", code: "AUTH_REQUIRED" });

  const text = requestText(req);
  if (text.length < 20) return res.status(400).json({ success: false, error: "Le texte à humaniser est trop court.", code: "TEXT_TOO_SHORT" });
  if (text.length > MAX_TEXT_LENGTH) return res.status(413).json({ success: false, error: "Le texte dépasse 100 000 caractères.", code: "TEXT_TOO_LARGE" });

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const started = Date.now();

  try {
    const gemini = await generateGeminiText({
      text,
      language: typeof body.language === "string" ? body.language : "auto",
      mode: body.mode === "ultra" ? "ultra" : "standard",
    });

    if (gemini.text.trim() && gemini.text.trim() !== text) {
      return res.status(200).json({
        success: true, status: "success",
        text: gemini.text.trim(), texteFinal: gemini.text.trim(),
        originalText: text, original_text: text,
        humanizedText: gemini.text.trim(), humanized_text: gemini.text.trim(),
        provider: "gemini", engine_used: "Gemini_Neon_Key_Rotation",
        engine_name: "Google Gemini via Neon-managed API keys", engine_version: "1.0.0",
        analysis_mode: "server_gemini_neon", offline_engine: false,
        python_subprocess: false, external_dependency: true, fallback_engine: false,
        key_rotation: { attempted: gemini.attemptedKeys, used: gemini.keyIndex + 1, total: gemini.totalKeys },
        model: gemini.model,
        processing_time_ms: Date.now() - started,
      });
    }
    throw new Error("Gemini a renvoyé un résultat vide ou inchangé.");
  } catch (error) {
    console.error("[api/humanize] Gemini failed; using local safe fallback", error);
    try {
      const transformed = humanizeLocal(text, { intensity: body.intensity, language: body.language, mode: body.mode });
      return res.status(200).json({
        success: true, status: "degraded",
        text: transformed.text, texteFinal: transformed.text,
        originalText: text, original_text: text,
        humanizedText: transformed.text, humanized_text: transformed.text,
        provider: "local-safe-recovery", engine_used: "COJ_Local_TS_Humanizer",
        engine_name: "COJ Local TypeScript Humanizer", engine_version: "4.0.0",
        analysis_mode: "gemini_unavailable_local_fallback", offline_engine: true,
        python_subprocess: false, external_dependency: false, fallback_engine: true,
        processing_time_ms: Date.now() - started,
        metrics: { original_length: transformed.originalLength, humanized_length: transformed.finalLength, changed: transformed.changed, changes: transformed.changes, intensity: transformed.intensity, language: transformed.language, mode: transformed.mode },
        error_recovered: true,
      });
    } catch (fallbackError) {
      console.error("[api/humanize] local fallback failed", fallbackError);
      return res.status(200).json({
        success: true, status: "degraded", text, texteFinal: text,
        originalText: text, original_text: text, humanizedText: text, humanized_text: text,
        provider: "safe-recovery", engine_used: "COJ_Safe_Recovery",
        engine_version: "4.0.0", analysis_mode: "safe_recovery",
        offline_engine: true, fallback_engine: true, error_recovered: true,
        processing_time_ms: Date.now() - started,
      });
    }
  }
}
