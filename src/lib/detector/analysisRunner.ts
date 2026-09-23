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
            text: sourceText.slice(0, 20_000),
          });
        }
      }
    }
    return refs.slice(0, 40);
  } catch {
    return [];
  }
}

async function loadWebReferences(text: string, language: string): Promise<ReferencePayload[]> {
  try {
    const response = await fetch("/api/web-search", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (response.ok && Array.isArray(data.sources)) {
      return data.sources
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map(item => ({
          id: String(item.id ?? item.url ?? ""),
          title: String(item.title ?? item.url ?? "Source Web"),
          text: typeof item.text === "string" ? item.text : "",
        }))
        .filter(item => item.text.trim().length >= 80)
        .slice(0, 18);
    }

    // Si la clé Web n'est pas encore configurée, on utilise quand même
    // l'index déjà construit pour ne pas perdre les sources précédemment indexées.
    const cached = await fetch("/api/web-search", { credentials: "include" });
    const cachedData = await cached.json().catch(() => ({} as Record<string, unknown>));
    if (!cached.ok || !Array.isArray(cachedData.sources)) return [];
    return cachedData.sources
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map(item => ({
        id: String(item.id ?? item.url ?? ""),
        title: String(item.title ?? item.url ?? "Source Web"),
        text: typeof item.text === "string" ? item.text : "",
      }))
      .filter(item => item.text.trim().length >= 80)
      .slice(0, 18);
  } catch {
    return [];
  }
}

/** Canonical browser entry point: every UI analysis uses /api/detect. */
export async function analyzeText(text: string, options?: RunOptions & { corpus?: PlagiarismSource[] }): Promise<FullAnalysisResult> {
  const clean = text.trim();
  if (!clean) throw new Error("Aucun texte à analyser.");

  const startedAt = performance.now();
  const language = options?.language === "fr" ? "fr" : "en";
  const [institutionalReferences, webReferences] = await Promise.all([
    loadInstitutionalReferences(),
    loadWebReferences(clean, language),
  ]);
  const referenceTexts = [...institutionalReferences, ...webReferences].slice(0, 58);

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
