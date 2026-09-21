import type { VercelRequest, VercelResponse } from "@vercel/node";
import { humanizeLocal, MAX_TEXT_LENGTH, verifySessionCookie } from "../src/server/api/humanizeCore";


function requestText(req: VercelRequest): string {
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  return typeof body.text === "string" ? body.text.trim() : "";
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Oligens-Humanizer", "local-ts-v4");

  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });
  if (!verifySessionCookie(req.headers.cookie)) return res.status(401).json({ success: false, error: "Connexion requise.", code: "AUTH_REQUIRED" });

  const text = requestText(req);
  if (text.length < 20) return res.status(400).json({ success: false, error: "Le texte à humaniser est trop court.", code: "TEXT_TOO_SHORT" });
  if (text.length > MAX_TEXT_LENGTH) return res.status(413).json({ success: false, error: "Le texte dépasse 100 000 caractères.", code: "TEXT_TOO_LARGE" });

  try {
    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    const started = Date.now();
    const transformed = humanizeLocal(text, { intensity: body.intensity, language: body.language, mode: body.mode });
    return res.status(200).json({
      success: true, status: "success",
      text: transformed.text, texteFinal: transformed.text,
      originalText: text, original_text: text,
      humanizedText: transformed.text, humanized_text: transformed.text,
      provider: "local", engine_used: "COJ_Local_TS_Humanizer",
      engine_name: "COJ Local TypeScript Humanizer", engine_version: "4.0.0",
      analysis_mode: "local_zero_dependency", offline_engine: true,
      python_subprocess: false, external_dependency: false, fallback_engine: false,
      processing_time_ms: Date.now() - started,
      metrics: { original_length: transformed.originalLength, humanized_length: transformed.finalLength, changed: transformed.changed, changes: transformed.changes, intensity: transformed.intensity, language: transformed.language, mode: transformed.mode }
    });
  } catch (error) {
    console.error("undefined", error);
    return res.status(200).json({
      success: true, status: "degraded",
      text, texteFinal: text, originalText: text, original_text: text,
      humanizedText: text, humanized_text: text,
      provider: "local-safe-recovery", engine_used: "COJ_Safe_Recovery",
      engine_version: "4.0.0", analysis_mode: "safe_recovery",
      offline_engine: true, fallback_engine: true, error_recovered: true, processing_time_ms: 0
    });
  }
}
