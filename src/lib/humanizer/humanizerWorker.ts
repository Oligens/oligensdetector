import { enhancedHumanizer } from "./humanizerEnhanced";
import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

type WorkerRequest =
  | { type: "ping" }
  | { id: number; text: string; config?: Partial<HumanizerConfig> };
type WorkerResponse =
  | { type: "pong" }
  | { id: number; type: "progress"; progress: HumanizerProgress }
  | { id: number; type: "done"; texteFinal: string; rapport: HumanizerReport }
  | { id: number; type: "error"; error: string };

const scope = self as unknown as {
  postMessage: (msg: WorkerResponse) => void;
  addEventListener: (type: "message", cb: (e: MessageEvent<WorkerRequest>) => void) => void;
};

scope.addEventListener("message", (event) => {
  const data = event.data;
  if (data.type === "ping") {
    scope.postMessage({ type: "pong" });
    return;
  }

  if (!("id" in data) || typeof data.id !== "number" || typeof data.text !== "string") {
    return;
  }

  enhancedHumanizer
    .humanize(data.text, data.config, (progress) => scope.postMessage({ id: data.id, type: "progress", progress }))
    .then(({ texteFinal, rapport }) => scope.postMessage({ id: data.id, type: "done", texteFinal, rapport }))
    .catch((err: unknown) =>
      scope.postMessage({
        id: data.id,
        type: "error",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
});
