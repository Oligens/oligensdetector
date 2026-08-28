// Web Worker dédié — moteur heuristique OLIGENS (documents > 10 000 mots).
import { runFullAnalysis, type FullAnalysisResult, type RunOptions } from "./heuristicEngine";

interface WorkerRequest {
  id: number;
  text: string;
  options?: RunOptions;
}

const scope = self as unknown as {
  postMessage: (msg: { id: number; ok: boolean; result?: FullAnalysisResult; error?: string }) => void;
  addEventListener: (type: "message", cb: (e: MessageEvent<WorkerRequest>) => void) => void;
};

scope.addEventListener("message", (event) => {
  const { id, text, options } = event.data;
  try {
    const result = runFullAnalysis(text, options);
    result.processing.mode = "worker";
    scope.postMessage({ id, ok: true, result });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
