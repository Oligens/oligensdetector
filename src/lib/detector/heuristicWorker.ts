// Web Worker dédié — pipeline OLIGENS (documents > 10 000 mots).
import { runAnalysisPipeline, type AnalysisPipelineResult } from "./analysisPipeline";
import type { RunOptions } from "./heuristicEngine";

interface WorkerRequest {
  id: number;
  text: string;
  options?: RunOptions;
}

type WorkerResult = AnalysisPipelineResult;

const scope = self as unknown as {
  postMessage: (msg: { id: number; ok: boolean; result?: WorkerResult; error?: string }) => void;
  addEventListener: (type: "message", cb: (e: MessageEvent<WorkerRequest>) => void) => void;
};

scope.addEventListener("message", (event) => {
  const { id, text, options } = event.data;
  Promise.resolve()
    .then(() => runAnalysisPipeline(text, options))
    .then((analysis) => {
      analysis.processing.mode = "worker";
      scope.postMessage({ id, ok: true, result: analysis });
    })
    .catch((err) => {
      scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    });
});
