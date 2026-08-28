// ============================================================
// Runner du moteur local ULTIMATE :
// Web Worker dédié (validé par handshake ping/pong au warm-up) ou
// repli synchrone par lots (rAF + micro-pause 10 ms) sur le thread
// principal — l'UI reste fluide (> 30 FPS) dans les deux cas.
// ============================================================
import {
  humanizerEngine,
  type HumanizeOutcome,
  type HumanizerConfig,
  type HumanizerProgress,
} from "./humanizerUltimate";

export type { HumanizeOutcome, HumanizerConfig, HumanizerProgress };
export type { HumanizerReport } from "./humanizerUltimate";

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

/** Pré-chauffe + validation ping/pong du Worker au montage de la page. */
export function warmUpHumanizer(): void {
  if (workerFailed || handshakeStarted) return;
  handshakeStarted = true;
  try {
    const w = getWorker();
    const timer = window.setTimeout(() => {
      workerFailed = true;
    }, WORKER_HANDSHAKE_MS);
    const onMsg = (e: MessageEvent) => {
      if (e.data && (e.data as { type?: string }).type === "pong") {
        window.clearTimeout(timer);
        w.removeEventListener("message", onMsg);
      }
    };
    w.addEventListener("message", onMsg);
    w.addEventListener(
      "error",
      () => {
        workerFailed = true;
        window.clearTimeout(timer);
      },
      { once: true }
    );
    w.postMessage({ type: "ping" });
  } catch {
    workerFailed = true;
  }
}

/* Repli « chunked » : rAF + micro-pause 10 ms entre chaque bloc. */
const rafYield = (): Promise<void> =>
  new Promise((resolve) => {
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

function runChunkedOnMainThread(
  text: string,
  config: Partial<HumanizerConfig> | undefined,
  onProgress: ((p: HumanizerProgress) => void) | undefined
): Promise<HumanizeOutcome> {
  return humanizerEngine
    .humanizeUltimateStream(text, config, onProgress, chunkedYield)
    .then((o) => tag(o, "direct"));
}

export function humanizeText(
  text: string,
  config?: Partial<HumanizerConfig>,
  onProgress?: (p: HumanizerProgress) => void
): Promise<HumanizeOutcome> {
  if (workerFailed) return runChunkedOnMainThread(text, config, onProgress);

  return new Promise((resolve) => {
    let w: Worker;
    try {
      w = getWorker();
    } catch {
      workerFailed = true;
      resolve(runChunkedOnMainThread(text, config, onProgress));
      return;
    }

    const id = Date.now() + Math.random();
    let gotFirstMessage = false;

    const fallbackToChunked = () => {
      cleanup();
      workerFailed = true;
      onProgress?.({
        iteration: 1,
        total: config?.iterationsMax ?? 12,
        proba: 0.5,
        phase: "Worker indisponible — bascule sur exécution par lots (rAF + 10 ms)",
        anomalies: [],
      });
      resolve(runChunkedOnMainThread(text, config, onProgress));
    };

    const hardTimer = window.setTimeout(fallbackToChunked, 600_000);
    const stallTimer = window.setTimeout(fallbackToChunked, FIRST_MESSAGE_MS);

    const onMessage = (e: MessageEvent) => {
      const d = e.data as
        | { type: "pong" }
        | { id: number; type: "progress"; progress: HumanizerProgress }
        | { id: number; type: "done"; texteFinal: string; rapport: HumanizeOutcome["rapport"] }
        | { id: number; type: "error"; error: string }
        | null;
      if (!d || (d as { type?: string }).type === "pong") return;
      const msg = d as { id: number };
      if (msg.id !== id) return;
      if (!gotFirstMessage) {
        gotFirstMessage = true;
        window.clearTimeout(stallTimer);
      }
      if ((d as { type: string }).type === "progress") {
        onProgress?.((d as { progress: HumanizerProgress }).progress);
        return;
      }
      cleanup();
      if ((d as { type: string }).type === "done") {
        const done = d as { texteFinal: string; rapport: HumanizeOutcome["rapport"] };
        resolve(tag({ texteFinal: done.texteFinal, rapport: done.rapport }, "worker"));
      } else {
        fallbackToChunked();
      }
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
