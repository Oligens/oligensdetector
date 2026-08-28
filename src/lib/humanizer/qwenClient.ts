// ============================================================
// QWEN CLIENT — Connecteur API « AgweStream » (DashScope, mode
// compatible OpenAI) + orchestrateur du MOTEUR HYBRIDE INTELLIGENT :
// tentative API (timeout 4 s) → bascule silencieuse sur le moteur
// local ULTIMATE (chunked) si réseau/CORS/clé indisponible.
// ============================================================
import { analyzeText } from "../detector/analysisRunner";
import type { FullAnalysisResult } from "../detector/heuristicEngine";
import { humanizeText } from "./humanizerRunner";
import type { HumanizerConfig, HumanizerProgress, HumanizerReport } from "./humanizerUltimate";

export const QWEN_CONFIG = {
  baseUrl: "https://ws-6alfimzwjzpalpi4.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
  apiKey:
    "sk-ws-H.DMXPHRY.jis6.MEUCIQDSyDXuX7X3mi2GHZg7CIBmSOHDlmHhD2Dq2TrdHHpOWQIgOv6BisiWZsDxey3VQXU1Wb2d3cKaF2S4xzfszlq1o4s",
  workspaceId: "ws-6alfimzwjzpalpi4",
  model: "AgweStream",
  timeoutMs: 15_000,
} as const;

export const QWEN_SYSTEM_PROMPT = `Tu es un rédacteur humain expert et un styliste littéraire. Ton objectif est de réécrire le texte ci-dessous pour qu'il adopte un style de rédaction 100% naturel, organique et fluide, tout en conservant rigoureusement le même sens, le même niveau de professionnalisme et le même vocabulaire technique.

Règles strictes de réécriture :
1. Varie la longueur des phrases (mélange de phrases courtes percutantes et de phrases plus amples) pour briser la régularité rythmique typique des IA.
2. Élimine les tournures robotiques et les connecteurs prévisibles ('Il est important de noter', 'En effet', 'Par conséquent', 'En conclusion'). Remplace-les par des transitions logiques naturelles ou supprime-les.
3. N'ajoute AUCUN tic de langage familier absurde, AUCUNE interjection déplacée (pas de 'Bon,', 'Euh', 'Franchement') et aucun mot en anglais. Le registre doit rester soigné et académique.
4. Réécris les formulations de manière à ce qu'un détecteur heuristique n'y voie pas de motifs prédictifs de n-grammes artificiels.`;

export type QwenErrorKind = "timeout" | "network" | "http" | "parse" | "empty";

export class QwenApiError extends Error {
  kind: QwenErrorKind;
  status?: number;
  constructor(kind: QwenErrorKind, message: string, status?: number) {
    super(message);
    this.name = "QwenApiError";
    this.kind = kind;
    this.status = status;
  }
}

export interface QwenHumanizeResult {
  text: string;
  model: string;
  finishReason: string | null;
  streamed: boolean;
  durationMs: number;
}

export function cleanModelOutput(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n").trim();
  t = t.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/\n?```\s*$/, "");
  t = t.replace(/^«\s*([\s\S]*)\s*»$/, "$1").replace(/^"\s*([\s\S]*)\s*"$/, "$1");
  return t.trim();
}

/**
 * Réécriture stylistique via AgweStream (streaming SSE prioritaire,
 * repli JSON). Timeout de connexion + timeout d'inactivité remis à zéro
 * à chaque chunk reçu.
 */
export async function humanizeViaQwen(
  sourceText: string,
  opts: { onDelta?: (chunk: string, accumulated: string) => void; timeoutMs?: number } = {}
): Promise<QwenHumanizeResult> {
  const timeoutMs = opts.timeoutMs ?? QWEN_CONFIG.timeoutMs;
  const t0 = performance.now();

  const controller = new AbortController();
  let timedOut = false;
  let idleTimer = 0;
  const armIdle = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };
  armIdle();

  let res: Response;
  try {
    res = await fetch(`${QWEN_CONFIG.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${QWEN_CONFIG.apiKey}` },
      body: JSON.stringify({
        model: QWEN_CONFIG.model,
        stream: true,
        temperature: 0.85,
        messages: [
          { role: "system", content: QWEN_SYSTEM_PROMPT },
          { role: "user", content: sourceText },
        ],
      }),
    });
  } catch (err) {
    window.clearTimeout(idleTimer);
    if (timedOut || (err instanceof DOMException && err.name === "AbortError")) {
      throw new QwenApiError("timeout", `Délai de ${Math.round(timeoutMs / 1000)} s dépassé — le modèle AgweStream ne répond pas.`);
    }
    throw new QwenApiError("network", "Impossible de joindre l'endpoint DashScope (réseau, CORS ou proxy).");
  }

  if (!res.ok) {
    window.clearTimeout(idleTimer);
    let detail = "";
    try {
      const body = await res.json();
      detail = (body as { error?: { message?: string } })?.error?.message ?? "";
    } catch {
      /* corps non-JSON */
    }
    throw new QwenApiError("http", `Le modèle AgweStream a renvoyé une erreur HTTP ${res.status}${detail ? ` : ${detail}` : "."}`, res.status);
  }

  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream") && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    let finishReason: string | null = null;
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        armIdle();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.trim();
          if (!data.startsWith("data:")) continue;
          const payload = data.slice(5).trim();
          if (payload === "[DONE]") continue;
          let parsed: { choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }> };
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          const choice = parsed.choices?.[0];
          const chunk = choice?.delta?.content ?? "";
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (chunk) {
            acc += chunk;
            opts.onDelta?.(chunk, acc);
          }
        }
      }
    } catch (err) {
      window.clearTimeout(idleTimer);
      if (timedOut || (err instanceof DOMException && err.name === "AbortError")) {
        throw new QwenApiError("timeout", "Le flux s'est interrompu (inactivité > 15 s).");
      }
      throw new QwenApiError("network", "Lecture du flux interrompue par le réseau.");
    }
    window.clearTimeout(idleTimer);
    const text = cleanModelOutput(acc);
    if (!text) throw new QwenApiError("empty", "Le modèle a renvoyé une réponse vide.");
    return { text, model: QWEN_CONFIG.model, finishReason, streamed: true, durationMs: Math.round(performance.now() - t0) };
  }

  let json: { choices?: Array<{ message?: { content?: string }; finish_reason?: string | null }> };
  try {
    json = await res.json();
  } catch {
    window.clearTimeout(idleTimer);
    throw new QwenApiError("parse", "La réponse du modèle est illisible (JSON invalide).");
  }
  window.clearTimeout(idleTimer);
  const text = cleanModelOutput(json.choices?.[0]?.message?.content ?? "");
  if (!text) throw new QwenApiError("empty", "Le modèle a renvoyé une réponse vide.");
  opts.onDelta?.(text, text);
  return {
    text,
    model: QWEN_CONFIG.model,
    finishReason: json.choices?.[0]?.finish_reason ?? null,
    streamed: false,
    durationMs: Math.round(performance.now() - t0),
  };
}

/* ============================================================
 * MOTEUR HYBRIDE INTELLIGENT
 * API prioritaire (timeout strict 4 s) → bascule AUTOMATIQUE et
 * SILENCIEUSE sur le moteur local ULTIMATE (chunked, circuit breaker).
 * ============================================================ */

export const HYBRID_API_TIMEOUT_MS = 4000;

export type HybridFlow = "api" | "local";

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

function buildApiReport(
  initPct: number,
  finalPct: number,
  post: FullAnalysisResult,
  api: QwenHumanizeResult
): HumanizerReport {
  const p0 = initPct / 100;
  const p1 = finalPct / 100;
  const decision =
    p1 < 0.05
      ? "Texte quasi-indistinguable d'un humain — probabilité IA inférieure à 5 %."
      : p1 < 0.25
        ? "Traces IA fortement réduites — profil majoritairement humain."
        : "Réduction partielle — des marqueurs résiduels subsistent.";
  return {
    proba_initiale: p0,
    proba_finale: p1,
    reduction_pourcent: (p0 - p1) * 100,
    iterations_realisees: 1,
    viaApi: true,
    model: api.model,
    historique: [
      { iteration: 1, proba: p0, anomalies: [] },
      { iteration: 2, proba: p1, anomalies: post.rapport_detaille.slice(0, 5) },
    ],
    features_finales: post.rapport_detaille,
    decision,
    config: { seuilCible: 0.05, intensite: 0.85, iterationsMax: 1, modeAggressif: false, langue: "mixte" },
  };
}

/**
 * Humanisation hybride : un seul appel, l'orchestration est invisible
 * pour l'utilisateur. L'évaluation « avant » tourne en parallèle de la
 * tentative API pour ne rien retarder.
 */
export async function humanizeHybrid(
  text: string,
  config: Partial<HumanizerConfig>,
  cb: HybridCallbacks = {}
): Promise<HybridOutcome> {
  cb.onPhase?.("Évaluation initiale (moteur heuristique v2.1)…");
  const initPromise = analyzeText(text).then((r) => Math.round(r.probabilite_IA * 100));

  let fallbackReason: string | undefined;

  cb.onPhase?.(`Connexion au LLM ${QWEN_CONFIG.model} — authentification DashScope…`);
  try {
    const api = await humanizeViaQwen(text, {
      timeoutMs: HYBRID_API_TIMEOUT_MS,
      onDelta: (_c, acc) => cb.onApiDelta?.(acc),
    });

    const [initP, post] = await Promise.all([initPromise, analyzeText(api.text)]);
    const finalPct = Math.round(post.probabilite_IA * 1000) / 10;
    cb.onFlowResolved?.("api");
    return { flow: "api", text: api.text, report: buildApiReport(initP, finalPct, post, api), apiDurationMs: api.durationMs };
  } catch (err) {
    fallbackReason =
      err instanceof QwenApiError
        ? `${err.kind === "timeout" ? "timeout 4 s" : err.kind === "network" ? "réseau/CORS" : err.kind === "http" ? `HTTP ${err.status ?? "?"}` : err.kind}`
        : "erreur inattendue";
    cb.onFallback?.(fallbackReason);
  }

  // ── Bascule silencieuse sur le moteur local ULTIMATE ──
  cb.onFlowResolved?.("local");
  const initP = await initPromise;
  cb.onPhase?.("Moteur local ULTIMATE — initialisation…");
  const local = await humanizeText(
    text,
    { ...config, langue: config.langue ?? "mixte" },
    (p) => cb.onLocalProgress?.(p)
  );
  const rpt: HumanizerReport = { ...local.rapport, proba_initiale: initP / 100 };
  return { flow: "local", text: local.texteFinal, report: rpt, fallbackReason };
}
