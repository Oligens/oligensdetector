import { analyzeText } from "../detector/analysisRunner";
import { humanizeText } from "./humanizerRunner";
import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

// Kept for UI/backward compatibility. The humanizer no longer depends on a
// remote provider or an embedded credential: the enhanced local engine is
// now the primary and deterministic path.
export const QWEN_CONFIG = {
  baseUrl: "",
  apiKey: "",
  workspaceId: "",
  model: "Oligens Natural Engine",
  timeoutMs: 0,
} as const;

export const QWEN_SYSTEM_PROMPT = "";
export const HYBRID_API_TIMEOUT_MS = 0;
export type HybridFlow = "local";

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

export async function humanizeHybrid(
  text: string,
  config: Partial<HumanizerConfig>,
  cb: HybridCallbacks = {}
): Promise<HybridOutcome> {
  cb.onPhase?.("Moteur Oligens Natural Engine — analyse stylistique…");
  const initial = await analyzeText(text);
  cb.onPhase?.("Optimisation naturelle — structures, connecteurs et rythme…");
  cb.onFlowResolved?.("local");

  const local = await humanizeText(
    text,
    { ...config, langue: config.langue ?? "mixte" },
    (progress) => cb.onLocalProgress?.(progress)
  );

  const initialProbability = initial.probabilite_IA;
  const finalProbability = local.rapport.proba_finale;
  const report: HumanizerReport = {
    ...local.rapport,
    proba_initiale: initialProbability,
    proba_finale: finalProbability,
    viaApi: false,
    model: "Oligens Natural Engine",
  };

  cb.onApiDelta?.(local.texteFinal);
  return { flow: "local", text: local.texteFinal, report };
}
