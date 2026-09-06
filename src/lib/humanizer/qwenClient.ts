import { humanizeText } from "./humanizerRunner";
import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

// Compatibility layer: the humanizer is fully local and no longer depends on
// a remote provider or an embedded credential.
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
  const startedAt = performance.now();
  cb.onPhase?.("Moteur Oligens Natural Engine — analyse stylistique…");
  cb.onFlowResolved?.("local");

  // humanizeText already performs the initial detector pass and carries the
  // initial probability in its report. Avoid running the detector twice.
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
