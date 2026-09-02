import {
  enhancedHumanizer,
  type HumanizeOutcome,
} from "./humanizerEnhanced";
import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

export type { HumanizeOutcome, HumanizerConfig, HumanizerProgress, HumanizerReport };

const WORKER_HANDSHAKE_MS = 1500;
const FIRST_MESSAGE_MS = 3500;

let worker: Worker | null = null;
let workerFailed = false;
let handshakeStarted = false;

function createWorker(): Worker {
  return new Worker(new URL("./humanizerWorker.ts", import.meta.url), { type: "module" });
}
function getWorker(): Worker {
  if (!worker) worker = createWorker();
  return worker;
}

export function warmUpHumanizer(): void {
  if (workerFailed || handshakeStarted) return;
  handshakeStarted = true;
  try {
    const w = getWorker();
    const timer = window.setTimeout(() => { workerFailed = true; }, WORKER_HANDSHAKE_MS);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "pong") {
        window.clearTimeout(timer);
        w.removeEventListener("message", onMsg);
      }
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", () => { workerFailed = true; window.clearTimeout(timer); }, { once: true });
    w.postMessage({ type: "ping" });
  } catch {
    workerFailed = true;
  }
}

const rafYield = (): Promise<void> => new Promise((resolve) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
  else window.setTimeout(resolve, 16);
});
const chunkedYield = async (): Promise<void> => {
  await rafYield();
  await new Promise((resolve) => window.setTimeout(resolve, 10));
};
const tag = (o: HumanizeOutcome, mode: "worker" | "direct"): HumanizeOutcome => ({
  texteFinal: o.texteFinal,
  rapport: { ...o.rapport, engineMode: mode },
});

function runChunkedOnMainThread(text: string, config: Partial<HumanizerConfig> | undefined, onProgress: ((p: HumanizerProgress) => void) | undefined): Promise<HumanizeOutcome> {
  return enhancedHumanizer.humanize(text, config, onProgress).then((o) => tag(o, "direct"));
}

export function humanizeText(text: string, config?: Partial<HumanizerConfig>, onProgress?: (p: HumanizerProgress) => void): Promise<HumanizeOutcome> {
  if (workerFailed) return runChunkedOnMainThread(text, config, onProgress);

  return new Promise((resolve) => {
    let w: Worker;
    try { w = getWorker(); }
    catch {
      workerFailed = true;
      resolve(runChunkedOnMainThread(text, config, onProgress));
      return;
    }

    const id = Date.now() + Math.random();
    let gotFirstMessage = false;
    let fallbackTriggered = false;

    const fallbackToChunked = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      cleanup();
      workerFailed = true;
      onProgress?.({ iteration: 1, total: config?.iterationsMax ?? 5, proba: 0.5, phase: "Worker indisponible — exécution locale", anomalies: [] });
      runChunkedOnMainThread(text, config, onProgress).then(resolve);
    };

    const hardTimer = window.setTimeout(fallbackToChunked, 600_000);
    const stallTimer = window.setTimeout(fallbackToChunked, FIRST_MESSAGE_MS);

    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; id?: number; progress?: HumanizerProgress; texteFinal?: string; rapport?: HumanizeOutcome["rapport"] } | null;
      if (!d || d.type === "pong" || d.id !== id) return;
      if (!gotFirstMessage) {
        gotFirstMessage = true;
        window.clearTimeout(stallTimer);
      }
      if (d.type === "progress") {
        if (d.progress) onProgress?.(d.progress);
        return;
      }
      if (d.type === "done" && d.texteFinal && d.rapport) {
        cleanup();
        resolve(tag({ texteFinal: d.texteFinal, rapport: d.rapport }, "worker"));
      } else if (d.type === "error") fallbackToChunked();
    };
    const onError = () => fallbackToChunked();
    function cleanup() {
      window.clearTimeout(hardTimer);
      window.clearTimeout(stallTimer);
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    }
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, text, config });
  });
}
