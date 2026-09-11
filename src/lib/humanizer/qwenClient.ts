import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

// Historical filename retained for UI compatibility. All transformations are server-side:
// /api/humanize -> DeepSeek, then Gemini fallback. Scores always come from /api/detect.
export const GEMINI_CONFIG = { endpoint: "/api/humanize", model: "gemini-2.5-flash", timeoutMs: 60_000 } as const;
export const DEEPSEEK_CONFIG = { endpoint: "/api/humanize", model: "deepseek-chat", timeoutMs: 60_000 } as const;
export const HYBRID_API_TIMEOUT_MS = 60_000;
export type HybridFlow = "deepseek" | "gemini";

export interface HybridCallbacks { onPhase?: (label: string) => void; onApiDelta?: (accumulated: string) => void; onFallback?: (reason: string) => void; onLocalProgress?: (p: HumanizerProgress) => void; onFlowResolved?: (flow: HybridFlow) => void; }
export interface HybridOutcome { flow: HybridFlow; text: string; report: HumanizerReport; apiDurationMs?: number; fallbackReason?: string; }

async function detectCanonical(text: string): Promise<{ probability: number; factors: Array<{ nom: string; z_score: number; contribution: number }> }> {
  const response = await fetch("/api/detect", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language: "auto" }) });
  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok || !data.analysis) throw new Error(typeof data.error === "string" ? data.error : `Détection indisponible (${response.status}).`);
  const analysis = data.analysis as { probabilite_IA: number; rapport_detaille?: Array<{ nom: string; z_score: number; contribution: number }> };
  return { probability: Number(analysis.probabilite_IA) || 0, factors: analysis.rapport_detaille ?? [] };
}

export async function humanizeHybrid(text: string, config: Partial<HumanizerConfig>, cb: HybridCallbacks = {}): Promise<HybridOutcome> {
  const original = text.trim();
  if (!original) throw new Error("Aucun texte à humaniser.");
  const startedAt = performance.now();
  cb.onPhase?.("1/3 — Détection canonique du texte source…");
  const before = await detectCanonical(original);
  cb.onPhase?.("2/3 — Réécriture DeepSeek avec fallback Gemini…");
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), HYBRID_API_TIMEOUT_MS);
  try {
    const response = await fetch("/api/humanize", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ text: original, language: config.langue === "fr" || config.langue === "en" ? config.langue : undefined, mode: config.modeAggressif ? "ultra" : "standard" }) });
    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok || typeof data.text !== "string" || !data.text.trim()) throw new Error(typeof data.error === "string" ? data.error : `Service d'humanisation indisponible (${response.status}).`);
    const output = data.text.trim();
    if (output === original) throw new Error("Le fournisseur n'a pas transformé le texte source.");
    const flow: HybridFlow = data.provider === "deepseek" ? "deepseek" : "gemini";
    cb.onPhase?.("3/3 — Contrôle canonique du texte réécrit…");
    const after = await detectCanonical(output);
    const report: HumanizerReport = { proba_initiale: before.probability, proba_finale: after.probability, reduction_pourcent: (before.probability - after.probability) * 100, iterations_realisees: 1, historique: [], features_finales: after.factors, viaApi: true, model: typeof data.model === "string" ? data.model : flow === "deepseek" ? "deepseek-chat" : "gemini-2.5-flash", decision: `Détection canonique → réécriture ${flow === "deepseek" ? "DeepSeek" : "Gemini"} → détection canonique terminées.`, warning: "Le moteur améliore la qualité stylistique et ne garantit pas un score de détection nul.", config: { seuilCible: config.seuilCible ?? 0.12, intensite: config.intensite ?? 0.78, iterationsMax: config.iterationsMax ?? 6, modeAggressif: Boolean(config.modeAggressif), langue: config.langue ?? "mixte" } };
    cb.onFlowResolved?.(flow);
    cb.onApiDelta?.(output);
    return { flow, text: output, report, apiDurationMs: Math.round(performance.now() - startedAt), fallbackReason: typeof data.fallbackFrom === "string" ? data.fallbackFrom : undefined };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Service d'humanisation indisponible.";
    cb.onFallback?.(reason);
    throw new Error(reason);
  } finally { window.clearTimeout(timer); }
}
