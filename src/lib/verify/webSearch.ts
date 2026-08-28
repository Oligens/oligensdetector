// ============================================================
// WEB OPEN-SOURCE — extraits contextuels (Wikipédia) & vérification
// des références (CrossRef). Chaque appel est borné par un timeout
// et ne bloque jamais le moteur hybride.
// ============================================================

export interface WebExcerpt {
  title: string;
  url: string;
  sentences: string[];
}

export interface WebSearchOutcome {
  excerpts: WebExcerpt[];
  reachable: boolean;
}

function withTimeout(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => window.clearTimeout(timer) };
}

const splitSentences = (raw: string): string[] =>
  raw
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40)
    .slice(0, 10);

/** Extraits web contextuels (Wikipédia FR puis EN). */
export async function searchWebExcerpts(query: string, timeoutMs = 4000): Promise<WebSearchOutcome> {
  const clean = query.trim().slice(0, 120);
  if (!clean) return { excerpts: [], reachable: false };

  for (const lang of ["fr", "en"]) {
    const t1 = withTimeout(timeoutMs);
    let titles: string[] = [];
    let urls: string[] = [];
    try {
      const params = new URLSearchParams({
        action: "opensearch",
        search: clean,
        limit: "2",
        namespace: "0",
        format: "json",
        origin: "*",
      });
      const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { signal: t1.signal });
      if (!res.ok) continue;
      const data = (await res.json()) as [string, string[], string[], string[]];
      titles = data[1] ?? [];
      urls = data[3] ?? [];
    } catch {
      continue;
    } finally {
      t1.cancel();
    }
    if (titles.length === 0) continue;

    const excerpts: WebExcerpt[] = [];
    for (let i = 0; i < Math.min(2, titles.length); i++) {
      const t2 = withTimeout(timeoutMs);
      try {
        const params = new URLSearchParams({
          action: "query",
          titles: titles[i],
          prop: "extracts",
          explaintext: "1",
          exsentences: "8",
          format: "json",
          origin: "*",
        });
        const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { signal: t2.signal });
        if (!res.ok) continue;
        const data = (await res.json()) as { query?: { pages?: Record<string, { extract?: string }> } };
        const page = Object.values(data.query?.pages ?? {})[0];
        const sentences = splitSentences(page?.extract ?? "");
        if (sentences.length > 0) excerpts.push({ title: titles[i], url: urls[i] ?? "", sentences });
      } catch {
        /* article inaccessible */
      } finally {
        t2.cancel();
      }
    }
    if (excerpts.length > 0) return { excerpts, reachable: true };
  }
  return { excerpts: [], reachable: false };
}

/* ---------- Vérification des références (CrossRef) ---------- */

export interface CrossrefOutcome {
  reachable: boolean;
  found: boolean;
  doi?: string;
  title?: string;
  year?: number;
}

/**
 * Vérifie l'EXISTENCE réelle d'une référence (auteur + année) via CrossRef.
 * Absente de CrossRef ET de la base institutionnelle → « Hallucination ».
 */
export async function verifyViaCrossref(
  author: string | null,
  year: number | null,
  titleHint: string | null,
  timeoutMs = 4000
): Promise<CrossrefOutcome> {
  const t = withTimeout(timeoutMs);
  try {
    const params = new URLSearchParams({ rows: "3", select: "DOI,title,author,issued", mailto: "verify@oligens.eu" });
    if (author) params.set("query.author", author.replace(/\s*et al\.?$/i, "").trim());
    if (titleHint) params.set("query.bibliographic", titleHint.slice(0, 90));
    else if (year != null) params.set("query.bibliographic", String(year));
    if (year != null) params.set("filter", `from-pub-date:${year},until-pub-date:${year}`);

    const res = await fetch(`https://api.crossref.org/works?${params}`, { signal: t.signal });
    if (!res.ok) return { reachable: false, found: false };
    const data = (await res.json()) as {
      message?: { items?: Array<{ DOI?: string; title?: string[]; issued?: { "date-parts"?: number[][] } }> };
    };
    const items = data.message?.items ?? [];
    if (items.length === 0) return { reachable: true, found: false };
    const first = items[0];
    return { reachable: true, found: true, doi: first.DOI, title: first.title?.[0], year: first.issued?.["date-parts"]?.[0]?.[0] };
  } catch {
    return { reachable: false, found: false };
  } finally {
    t.cancel();
  }
}
