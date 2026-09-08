/**
 * Oligens AI Innovation Layer
 *
 * Shared, dependency-free utilities for:
 * - evidence aggregation rather than single-signal decisions;
 * - genre/length-aware calibration;
 * - preservation of factual anchors during rewriting;
 * - measurable rewrite quality.
 *
 * This layer deliberately does NOT promise "0% AI" or undetectability.
 * Detection is an estimate and rewriting is a writing-quality operation.
 */

export interface EvidenceItem {
  name: string;
  value: number;
  weight: number;
}

export interface EvidenceFusion {
  score: number;
  agreement: number;
  positiveEvidence: number;
  negativeEvidence: number;
  activeSignals: number;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export function robustMean(values: number[]): number {
  const clean = values.filter(Number.isFinite).map((v) => clamp(v));
  if (!clean.length) return 0;
  const sorted = [...clean].sort((a, b) => a - b);
  if (sorted.length >= 5) {
    const trimmed = sorted.slice(1, -1);
    return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  }
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

/**
 * Fuse independent evidence. Positive values support AI-like regularity;
 * negative values support natural variation. One signal cannot dominate.
 */
export function fuseEvidence(items: EvidenceItem[]): EvidenceFusion {
  const active = items.filter((x) => Number.isFinite(x.value) && x.weight > 0);
  if (!active.length) return { score: 0.1, agreement: 0, positiveEvidence: 0, negativeEvidence: 0, activeSignals: 0 };

  let weightedPositive = 0;
  let weightedNegative = 0;
  let totalWeight = 0;

  for (const item of active) {
    const value = clamp(item.value);
    const weight = Math.max(0, item.weight);
    totalWeight += weight;
    if (value >= 0.5) weightedPositive += ((value - 0.5) * 2) * weight;
    else weightedNegative += ((0.5 - value) * 2) * weight;
  }

  const positiveEvidence = totalWeight ? weightedPositive / totalWeight : 0;
  const negativeEvidence = totalWeight ? weightedNegative / totalWeight : 0;

  // Conservative prior. Neutral evidence stays low instead of becoming 50%.
  const net = positiveEvidence - negativeEvidence * 0.72;
  const score = clamp(0.12 + net * 0.78);

  const activeValues = active.map((x) => (x.value >= 0.5 ? 1 : -1));
  const positiveCount = activeValues.filter((x) => x > 0).length;
  const negativeCount = activeValues.length - positiveCount;
  const majority = Math.max(positiveCount, negativeCount);
  const agreement = activeValues.length ? majority / activeValues.length : 0;

  return { score, agreement, positiveEvidence, negativeEvidence, activeSignals: active.length };
}

/**
 * Text length should affect confidence, never manufacture probability.
 */
export function lengthConfidence(wordCount: number): number {
  if (wordCount < 120) return 0.18;
  if (wordCount < 250) return 0.34;
  if (wordCount < 500) return 0.52;
  if (wordCount < 900) return 0.70;
  if (wordCount < 1500) return 0.84;
  return 0.92;
}

/**
 * Estimate whether the document has enough independent evidence to support
 * a strong conclusion. This is intentionally separate from the score.
 */
export function evidenceConfidence(
  wordCount: number,
  agreement: number,
  activeSignals: number,
): number {
  const length = lengthConfidence(wordCount);
  const breadth = clamp(activeSignals / 8);
  return clamp(0.22 + length * 0.48 + agreement * 0.20 + breadth * 0.10);
}

/* ----------------------------- Rewrite guard ----------------------------- */

export interface TextAnchor {
  kind: "number" | "date" | "url" | "email" | "citation" | "proper";
  value: string;
}

const ANCHOR_PATTERNS: Array<[TextAnchor["kind"], RegExp]> = [
  ["url", /https?:\/\/[^\s)\]}>"']+/gi],
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ["date", /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/g],
  ["number", /(?<![\p{L}])[-+]?\d+(?:[.,]\d+)?%?(?![\p{L}])/gu],
  ["citation", /\([^()]{1,90}\b(?:19|20)\d{2}\b[^()]{0,30}\)/g],
];

export function extractAnchors(text: string): TextAnchor[] {
  const anchors: TextAnchor[] = [];
  const seen = new Set<string>();
  for (const [kind, regex] of ANCHOR_PATTERNS) {
    for (const match of text.matchAll(regex)) {
      const value = match[0];
      const key = kind + ":" + value;
      if (!seen.has(key)) {
        seen.add(key);
        anchors.push({ kind, value });
      }
    }
  }
  return anchors;
}

export function anchorCoverage(original: string, candidate: string): number {
  const anchors = extractAnchors(original);
  if (!anchors.length) return 1;
  const lower = candidate.toLocaleLowerCase();
  const preserved = anchors.filter((a) => lower.includes(a.value.toLocaleLowerCase())).length;
  return preserved / anchors.length;
}

function tokenizeWords(text: string): string[] {
  return text.toLocaleLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
}

export function lexicalNovelty(original: string, candidate: string): number {
  const a = tokenizeWords(original);
  const b = tokenizeWords(candidate);
  if (!a.length || !b.length) return 0;
  const originalSet = new Set(a);
  const candidateSet = new Set(b);
  let newWords = 0;
  for (const word of candidateSet) if (!originalSet.has(word)) newWords++;
  return clamp(newWords / Math.max(1, candidateSet.size));
}

export function sentenceCount(text: string): number {
  return text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.filter((x) => x.trim()).length ?? 0;
}

export function sentenceLengthCV(text: string): number {
  const sentences = text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map((s) => tokenizeWords(s).length).filter(Boolean) ?? [];
  if (sentences.length < 2) return 0;
  const mean = sentences.reduce((a, b) => a + b, 0) / sentences.length;
  if (!mean) return 0;
  const variance = sentences.reduce((a, b) => a + (b - mean) ** 2, 0) / sentences.length;
  return Math.sqrt(variance) / mean;
}

export interface RewriteQuality {
  changed: boolean;
  changeRatio: number;
  anchorCoverage: number;
  lexicalNovelty: number;
  sentenceRhythmChange: number;
  qualityScore: number;
  warnings: string[];
}

export function evaluateRewrite(original: string, candidate: string): RewriteQuality {
  const a = original.trim();
  const b = candidate.trim();
  if (!a || !b) {
    return {
      changed: false,
      changeRatio: 0,
      anchorCoverage: 0,
      lexicalNovelty: 0,
      sentenceRhythmChange: 0,
      qualityScore: 0,
      warnings: ["Texte vide."],
    };
  }

  const max = Math.max(a.length, b.length);
  let same = 0;
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i++) if (a[i] === b[i]) same++;
  const changeRatio = 1 - same / Math.max(1, max);

  const anchor = anchorCoverage(a, b);
  const novelty = lexicalNovelty(a, b);
  const rhythm = clamp(Math.abs(sentenceLengthCV(a) - sentenceLengthCV(b)) / 0.8);

  const warnings: string[] = [];
  if (anchor < 1) warnings.push("Certaines données chiffrées, dates ou références ne sont plus intactes.");
  if (changeRatio < 0.015) warnings.push("La réécriture est trop proche du texte source.");
  if (changeRatio > 0.75) warnings.push("La réécriture est très éloignée du texte source.");
  if (novelty > 0.45) warnings.push("Le vocabulaire a fortement changé : vérification du sens recommandée.");

  const qualityScore = clamp(
    anchor * 0.55 +
    clamp(changeRatio / 0.18) * 0.20 +
    clamp(novelty / 0.22) * 0.10 +
    rhythm * 0.15,
  );

  return {
    changed: a !== b,
    changeRatio,
    anchorCoverage: anchor,
    lexicalNovelty: novelty,
    sentenceRhythmChange: rhythm,
    qualityScore,
    warnings,
  };
}

/**
 * Extract likely proper names/acronyms so a rewrite can preserve them.
 * This is deliberately conservative: it is a guard, not an NER model.
 */
export function extractProtectedTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const match of text.matchAll(/\b(?:[A-ZÀ-ÖØ-Þ][\p{L}'’-]{2,}|[A-Z]{2,}(?:-[A-Z0-9]+)*)\b/gu)) {
    const value = match[0];
    if (!/^(Le|La|Les|Un|Une|Des|The|This|That|Dans|Pour|Avec|Mais|Donc|Ainsi|Il|Elle|Ils|Nous|Vous)$/.test(value)) {
      terms.add(value);
    }
  }
  return [...terms];
}

export function protectedTermCoverage(original: string, candidate: string): number {
  const terms = extractProtectedTerms(original);
  if (!terms.length) return 1;
  const lower = candidate.toLocaleLowerCase();
  const preserved = terms.filter((term) => lower.includes(term.toLocaleLowerCase())).length;
  return preserved / terms.length;
}
