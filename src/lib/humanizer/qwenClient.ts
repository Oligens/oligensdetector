import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

// Historical filename retained for UI compatibility. All transformations are now
// executed server-side by /api/humanize (Gemini first, Qwen fallback).
export const GEMINI_CONFIG = { endpoint: "/api/humanize", model: "gemini-2.5-flash", timeoutMs: 60_000 } as const;
export const QWEN_CONFIG = { endpoint: "/api/humanize", model: "qwen-plus", timeoutMs: 60_000 } as const;
export const QWEN_SYSTEM_PROMPT = "server-side";
export const HYBRID_API_TIMEOUT_MS = 60_000;
export type HybridFlow = "gemini" | "qwen";

export interface HybridCallbacks {
  onPhase?: (label: string) => void;
  onApiDelta?: (accumulated: string) => void;
  onFallback?: (reason: string) => void;
  onLocalProgress?: (p: HumanizerProgress) => void;
  onFlowResolved?: (flow: HybridFlow) => void;
}
export interface HybridOutcome { flow: HybridFlow; text: string; report: HumanizerReport; apiDurationMs?: number; fallbackReason?: string; }

export async function humanizeHybrid(text: string, config: Partial<HumanizerConfig>, cb: HybridCallbacks = {}): Promise<HybridOutcome> {
  const original = text.trim();
  if (!original) throw new Error("Aucun texte à humaniser.");
  const startedAt = performance.now();
  cb.onPhase?.("Service distant — réécriture stylistique…");

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), HYBRID_API_TIMEOUT_MS);
  try {
    const response = await fetch("/api/humanize", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ text: original, language: config.langue === "fr" || config.langue === "en" ? config.langue : undefined, mode: config.modeAggressif ? "ultra" : "standard" }),
    });
    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok || typeof data.text !== "string" || !data.text.trim()) throw new Error(typeof data.error === "string" ? data.error : `Service d'humanisation indisponible (${response.status}).`);
    const output = data.text.trim();
    if (output === original) throw new Error("Le fournisseur n'a pas transformé le texte source.");
    const flow: HybridFlow = data.provider === "qwen" ? "qwen" : "gemini";
    const report: HumanizerReport = {
      proba_initiale: 0,
      proba_finale: 0,
      reduction_pourcent: 0,
      iterations_realisees: 1,
      historique: [],
      features_finales: [],
      viaApi: true,
      model: typeof data.model === "string" ? data.model : flow === "qwen" ? "qwen-plus" : "gemini-2.5-flash",
      decision: `Réécriture ${flow === "qwen" ? "Qwen" : "Gemini"} terminée. Le score Avant/Après est calculé exclusivement par /api/detect.`,
      warning: "Le moteur de réécriture améliore la qualité stylistique ; aucun résultat ne garantit un score de détection nul.",
      config: { seuilCible: config.seuilCible ?? 0.12, intensite: config.intensite ?? 0.78, iterationsMax: config.iterationsMax ?? 6, modeAggressif: Boolean(config.modeAggressif), langue: config.langue ?? "mixte" },
    };
    cb.onFlowResolved?.(flow);
    cb.onApiDelta?.(output);
    return { flow, text: output, report, apiDurationMs: Math.round(performance.now() - startedAt), fallbackReason: typeof data.fallbackFrom === "string" ? data.fallbackFrom : undefined };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Service d'humanisation indisponible.";
    cb.onFallback?.(reason);
    throw new Error(reason);
  } finally { window.clearTimeout(timer); }
}
