import { analyzeText } from "../detector/analysisRunner";
import { humanizeText } from "./humanizerRunner";
import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

export const GEMINI_CONFIG = { endpoint: "/api/humanize", model: "gemini-2.5-flash", timeoutMs: 60_000 } as const;
export const DEEPSEEK_CONFIG = { endpoint: "/api/humanize", model: "deepseek-chat", timeoutMs: 60_000 } as const;
/** @deprecated UI compatibility only. */
export const QWEN_CONFIG = { apiKey: "", model: DEEPSEEK_CONFIG.model, baseUrl: DEEPSEEK_CONFIG.endpoint, workspaceId: "server-managed" } as const;
export const HYBRID_API_TIMEOUT_MS = 60_000;
export type HybridFlow = "deepseek" | "gemini" | "local";

export interface HybridCallbacks {
  onPhase?: (label: string) => void;
  onApiDelta?: (accumulated: string) => void;
  onFallback?: (reason: string) => void;
  onLocalProgress?: (p: HumanizerProgress) => void;
  onFlowResolved?: (flow: HybridFlow) => void;
}
export interface HybridOutcome { flow: HybridFlow; text: string; report: HumanizerReport; apiDurationMs?: number; fallbackReason?: string; }

async function detectCanonical(text: string): Promise<{ probability: number; factors: Array<{ nom: string; z_score: number; contribution: number }> }> {
  const response = await fetch("/api/detect", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language: "auto" }),
  });
  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok || !data.analysis) {
    throw new Error(typeof data.error === "string" ? data.error : `Détection indisponible (${response.status}).`);
  }
  const analysis = data.analysis as { probabilite_IA: number; rapport_detaille?: Array<{ nom: string; z_score: number; contribution: number }> };
  return { probability: Number(analysis.probabilite_IA) || 0, factors: analysis.rapport_detaille ?? [] };
}

async function runLocalFallback(
  original: string,
  config: Partial<HumanizerConfig>,
  cb: HybridCallbacks,
  reason: string,
  beforeProbability = 0,
): Promise<HybridOutcome> {
  cb.onFallback?.(reason);
  cb.onFlowResolved?.("local");
  cb.onPhase?.("2/3 — Réécriture locale TypeScript…");

  let initial = beforeProbability;
  if (!initial) {
    try {
      initial = Number((await analyzeText(original, { language: "auto" })).probabilite_IA) || 0;
    } catch {
      initial = 0;
    }
  }

  const outcome = await humanizeText(original, config, cb.onLocalProgress);
  const report: HumanizerReport = {
    ...outcome.rapport,
    proba_initiale: initial,
    reduction_pourcent: (initial - outcome.rapport.proba_finale) * 100,
    viaApi: false,
    model: "COJ_Local_TS_Humanizer",
    decision: `Détection → moteur local TypeScript → contrôle local terminés. ${outcome.rapport.decision}`,
  };

  cb.onPhase?.("3/3 — Contrôle local du texte réécrit…");
  cb.onApiDelta?.(outcome.texteFinal);
  return { flow: "local", text: outcome.texteFinal, report, fallbackReason: reason };
}

export async function humanizeHybrid(text: string, config: Partial<HumanizerConfig>, cb: HybridCallbacks = {}): Promise<HybridOutcome> {
  const original = text.trim();
  if (!original) throw new Error("Aucun texte à humaniser.");

  const startedAt = performance.now();
  let beforeProbability = 0;

  cb.onPhase?.("1/3 — Détection canonique du texte source…");
  try {
    beforeProbability = (await detectCanonical(original)).probability;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Détection serveur indisponible.";
    return runLocalFallback(original, config, cb, `API indisponible : ${reason}`);
  }

  cb.onPhase?.("2/3 — Réécriture via /api/humanize…");
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), HYBRID_API_TIMEOUT_MS);

  try {
    const response = await fetch("/api/humanize", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        text: original,
        language: config.langue === "fr" || config.langue === "en" ? config.langue : undefined,
        mode: config.modeAggressif ? "ultra" : "standard",
        intensity: config.intensite ?? 0.78,
      }),
    });
    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok || typeof data.text !== "string" || !data.text.trim()) {
      throw new Error(typeof data.error === "string" ? data.error : `Service d'humanisation indisponible (${response.status}).`);
    }

    const output = data.text.trim();
    if (output === original) throw new Error("Le moteur n'a pas transformé le texte source.");

    const flow: HybridFlow = data.provider === "deepseek" ? "deepseek" : data.provider === "local" ? "local" : "gemini";
    cb.onPhase?.("3/3 — Contrôle canonique du texte réécrit…");
    const after = await detectCanonical(output);
    const report: HumanizerReport = {
      proba_initiale: beforeProbability,
      proba_finale: after.probability,
      reduction_pourcent: (beforeProbability - after.probability) * 100,
      iterations_realisees: 1,
      historique: [],
      features_finales: after.factors,
      viaApi: flow !== "local",
      model: typeof data.model === "string" ? data.model : flow === "local" ? "COJ_Local_TS_Humanizer" : flow === "deepseek" ? "deepseek-chat" : "gemini-2.5-flash",
      decision: `Détection canonique → réécriture ${flow === "local" ? "moteur local TypeScript" : flow === "deepseek" ? "DeepSeek" : "Gemini"} → détection canonique terminées.`,
      warning: "Le moteur améliore la qualité stylistique et ne garantit pas un score de détection nul.",
      config: { seuilCible: config.seuilCible ?? 0.12, intensite: config.intensite ?? 0.78, iterationsMax: config.iterationsMax ?? 6, modeAggressif: Boolean(config.modeAggressif), langue: config.langue ?? "mixte" },
    };
    cb.onFlowResolved?.(flow);
    cb.onApiDelta?.(output);
    return { flow, text: output, report, apiDurationMs: Math.round(performance.now() - startedAt), fallbackReason: typeof data.fallbackFrom === "string" ? data.fallbackFrom : undefined };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError"
      ? `Timeout après ${HYBRID_API_TIMEOUT_MS / 1000} s.`
      : error instanceof Error ? error.message : "Service d'humanisation indisponible.";
    return runLocalFallback(original, config, cb, `Bascule locale : ${reason}`, beforeProbability);
  } finally {
    window.clearTimeout(timer);
  }
}
