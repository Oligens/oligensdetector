import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";

const COOKIE = "oligens_session";
const MAX_TEXT_LENGTH = 100_000;

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bil est important de noter que\b/gi, "on peut retenir que"],
  [/\bil est important de noter\b/gi, "on peut retenir"],
  [/\ben outre\b/gi, "de plus"],
  [/\bpar conséquent\b/gi, "ainsi"],
  [/\ben résumé\b/gi, "pour résumer"],
  [/\bil convient de souligner\b/gi, "on peut souligner"],
  [/\bdans le paysage actuel\b/gi, "aujourd'hui"],
  [/\bde surcroît\b/gi, "en plus"],
  [/\bainsi donc\b/gi, "donc"],
  [/\bcependant\b/gi, "mais"],
  [/\bnéanmoins\b/gi, "malgré tout"],
];

function sessionToken(req: VercelRequest): string | null {
  const part = (req.headers.cookie ?? "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE}=`));
  return part ? part.slice(COOKIE.length + 1) : null;
}

function isAuthenticated(req: VercelRequest): boolean {
  const secret = process.env.AUTH_SECRET?.trim();
  const token = sessionToken(req);
  if (!secret || secret.length < 32 || !token) return false;
  try {
    jwt.verify(token, secret, { issuer: "oligens-detector" });
    return true;
  } catch {
    return false;
  }
}

function normalize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;!?…])/g, "$1")
    .replace(/([.!?…])\s*([.!?…])+/g, "$1")
    .trim();
}

function humanizeLocal(text: string, intensity: number): string {
  let result = text;

  for (const [pattern, replacement] of REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  const sentences = result
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (intensity >= 0.75 && sentences.length >= 4) {
    for (let i = 3; i < sentences.length; i += 4) {
      const sentence = sentences[i];
      if (!sentence || /^(et|mais|or|donc)\b/i.test(sentence)) continue;
      const first = sentence.charAt(0).toLowerCase();
      sentences[i] = first ? `De fait, ${first}${sentence.slice(1)}` : sentence;
    }
    result = sentences.join(" ");
  }

  return normalize(result);
}

function clampIntensity(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0.65;
  return Math.max(0, Math.min(1, parsed));
}

/**
 * Vercel-safe /api/humanize.
 *
 * This route is deliberately self-contained:
 * - no Python subprocess
 * - no DeepSeek/Gemini
 * - no import of the legacy humanizer engine
 * - no dynamic engine import
 * - only Vercel's request/response types and JWT authentication
 *
 * Therefore an initialization failure in the old humanizer cannot take down
 * this endpoint before its try/catch is reached.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Oligens-Humanizer", "local-ts-v3");

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

  try {
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};
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
    const intensity = clampIntensity(body.intensity);
    const humanized = humanizeLocal(text, intensity);

    return res.status(200).json({
      success: true,
      status: "success",
      text: humanized,
      texteFinal: humanized,
      originalText: text,
      original_text: text,
      humanizedText: humanized,
      humanized_text: humanized,
      provider: "local",
      engine_used: "COJ_Local_TS_Humanizer",
      engine_name: "COJ Local TypeScript Humanizer",
      engine_version: "3.0.0",
      analysis_mode: "local_zero_dependency",
      offline_engine: true,
      python_subprocess: false,
      external_dependency: false,
      fallback_engine: false,
      processing_time_ms: Date.now() - started,
      metrics: {
        original_length: text.length,
        humanized_length: humanized.length,
        changed: humanized !== text,
        intensity,
      },
    });
  } catch (error) {
    console.error("[humanize] local route recovery", error);

    const body =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};
    const text = typeof body.text === "string" ? body.text.trim() : "";

    return res.status(200).json({
      success: true,
      status: "degraded",
      text,
      texteFinal: text,
      originalText: text,
      original_text: text,
      humanizedText: text,
      humanized_text: text,
      provider: "local-safe-recovery",
      engine_used: "COJ_Safe_Recovery",
      engine_version: "3.0.0",
      analysis_mode: "safe_recovery",
      offline_engine: true,
      fallback_engine: true,
      error_recovered: true,
      processing_time_ms: 0,
    });
  }
}
