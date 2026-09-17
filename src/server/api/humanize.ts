import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
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
    const startedAt = Date.now();
    const config = { seuilCible: 0.05, iterationsMax: 12, intensite: Number(body.intensity ?? 0.95), langue: body.language === "en" ? "en" : body.language === "fr" ? "fr" : "mixte", modeAggressif: false } as const;

    try {
        const local = await humanizerEngine.humanizeUltimateStream(text, config);
        const result: Record<string, unknown> = { success: true, ...local, text: local.texteFinal, provider: "local", engine_used: "local", fallback_engine: false, analysis_mode: "local_first", offline_engine: true, processing_time_ms: Date.now() - startedAt };
        if (!cloudFallbackEnabled(body)) return res.status(200).json(result);

        const cloudErrors: string[] = [];
        if (deepSeekConfiguration().configured) {
            try { const cloud = await humanizeWithDeepSeek(text, { language: config.langue === "mixte" ? undefined : config.langue, mode: "standard" }); return res.status(200).json({ success: true, ...cloud, provider: "deepseek", engine_used: "cloud_deepseek", fallback_engine: false, local_first: true, local_preview: local.rapport, processing_time_ms: Date.now() - startedAt }); }
            catch (error) { cloudErrors.push(error instanceof Error ? error.message : "DeepSeek indisponible."); }
        }
        if (geminiConfiguration().configured) {
            try { const cloud = await humanizeWithGemini(text, { language: config.langue === "mixte" ? undefined : config.langue, mode: "standard" }); return res.status(200).json({ success: true, ...cloud, provider: "gemini", engine_used: "cloud_gemini", fallback_engine: false, local_first: true, local_preview: local.rapport, processing_time_ms: Date.now() - startedAt }); }
            catch (error) { cloudErrors.push(error instanceof Error ? error.message : "Gemini indisponible."); }
        }
        return res.status(200).json({ ...result, fallback_reason: cloudErrors.length ? cloudErrors.join(" | ") : "Aucun fournisseur cloud configuré." });
    } catch (error) {
        console.error("[humanize] local engine error", error);
        return res.status(200).json({ success: true, text, original_text: text, humanized_text: text, provider: "local", engine_used: "local_identity_fallback", fallback_engine: true, analysis_mode: "local_fallback", offline_engine: true, error_message: error instanceof Error ? error.message : "Moteur local indisponible.", processing_time_ms: Date.now() - startedAt });
    }
}