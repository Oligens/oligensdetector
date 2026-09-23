import type { FullAnalysisResult, RunOptions } from "./heuristicEngine";
import type { PlagiarismSource } from "./plagiarismEngine";

function countWords(text: string): number {
  return (text.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).length;
}

interface ReferencePayload {
  id?: string;
  title?: string;
  text: string;
}

async function loadInstitutionalReferences(): Promise<ReferencePayload[]> {
  try {
    const response = await fetch("/api/institutional-databases", { credentials: "include" });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    const databases = Array.isArray(data.databases) ? data.databases : [];
    const refs: ReferencePayload[] = [];

    for (const db of databases) {
      const metadata = db?.metadata && typeof db.metadata === "object" ? db.metadata : {};
      const files = Array.isArray((metadata as Record<string, unknown>).files)
        ? (metadata as Record<string, unknown>).files as Array<Record<string, unknown>>
        : [];

      for (const file of files) {
        const sourceText = typeof file.text === "string" ? file.text.trim() : "";
        if (sourceText.length >= 40) {
          refs.push({
            id: String(file.id ?? ""),
            title: String(file.name ?? db.name ?? "Document institutionnel"),
            text: sourceText,
          });
        }
      }
    }

    return refs.slice(0, 100);
  } catch {
    return [];
  }
}

/** Canonical browser entry point: every UI analysis uses /api/detect. */
export async function analyzeText(text: string, options?: RunOptions & { corpus?: PlagiarismSource[] }): Promise<FullAnalysisResult> {
  const clean = text.trim();
  if (!clean) throw new Error("Aucun texte à analyser.");

  const startedAt = performance.now();
  const referenceTexts = await loadInstitutionalReferences();

  const response = await fetch("/api/detect", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: clean,
      language: options?.language ?? "auto",
      referenceTexts,
    }),
  });

  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok || !data.analysis) {
    throw new Error(typeof data.error === "string"
      ? data.error
      : `Le service de détection a répondu ${response.status}.`);
  }

  const result = data.analysis as FullAnalysisResult;
  result.processing = {
    mode: "direct",
    durationMs: Math.round(performance.now() - startedAt),
    words: countWords(clean),
  };
  return result;
}

export const WORKER_THRESHOLD_WORDS = 10_000;
