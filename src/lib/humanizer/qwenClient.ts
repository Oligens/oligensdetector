import { humanizeText } from "./humanizerRunner";
import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

// Compatibility layer: the active implementation is local. "api" remains
// part of the flow type so older UI state/callback code stays type-safe.
export const QWEN_CONFIG = {
  baseUrl: "",
  apiKey: "",
  workspaceId: "",
  model: "Oligens Natural Engine",
  timeoutMs: 0,
} as const;

export const QWEN_SYSTEM_PROMPT = "";
export const HYBRID_API_TIMEOUT_MS = 0;
export type HybridFlow = "local" | "api";

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
  const startedAt = performance.now();
  cb.onPhase?.("Moteur Oligens Natural Engine — analyse stylistique…");
  cb.onFlowResolved?.("local");

  const local = await humanizeText(
    text,
    { ...config, langue: config.langue ?? "mixte" },
    (progress) => {
      cb.onPhase?.(progress.phase);
      cb.onLocalProgress?.(progress);
    }
  );

  const report: HumanizerReport = {
    ...local.rapport,
    viaApi: false,
    model: "Oligens Natural Engine",
  };

  cb.onApiDelta?.(local.texteFinal);
  return {
    flow: "local",
    text: local.texteFinal,
    report,
    apiDurationMs: Math.round(performance.now() - startedAt),
  };
}
