import { analyzeText } from "../detector/analysisRunner";
import { enhancedHumanizer, type HumanizeOutcome } from "./humanizerEnhanced";
import { preprocessForHumanization } from "./humanizerPreprocessor";
import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

export type { HumanizeOutcome, HumanizerConfig, HumanizerProgress, HumanizerReport };

const WORKER_HANDSHAKE_MS = 1500;
const FIRST_MESSAGE_MS = 3500;

let worker: Worker | null = null;
let workerFailed = false;
let handshakeStarted = false;

function createWorker(): Worker { return new Worker(new URL("./humanizerWorker.ts", import.meta.url), { type: "module" }); }
function getWorker(): Worker { if (!worker) worker = createWorker(); return worker; }

export function warmUpHumanizer(): void {
  if (workerFailed || handshakeStarted) return;
  handshakeStarted = true;
  try {
    const w = getWorker();
    const timer = window.setTimeout(() => { workerFailed = true; }, WORKER_HANDSHAKE_MS);
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "pong") { window.clearTimeout(timer); w.removeEventListener("message", onMsg); } };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", () => { workerFailed = true; window.clearTimeout(timer); }, { once: true });
    w.postMessage({ type: "ping" });
  } catch { workerFailed = true; }
}

function tag(o: HumanizeOutcome, mode: "worker" | "direct"): HumanizeOutcome {
  return { texteFinal: o.texteFinal, rapport: { ...o.rapport, engineMode: mode } };
}

function prepare(text: string, config?: Partial<HumanizerConfig>): string {
  return preprocessForHumanization(text, Boolean(config?.modeAggressif));
}

async function applyCanonicalBefore(outcome: HumanizeOutcome, canonical: Promise<Awaited<ReturnType<typeof analyzeText>>>): Promise<HumanizeOutcome> {
  const result = await canonical;
  const before = result.probabilite_IA;
  const finalProba = outcome.rapport.proba_finale;
  return {
    ...outcome,
    rapport: {
      ...outcome.rapport,
      proba_initiale: before,
      reduction_pourcent: before > 0 ? Math.max(0, ((before - finalProba) / before) * 100) : 0,
      decision: `${outcome.rapport.decision} Score Avant canonique Oligens : ${Math.round(before * 1000) / 10} %.`,
    },
  };
}

function runDirectPrepared(text: string, config: Partial<HumanizerConfig> | undefined, onProgress: ((p: HumanizerProgress) => void) | undefined, canonical: Promise<Awaited<ReturnType<typeof analyzeText>>>): Promise<HumanizeOutcome> {
  return enhancedHumanizer.humanize(text, config, onProgress).then((o) => tag(o, "direct")).then((o) => applyCanonicalBefore(o, canonical));
}

export function humanizeText(text: string, config?: Partial<HumanizerConfig>, onProgress?: (p: HumanizerProgress) => void): Promise<HumanizeOutcome> {
  const prepared = prepare(text, config);
  if (!prepared) {
    const emptyReport: HumanizerReport = {
      proba_initiale: 0, proba_finale: 0, reduction_pourcent: 0, iterations_realisees: 0, historique: [], features_finales: [],
      decision: "Aucun texte à humaniser.",
      config: { seuilCible: config?.seuilCible ?? 0.05, intensite: config?.intensite ?? 0.78, iterationsMax: config?.iterationsMax ?? 5, modeAggressif: Boolean(config?.modeAggressif), langue: config?.langue ?? "mixte" },
    };
    return Promise.resolve({ texteFinal: "", rapport: emptyReport });
  }

  // The detector is evaluated exactly once through the canonical pipeline.
  // The humanizer never invents or owns the displayed "Avant" score.
  const canonical = analyzeText(prepared, { language: "auto" });

  if (workerFailed) return runDirectPrepared(prepared, config, onProgress, canonical);

  return new Promise((resolve) => {
    let w: Worker;
    try { w = getWorker(); }
    catch { workerFailed = true; resolve(runDirectPrepared(prepared, config, onProgress, canonical)); return; }

    const id = Date.now() + Math.random();
    let fallbackTriggered = false;

    const cleanup = () => {
      window.clearTimeout(hardTimer);
      window.clearTimeout(stallTimer);
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };

    const fallbackToDirect = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      cleanup();
      workerFailed = true;
      if (worker === w) {
        w.terminate();
        worker = null;
      }
      onProgress?.({ iteration: 1, total: config?.iterationsMax ?? 5, proba: 0.5, phase: "Worker indisponible — exécution locale", anomalies: [] });
      runDirectPrepared(prepared, config, onProgress, canonical).then(resolve).catch((error) => resolve({ texteFinal: prepared, rapport: {
        proba_initiale: 0, proba_finale: 0, reduction_pourcent: 0, iterations_realisees: 0, historique: [], features_finales: [],
        decision: error instanceof Error ? error.message : "Échec du moteur local.",
        config: { seuilCible: config?.seuilCible ?? 0.05, intensite: config?.intensite ?? 0.78, iterationsMax: config?.iterationsMax ?? 5, modeAggressif: Boolean(config?.modeAggressif), langue: config?.langue ?? "mixte" },
      }}));
    };

    const hardTimer = window.setTimeout(fallbackToDirect, 600_000);
    const stallTimer = window.setTimeout(fallbackToDirect, FIRST_MESSAGE_MS);
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; id?: number; progress?: HumanizerProgress; texteFinal?: string; rapport?: HumanizeOutcome["rapport"] } | null;
      if (!d || d.type === "pong" || d.id !== id) return;
      if (d.type === "progress") { if (d.progress) onProgress?.(d.progress); return; }
      if (d.type === "done" && typeof d.texteFinal === "string" && d.rapport) {
        cleanup();
        applyCanonicalBefore(tag({ texteFinal: d.texteFinal, rapport: d.rapport }, "worker"), canonical).then(resolve).catch(() => resolve(tag({ texteFinal: d.texteFinal!, rapport: d.rapport! }, "worker")));
      }
      else if (d.type === "error") fallbackToDirect();
    };
    const onError = () => fallbackToDirect();
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, text: prepared, config });
  });
}
