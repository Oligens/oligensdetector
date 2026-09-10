import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { copyleaksConfiguration } from "../src/lib/detector/copyleaksService";
import { humanizeWithGemini, geminiConfiguration } from "../src/lib/ai/geminiService";

const COOKIE = "oligens_session";

function authUserId(req: VercelRequest): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not configured.");
  const raw = (req.headers.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  try {
    const payload = jwt.verify(raw, secret, { issuer: "oligens-detector" }) as jwt.JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });

  try {
    if (!authUserId(req)) return res.status(401).json({ error: "Connexion requise.", code: "AUTH_REQUIRED" });
    const config = geminiConfiguration();
    if (!config.configured) return res.status(503).json({ error: "Gemini n'est pas configuré sur cet environnement.", code: "GEMINI_NOT_CONFIGURED", model: config.model });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "Le texte est vide.", code: "TEXT_EMPTY" });
    if (text.length > 100_000) return res.status(413).json({ error: "Le texte dépasse 100 000 caractères.", code: "TEXT_TOO_LARGE", maxCharacters: 100_000 });

    const language = typeof body.language === "string" ? body.language.slice(0, 2) : undefined;
    const mode = body.mode === "ultra" ? "ultra" : "standard";
    const result = await humanizeWithGemini(text, { language, mode });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("[humanize] Gemini error", error);
    const message = error instanceof Error ? error.message : "Erreur Gemini.";
    if (/AUTH_SECRET/.test(message)) return res.status(503).json({ error: "Authentification serveur non configurée.", code: "AUTH_SECRET_NOT_CONFIGURED" });
    if (/429/.test(message)) return res.status(429).json({ error: "Limite Gemini atteinte. Le moteur local Oligens peut continuer.", code: "GEMINI_RATE_LIMIT" });
    return res.status(502).json({ error: message, code: "GEMINI_API_ERROR" });
  }
}
