import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";

const COOKIE = "oligens_session";
const MAX_TEXT_LENGTH = 100_000;

function getSessionToken(req: VercelRequest): string | null {
  const cookieHeader = req.headers.cookie ?? "";
  const part = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(COOKIE + "="));
  return part ? part.slice(COOKIE.length + 1) : null;
}

function isAuthenticated(req: VercelRequest): boolean {
  const secret = process.env.AUTH_SECRET?.trim();
  const token = getSessionToken(req);
  if (!secret || secret.length < 32 || !token) return false;

  try {
    jwt.verify(token, secret, { issuer: "oligens-detector" });
    return true;
  } catch {
    return false;
  }
}

function fallbackHumanize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Hardened Vercel entry point for POST /api/humanize.
 *
 * IMPORTANT: the humanizer engine is loaded dynamically. A failure while
 * importing any optional/legacy engine must never prevent this endpoint from
 * responding. The endpoint therefore has an HTTP-200 safety fallback.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Méthode non autorisée.",
      code: "METHOD_NOT_ALLOWED",
    });
  }

  if (!isAuthenticated(req)) {
    return res.status(401).json({
      success: false,
      error: "Connexion requise.",
      code: "AUTH_REQUIRED",
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (text.length < 20) {
    return res.status(400).json({
      success: false,
      error: "Le texte à humaniser est trop court.",
      code: "TEXT_TOO_SHORT",
    });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(413).json({
      success: false,
      error: "Le texte dépasse 100 000 caractères.",
      code: "TEXT_TOO_LARGE",
    });
  }

  const started = Date.now();

  try {
    const module = await import("../src/server/api/humanize");
    return await module.default(req, res);
  } catch (error) {
    console.error("[humanize] isolated engine failure; using safe fallback", error);

    const safeText = fallbackHumanize(text);
    return res.status(200).json({
      success: true,
      status: "degraded",
      text: safeText,
      texteFinal: safeText,
      originalText: text,
      original_text: text,
      humanizedText: safeText,
      humanized_text: safeText,
      provider: "local-safe-fallback",
      engine_used: "safe_fallback",
      fallback_engine: true,
      analysis_mode: "vercel_safe_fallback",
      offline_engine: true,
      external_dependency: false,
      processing_time_ms: Date.now() - started,
      warning: "Le moteur avancé est temporairement indisponible. Le traitement sécurisé a été appliqué.",
      error_code: error instanceof Error ? error.name : "HUMANIZER_ENGINE_ERROR",
    });
  }
}
