import { analyzeText } from "../detector/analysisRunner";
import { humanizeText } from "./humanizerRunner";
import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

// Compatibility layer kept under the historical qwenClient filename so no page
// import has to change. The remote provider is now Google Gemini, while Oligens
// remains the primary local rewrite engine and the automatic fallback.
export const GEMINI_CONFIG = {
  endpoint: "/api/humanize",
  model: "gemini-2.5-flash",
  timeoutMs: 20_000,
} as const;

export const QWEN_CONFIG = GEMINI_CONFIG;
export const QWEN_SYSTEM_PROMPT = "";
export const HYBRID_API_TIMEOUT_MS = GEMINI_CONFIG.timeoutMs;
export type HybridFlow = "gemini" | "local";

export interface HybridCallbacks {
  onPhase?: (label: string) => void;
  onApiDelta?: (accumulated: string) => void;
  onFallback?: (reason: string) => void;
  onLocalProgress?: (p: HumanizerProgress) => void;
  onFlowResolved?: (flow: HybridFlow) => void;
}

export interface HybridOutcome {
  flow: HybridFlow;
  text: string;
  report: HumanizerReport;
  apiDurationMs?: number;
  fallbackReason?: string;
}

async function callGemini(text: string, config: Partial<HumanizerConfig>, language: string | undefined, mode: "standard" | "ultra", startedAt: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), GEMINI_CONFIG.timeoutMs);
  try {
    const response = await fetch(GEMINI_CONFIG.endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language, mode }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.text !== "string" || !data.text.trim()) {
      throw new Error(typeof data.error === "string" ? data.error : `Gemini indisponible (${response.status}).`);
    }
    const candidate = data.text.trim();
    if (candidate === text.trim()) throw new Error("Gemini n'a pas produit de transformation exploitable.");
    const ratio = candidate.length / Math.max(1, text.length);
    if (ratio < 0.45 || ratio > 1.8) throw new Error("Gemini a produit une variation de longueur anormale.");
    return {
      text: candidate,
      model: typeof data.model === "string" ? data.model : GEMINI_CONFIG.model,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function humanizeHybrid(text: string, config: Partial<HumanizerConfig>, cb: HybridCallbacks = {}): Promise<HybridOutcome> {
  const startedAt = performance.now();
  cb.onPhase?.("Oligens Natural Engine — préparation de la réécriture…");
  cb.onFlowResolved?.("local");

  // Oligens stays the first pass: this keeps the proprietary engine useful even
  // when Gemini is unavailable and gives Gemini a controlled stylistic draft.
  const local = await humanizeText(
    text,
    { ...config, langue: config.langue ?? "mixte" },
    (progress) => {
      cb.onPhase?.(progress.phase);
      cb.onLocalProgress?.(progress);
    },
  );

  try {
    cb.onPhase?.("Gemini — amélioration rédactionnelle contrôlée…");
    const remote = await callGemini(
      local.texteFinal,
      config,
      config.langue === "fr" || config.langue === "en" ? config.langue : undefined,
      config.modeAggressif ? "ultra" : "standard",
      startedAt,
    );

    const verification = await analyzeText(remote.text, { language: "auto" });
    const report: HumanizerReport = {
      ...local.rapport,
      proba_finale: verification.probabilite_IA,
      reduction_pourcent: (local.rapport.proba_initiale - verification.probabilite_IA) * 100,
      viaApi: true,
      model: remote.model,
      decision: "Réécriture Gemini terminée puis contrôlée par le moteur Oligens.",
      warning: "Le résultat vise la qualité rédactionnelle et la conservation du sens ; aucun système ne peut garantir un score de détection nul.",
    };
    cb.onFlowResolved?.("gemini");
    cb.onApiDelta?.(remote.text);
    return { flow: "gemini", text: remote.text, report, apiDurationMs: remote.durationMs };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Gemini indisponible.";
    cb.onFallback?.(reason);
    cb.onFlowResolved?.("local");
    const report: HumanizerReport = {
      ...local.rapport,
      viaApi: false,
      model: "Oligens Natural Engine",
      decision: "Humanisation locale terminée ; Gemini n'a pas été utilisé.",
      warning: `${reason} Le moteur local Oligens a pris automatiquement le relais.`,
    };
    cb.onApiDelta?.(local.texteFinal);
    return {
      flow: "local",
      text: local.texteFinal,
      report,
      apiDurationMs: Math.round(performance.now() - startedAt),
      fallbackReason: reason,
    };
  }
}
