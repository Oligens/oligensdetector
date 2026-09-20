import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { runPythonHumanizerPort } from "../../lib/engines/pythonPort/humanizerEngine";

const COOKIE = "oligens_session";

function authenticated(req: VercelRequest): boolean {
  const secret = process.env.AUTH_SECRET?.trim();
  const token = (req.headers.cookie ?? "").split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!secret || secret.length < 32 || !token) return false;
  try { jwt.verify(token, secret, { issuer: "oligens-detector" }); return true; } catch { return false; }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });
  if (!authenticated(req)) return res.status(401).json({ error: "Connexion requise.", code: "AUTH_REQUIRED" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 20) return res.status(400).json({ error: "Le texte à humaniser est trop court.", code: "TEXT_TOO_SHORT" });
  if (text.length > 100_000) return res.status(413).json({ error: "Le texte dépasse 100 000 caractères.", code: "TEXT_TOO_LARGE" });

  const started = Date.now();
  try {
    const result = runPythonHumanizerPort(text, {
      intensity: typeof body.intensity === "number" ? body.intensity : 0.65,
      warmth: typeof body.warmth === "number" ? body.warmth : 0.5,
      seed: typeof body.seed === "number" ? body.seed : undefined,
      maxIterations: typeof body.maxIterations === "number" ? body.maxIterations : 12,
    });

    return res.status(200).json({
      success: true,
      status: "success",
      ...result,
      text: result.humanized_text,
      texteFinal: result.humanized_text,
      originalText: result.original_text,
      humanizedText: result.humanized_text,
      provider: "local",
      analysis_mode: "python_port_typescript",
      offline_engine: true,
      python_subprocess: false,
      external_dependency: false,
      fallback_engine: false,
      processing_time_ms: Date.now() - started,
      trace: {
        external_dependency: false,
        python_subprocess: false,
        source_contract: "text_humanizer.py + text_humanizer_v2.py",
      },
    });
  } catch (error) {
    console.error("[humanize] COJ TypeScript humanizer error", error);
    return res.status(500).json({
      success: false,
      status: "error",
      code: "COJ_HUMANIZER_ERROR",
      error: "Le moteur COJ de humanisation n'a pas pu terminer l'opération.",
      processing_time_ms: Date.now() - started,
    });
  }
}
