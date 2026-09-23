export interface PlagiarismSource {
  id: string;
  title: string;
  text: string;
}

export interface PlagiarismMatch {
  sourceId: string;
  sourceTitle: string;
  score: number;
  matchedWords: number;
  matchedPhrases: number;
  excerpts: string[];
}

export interface PlagiarismResult {
  score: number;
  matchedWords: number;
  matchedPhrases: number;
  sourcesCompared: number;
  matches: PlagiarismMatch[];
  verdict: "none" | "possible" | "high";
}

const STOPWORDS = new Set([
  "le","la","les","un","une","des","de","du","au","aux","ce","cet","cette","ces",
  "et","ou","mais","donc","or","ni","car","que","qui","dont","où","en","dans","par",
  "pour","sur","sous","avec","sans","entre","chez","se","sa","son","ses","leur",
  "leurs","il","elle","ils","elles","on","nous","vous","je","tu","a","as","ont",
  "est","sont","était","étaient","être","avoir","plus","moins","pas","ne",
  "the","a","an","of","to","in","and","or","but","that","which","for","with","on",
  "at","by","from","is","are","was","were","be","been","this","these","those",
]);

function normalize(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return (normalize(text).match(/[\p{L}\p{N}']+/gu) ?? []);
}

function contentTokens(text: string): string[] {
  return tokens(text).filter(token => token.length > 2 && !STOPWORDS.has(token));
}

function shingles(values: string[], size: number): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i + size <= values.length; i++) {
    result.add(values.slice(i, i + size).join(" "));
  }
  return result;
}

function sentenceParts(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map(value => value.trim())
    .filter(value => contentTokens(value).length >= 8);
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const value of a) if (b.has(value)) common++;
  return common / a.size;
}

function longestCommonRun(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const previous = new Uint16Array(b.length + 1);
  let best = 0;
  for (let i = 1; i <= a.length; i++) {
    const current = new Uint16Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous.set(current);
  }
  return best;
}

export function detectPlagiarism(text: string, sources: PlagiarismSource[]): PlagiarismResult {
  const query = contentTokens(text);
  if (query.length < 12 || !sources.length) {
    return { score: 0, matchedWords: 0, matchedPhrases: 0, sourcesCompared: sources.length, matches: [], verdict: "none" };
  }

  const queryShingles = shingles(query, 7);
  const querySentences = sentenceParts(text);
  const matches: PlagiarismMatch[] = [];

  for (const source of sources) {
    const sourceText = String(source.text ?? "").trim();
    if (!sourceText) continue;

    const sourceTokens = contentTokens(sourceText);
    if (sourceTokens.length < 12) continue;

    const sourceShingles = shingles(sourceTokens, 7);
    const sevenGramOverlap = overlap(queryShingles, sourceShingles);
    const tokenSetA = new Set(query);
    const tokenSetB = new Set(sourceTokens);
    let tokenIntersection = 0;
    for (const token of tokenSetA) if (tokenSetB.has(token)) tokenIntersection++;
    const tokenJaccard = tokenIntersection / Math.max(1, tokenSetA.size + tokenSetB.size - tokenIntersection);

    let matchedWords = 0;
    let matchedPhrases = 0;
    const excerpts: string[] = [];

    for (const sentence of querySentences) {
      const sentenceTokens = contentTokens(sentence);
      let bestRun = 0;
      for (let start = 0; start + 8 <= sentenceTokens.length; start += 2) {
        const window = sentenceTokens.slice(start, start + 8);
        const run = longestCommonRun(window, sourceTokens);
        if (run > bestRun) bestRun = run;
      }
      if (bestRun >= 7) {
        matchedPhrases++;
        matchedWords += bestRun;
        if (excerpts.length < 4) excerpts.push(sentence);
      }
    }

    const phraseCoverage = matchedPhrases / Math.max(1, querySentences.length);
    const score = Math.min(
      1,
      sevenGramOverlap * 0.62 +
      phraseCoverage * 0.28 +
      tokenJaccard * 0.10,
    );

    if (score >= 0.08 || matchedPhrases > 0) {
      matches.push({
        sourceId: source.id,
        sourceTitle: source.title,
        score: Number(score.toFixed(4)),
        matchedWords,
        matchedPhrases,
        excerpts,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  const top = matches.slice(0, 10);
  const score = top.length ? Math.max(...top.map(match => match.score)) : 0;
  const matchedWords = top.reduce((sum, match) => sum + match.matchedWords, 0);
  const matchedPhrases = top.reduce((sum, match) => sum + match.matchedPhrases, 0);

  return {
    score: Math.round(score * 100),
    matchedWords,
    matchedPhrases,
    sourcesCompared: sources.length,
    matches: top,
    verdict: score >= 0.35 ? "high" : score >= 0.08 ? "possible" : "none",
  };
}
