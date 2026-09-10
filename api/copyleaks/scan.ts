import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { copyleaksConfiguration, scanTextWithCopyleaks } from "../../src/lib/detector/copyleaksService";

const COOKIE = "oligens_session";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée.", code: "METHOD_NOT_ALLOWED" });
  try {
    if (!authUserId(req)) return res.status(401).json({ error: "Connexion requise.", code: "AUTH_REQUIRED" });
    const config = copyleaksConfiguration();
    if (!config.configured) return res.status(503).json({ error: "Copyleaks n'est pas configuré sur cet environnement.", code: "COPYLEAKS_NOT_CONFIGURED", environment: config.environment, keySource: config.keySource });

    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text : "";
    if (text.trim().length < 255) return res.status(400).json({ error: "Le texte doit contenir au moins 255 caractères pour la vérification Copyleaks.", code: "TEXT_TOO_SHORT", minCharacters: 255 });
    if (text.trim().length > 100_000) return res.status(413).json({ error: "Le texte dépasse 100 000 caractères.", code: "TEXT_TOO_LARGE", maxCharacters: 100_000 });

    const scanId = typeof body.scanId === "string" && body.scanId.trim() ? body.scanId : `oligens-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const language = typeof body.language === "string" && body.language.trim() ? body.language.trim().slice(0, 2) : undefined;
    const result = await scanTextWithCopyleaks(text, scanId, { language, explain: true, sensitivity: 2 });
    return res.status(200).json({ success: true, result, configuration: { environment: config.environment, sandbox: config.sandbox, keySource: config.keySource } });
  } catch (error) {
    console.error("[copyleaks/scan] error", error);
    const message = error instanceof Error ? error.message : "Échec de la vérification Copyleaks.";
    if (message.includes("AUTH_SECRET")) return res.status(503).json({ error: "Authentification serveur non configurée.", code: "AUTH_SECRET_NOT_CONFIGURED" });
    if (/429/.test(message)) return res.status(429).json({ error: "Limite Copyleaks atteinte. Réessayez plus tard.", code: "COPYLEAKS_RATE_LIMIT" });
    return res.status(502).json({ error: message, code: "COPYLEAKS_SCAN_ERROR" });
  }
}
