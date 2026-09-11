import { countWords, type FullAnalysisResult, type RunOptions } from "./heuristicEngine";

/** Canonical browser entry point: every UI analysis uses /api/detect. */
export async function analyzeText(text: string, options?: RunOptions): Promise<FullAnalysisResult> {
  const clean = text.trim();
  if (!clean) throw new Error("Aucun texte à analyser.");
  const startedAt = performance.now();
  const response = await fetch("/api/detect", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: clean, language: options?.language ?? "auto" }),
  });
  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok || !data.analysis) throw new Error(typeof data.error === "string" ? data.error : `Le service de détection a répondu ${response.status}.`);
  const result = data.analysis as FullAnalysisResult;
  // The legacy result type only permits "direct" | "worker". The actual
  // execution is server-backed, so "direct" is the closest compatible mode.
  result.processing = { mode: "direct", durationMs: Math.round(performance.now() - startedAt), words: countWords(clean) };
  return result;
}

export const WORKER_THRESHOLD_WORDS = 10_000;
