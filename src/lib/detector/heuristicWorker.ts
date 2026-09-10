// Web Worker dédié — pipeline OLIGENS (documents > 10 000 mots).
// Le worker exécute exactement le même pipeline que l'analyse directe afin d'éviter
// les divergences entre gros et petits documents.
import { runAnalysisPipeline, type AnalysisPipelineResult } from "./analysisPipeline";

interface WorkerRequest {
  id: number;
  text: string;
}

type WorkerResult = AnalysisPipelineResult;

const scope = self as unknown as {
  postMessage: (msg: { id: number; ok: boolean; result?: WorkerResult; error?: string }) => void;
  addEventListener: (type: "message", cb: (e: MessageEvent<WorkerRequest>) => void) => void;
};

scope.addEventListener("message", (event) => {
  const { id, text } = event.data;
  try {
    const result = runAnalysisPipeline(text);
    Promise.resolve(result).then((analysis) => {
      analysis.processing.mode = "worker";
      scope.postMessage({ id, ok: true, result: analysis });
    }).catch((err) => {
      scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
