export interface PlagiarismReference {
  id?: string;
  title?: string;
  text: string;
}

export interface PlagiarismHit {
  sentence: string;
  source: string;
  similarity: number;
  level: "exact" | "forte" | "probable";
  matchedText: string;
}

const STOPWORDS = new Set([
  "le","la","les","des","un","une","de","du","au","aux","ce","cet","cette","ces","et","ou","que","qui","dont","où",
  "en","dans","par","pour","sur","sous","avec","sans","est","sont","était","étaient","a","ont","ne","pas","plus",
  "moins","se","sa","son","ses","leur","leurs","il","elle","on","nous","vous","je","tu","y","à",
  "the","a","an","of","to","in","and","or","is","are","was","were","be","been","that","this","with","for","as","at","by","from"
]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return (normalize(value).match(/[\p{L}\p{N}']+/gu) ?? []).filter(t => !STOPWORDS.has(t));
}

function shingles(value: string, size = 5): Set<string> {
  const t = tokens(value);
  const out = new Set<string>();
  for (let i = 0; i + size <= t.length; i++) out.add(t.slice(i, i + size).join(" "));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

function cosineLike(a: string[], b: string[]): number {
  const aa = new Map<string, number>();
  const bb = new Map<string, number>();
  for (const t of a) aa.set(t, (aa.get(t) ?? 0) + 1);
  for (const t of b) bb.set(t, (bb.get(t) ?? 0) + 1);
  let dot = 0, na = 0, nb = 0;
  for (const [t, n] of aa) {
    dot += n * (bb.get(t) ?? 0);
    na += n * n;
  }
  for (const n of bb.values()) nb += n * n;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+|\n+/).map(s => s.trim()).filter(s => tokens(s).length >= 8);
}

function bestSentenceMatch(sentence: string, referenceSentences: string[]): { score: number; matchedText: string } {
  const a = tokens(sentence);
  const ash = shingles(sentence);
  let best = { score: 0, matchedText: "" };

  for (const candidate of referenceSentences) {
    const b = tokens(candidate);
    if (!b.length) continue;
    const exact = normalize(sentence) === normalize(candidate) ? 1 : 0;
    const lexical = jaccard(new Set(a), new Set(b));
    const cosine = cosineLike(a, b);
    const bsh = shingles(candidate);
    const shingle = ash.size && bsh.size ? jaccard(ash, bsh) : 0;

    // Exact phrase structure is strongest; lexical/cosine similarity catches
    // copied passages with punctuation or small wording changes.
    const score = exact || shingle >= 0.85
      ? 1
      : Math.max(lexical * 0.55 + cosine * 0.25 + shingle * 0.20, lexical * 0.75 + cosine * 0.25);

    if (score > best.score) best = { score, matchedText: candidate };
  }
  return best;
}

export function detectPlagiarism(text: string, references: PlagiarismReference[]): {
  score: number;
  analyzedSentences: number;
  matchedSentences: number;
  hits: PlagiarismHit[];
  sources: number;
} {
  const cleanRefs = references
    .filter(r => typeof r?.text === "string" && r.text.trim().length >= 40)
    .map(r => ({
      title: String(r.title ?? r.id ?? "Document de référence"),
      sentences: splitSentences(r.text)
    }))
    .filter(r => r.sentences.length > 0);

  const inputSentences = splitSentences(text);
  if (!inputSentences.length || !cleanRefs.length) {
    return { score: 0, analyzedSentences: inputSentences.length, matchedSentences: 0, hits: [], sources: cleanRefs.length };
  }

  const hits: PlagiarismHit[] = [];
  let weightedCoverage = 0;
  let totalWeight = 0;

  for (const sentence of inputSentences) {
    const weight = Math.min(3, Math.max(1, tokens(sentence).length / 12));
    totalWeight += weight;
    let best: { score: number; source: string; matchedText: string } | null = null;

    for (const ref of cleanRefs) {
      const match = bestSentenceMatch(sentence, ref.sentences);
      if (!best || match.score > best.score) best = { ...match, source: ref.title };
    }

    if (best && best.score >= 0.55) {
      const level = best.score >= 0.90 ? "exact" : best.score >= 0.72 ? "forte" : "probable";
      hits.push({ sentence, source: best.source, similarity: Number(best.score.toFixed(3)), level, matchedText: best.matchedText });
      weightedCoverage += weight * best.score;
    }
  }

  const score = totalWeight ? Math.min(100, weightedCoverage / totalWeight * 100) : 0;
  return {
    score: Number(score.toFixed(1)),
    analyzedSentences: inputSentences.length,
    matchedSentences: hits.length,
    hits: hits.sort((a, b) => b.similarity - a.similarity).slice(0, 50),
    sources: cleanRefs.length,
  };
}
