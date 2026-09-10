import { countWords, type FullAnalysisResult, type RunOptions } from "./heuristicEngine";
import { runAnalysisPipeline } from "./analysisPipeline";

export const WORKER_THRESHOLD_WORDS = 10_000;
let worker: Worker | null = null;
let workerFailed = false;

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL("./heuristicWorker.ts", import.meta.url), { type: "module" });
  return worker;
}

function analyzeInWorker(text: string, timeoutMs = 180_000): Promise<FullAnalysisResult> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try { w = getWorker(); } catch (err) { reject(err instanceof Error ? err : new Error(String(err))); return; }
    const id = Date.now() + Math.random();
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("Délai d'analyse dépassé.")); }, timeoutMs);
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { id: number; ok: boolean; result?: FullAnalysisResult; error?: string };
      if (!data || data.id !== id) return;
      cleanup();
      if (data.ok && data.result) resolve(data.result); else reject(new Error(data.error ?? "Erreur du traitement de l'analyse."));
    };
    const onError = (e: ErrorEvent) => { cleanup(); reject(new Error(e.message || "Le traitement de l'analyse a rencontré un problème.")); };
    function cleanup() { window.clearTimeout(timer); w.removeEventListener("message", onMessage); w.removeEventListener("error", onError); }
    w.addEventListener("message", onMessage); w.addEventListener("error", onError); w.postMessage({ id, text });
  });
}

const yieldToUi = () => new Promise<void>((resolve) => requestAnimationFrame(() => window.setTimeout(resolve, 40)));

export async function analyzeText(text: string, options?: RunOptions): Promise<FullAnalysisResult> {
  const clean = text.trim();
  if (!clean) throw new Error("Aucun texte à analyser.");
  const words = countWords(clean);
  const t0 = performance.now();

  if (words > WORKER_THRESHOLD_WORDS && !workerFailed) {
    try {
      const result = await analyzeInWorker(clean);
      result.processing = { mode: "worker", durationMs: Math.round(performance.now() - t0), words };
      return result;
    } catch {
      workerFailed = true;
    }
  }

  await yieldToUi();
  // Même pipeline en direct et dans le worker. L'option est appliquée ici sans
  // réexécuter une seconde analyse après le retour du worker.
  const base = await runAnalysisPipeline(clean);
  base.processing = { mode: "direct", durationMs: Math.round(performance.now() - t0), words };
  return base;
}
