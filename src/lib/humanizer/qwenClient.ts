import { analyzeText } from "../detector/analysisRunner";
import { humanizeText } from "./humanizerRunner";
import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

// Compatibility layer kept under the historical qwenClient filename.
// The remote provider is Google Gemini; secrets remain server-side.
export const GEMINI_CONFIG = {
  endpoint: "/api/humanize",
  model: "gemini-2.5-flash",
  timeoutMs: 20_000,
} as const;

export const QWEN_CONFIG = {
  ...GEMINI_CONFIG,
  baseUrl: "",
  apiKey: "",
  workspaceId: "",
} as const;
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

function locallyDifferent(text: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bCependant\b/g, "Toutefois"],
    [/\bcependant\b/g, "toutefois"],
    [/\bNéanmoins\b/g, "Pourtant"],
    [/\bnéanmoins\b/g, "pourtant"],
    [/\bPar conséquent\b/g, "Ainsi"],
    [/\bpar conséquent\b/g, "ainsi"],
    [/\bEn définitive\b/g, "Au final"],
    [/\ben définitive\b/g, "au final"],
    [/\bDe plus\b/g, "Par ailleurs"],
    [/\bde plus\b/g, "par ailleurs"],
    [/\bEn effet\b/g, "Dans les faits"],
    [/\ben effet\b/g, "dans les faits"],
  ];
  let out = text;
  for (const [pattern, replacement] of replacements) {
    const next = out.replace(pattern, replacement);
    if (next !== out) return next;
  }

  const sentences = out.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map((s) => s.trim()) ?? [];
  if (sentences.length >= 3) {
    const middle = sentences.findIndex((s, i) => i > 0 && s.length > 90);
    if (middle > 0) {
      const s = sentences[middle];
      const comma = s.indexOf(", ");
      if (comma > 30 && comma < s.length - 30) {
        sentences[middle] = `${s.slice(0, comma)}. ${s.slice(comma + 2).replace(/^\p{Ll}/u, (c) => c.toUpperCase())}`;
        return sentences.join(" ");
      }
    }
  }
  return out;
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
    if (candidate === text.trim()) throw new Error("Gemini n'a produit aucune transformation.");
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
  const original = text.trim();
  if (!original) {
    const local = await humanizeText(text, config, cb.onLocalProgress);
    return { flow: "local", text: local.texteFinal, report: local.rapport };
  }

  // Gemini is now the first transformation pass. The previous implementation
  // ran the local engine first, which could return the source unchanged and hide
  // whether the remote humanizer was actually reached.
  try {
    cb.onPhase?.("Gemini — réécriture naturelle…");
    const remote = await callGemini(
      original,
      config,
      config.langue === "fr" || config.langue === "en" ? config.langue : undefined,
      config.modeAggressif ? "ultra" : "standard",
      startedAt,
    );

    const verification = await analyzeText(remote.text, { language: "auto" });
    const baseline = await analyzeText(original, { language: "auto" });
    const report: HumanizerReport = {
      proba_initiale: baseline.probabilite_IA,
      proba_finale: verification.probabilite_IA,
      reduction_pourcent: (baseline.probabilite_IA - verification.probabilite_IA) * 100,
      iterations_realisees: 1,
      historique: [],
      features_finales: verification.rapport_detaille,
      viaApi: true,
      model: remote.model,
      decision: "Réécriture Gemini terminée puis contrôlée par le moteur Oligens.",
      warning: "Le résultat vise la qualité rédactionnelle et la conservation du sens ; aucun système ne peut garantir un score de détection nul.",
      config: {
        seuilCible: config.seuilCible ?? 0.12,
        intensite: config.intensite ?? 0.78,
        iterationsMax: config.iterationsMax ?? 6,
        modeAggressif: Boolean(config.modeAggressif),
        langue: config.langue ?? "mixte",
      },
    };
    cb.onFlowResolved?.("gemini");
    cb.onApiDelta?.(remote.text);
    return { flow: "gemini", text: remote.text, report, apiDurationMs: remote.durationMs };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Gemini indisponible.";
    cb.onFallback?.(reason);
    cb.onPhase?.("Gemini indisponible — Oligens Natural Engine prend le relais…");

    // Fallback is deliberately local and never blocks the user. Run the
    // proprietary engine in aggressive mode so a successful fallback is not a
    // silent no-op on texts containing none of the basic replacement patterns.
    const local = await humanizeText(
      original,
      { ...config, modeAggressif: true },
      cb.onLocalProgress,
    );
    let finalText = local.texteFinal.trim();
    if (!finalText || finalText === original) finalText = locallyDifferent(original);

    const report: HumanizerReport = {
      ...local.rapport,
      viaApi: false,
      model: "Oligens Natural Engine",
      decision: finalText !== original
        ? "Humanisation locale terminée ; Gemini n'a pas pu être utilisé et Oligens a appliqué une transformation stylistique."
        : "Gemini indisponible et aucune transformation locale suffisamment sûre n'a été trouvée.",
      warning: `${reason} Le moteur local Oligens reste disponible comme solution de continuité.`,
    };
    cb.onFlowResolved?.("local");
    cb.onApiDelta?.(finalText);
    return {
      flow: "local",
      text: finalText,
      report,
      apiDurationMs: Math.round(performance.now() - startedAt),
      fallbackReason: reason,
    };
  }
}
