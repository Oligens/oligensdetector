// ============================================================
// Orchestrateur asynchrone du moteur heuristique OLIGENS
// ≤ 10 000 mots → direct (yield UI) · > 10 000 mots → Web Worker
// ============================================================
import {
  countWords,
  runFullAnalysis,
  type FullAnalysisResult,
  type RunOptions,
} from "./heuristicEngine";
import { computeStructuralSignals } from "./structuralSignals";

export const WORKER_THRESHOLD_WORDS = 10_000;

let worker: Worker | null = null;
let workerFailed = false;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./heuristicWorker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

function reinforceResult(result: FullAnalysisResult, sourceText: string): FullAnalysisResult {
  const wordCount = countWords(sourceText);
  if (wordCount < 100) return result;

  const structural = computeStructuralSignals(sourceText);
  if (structural.signals.length === 0) return result;

  // Secondary evidence only: the existing calibrated 18-feature model keeps
  // most of the decision weight. Structural rules add a bounded 18% signal.
  const fused = Math.max(0, Math.min(1, result.probabilite_IA * 0.82 + structural.score * 0.18));
  const delta = fused - result.probabilite_IA;
  const structuralContribs = structural.signals
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((signal) => ({
      nom: `Structure · ${signal.name}`,
      z_score: Math.max(-4, Math.min(4, signal.contribution * 4)),
      contribution: signal.contribution * 0.18,
    }));

  const merged = [...result.rapport_detaille, ...structuralContribs]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  const uncertainty = 0.12 * (1 + (1 - Math.abs(fused - 0.5) * 2));
  const confidence = Math.min(1, wordCount / 1500);
  const decision = fused > 0.85
    ? "Présence forte d'indices compatibles avec une génération IA, corroborée par des signaux structurels."
    : fused > 0.6
      ? "Indices modérés ; les signaux stylométriques et structurels doivent être interprétés ensemble."
      : "Aucun faisceau significatif d'indices IA détecté ; les signaux structurels restent secondaires.";

  return {
    ...result,
    probabilite_IA: fused,
    intervalle_confiance_95: [Math.max(0, fused - uncertainty), Math.min(1, fused + uncertainty)],
    confiance_analyse: confidence < 0.3 ? "Faible" : confidence < 0.65 ? "Moyenne" : "Élevée",
    rapport_detaille: merged,
    decision_precaution: decision,
  };
}

function analyzeInWorker(
  text: string,
  options: RunOptions | undefined,
  timeoutMs = 180_000
): Promise<FullAnalysisResult> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = getWorker();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const id = Date.now() + Math.random();
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Délai d'analyse dépassé dans le Web Worker."));
    }, timeoutMs);
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { id: number; ok: boolean; result?: FullAnalysisResult; error?: string };
      if (!data || data.id !== id) return;
      cleanup();
      if (data.ok && data.result) resolve(data.result);
      else reject(new Error(data.error ?? "Erreur inconnue du Web Worker d'analyse."));
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(e.message || "Crash du Web Worker d'analyse."));
    };
    function cleanup() {
      window.clearTimeout(timer);
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    }
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, text, options });
  });
}

const yieldToUi = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => window.setTimeout(resolve, 40));
  });

export async function analyzeText(text: string, options?: RunOptions): Promise<FullAnalysisResult> {
  const words = countWords(text);
  const t0 = performance.now();

  if (words > WORKER_THRESHOLD_WORDS && !workerFailed) {
    try {
      const result = reinforceResult(await analyzeInWorker(text, options), text);
      result.processing = { mode: "worker", durationMs: Math.round(performance.now() - t0), words };
      return result;
    } catch {
      workerFailed = true;
    }
  }

  await yieldToUi();
  const result = reinforceResult(runFullAnalysis(text, options), text);
  result.processing = { mode: "direct", durationMs: Math.round(performance.now() - t0), words };
  return result;
}
