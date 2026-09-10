/**
 * Oligens Advanced Detection Engine
 *
 * Dependency-free signals designed from general NLP/stylometry principles.
 * This is an original implementation; it does not reproduce any vendor's
 * proprietary model. Scores are evidence, not proof of authorship.
 */

export type DetectionLanguage = "fr" | "en" | "ht" | "unknown";

export interface AdvancedSignals {
  language: DetectionLanguage;
  wordCount: number;
  sentenceCount: number;
  lexicalEntropy: number;
  typeTokenRatio: number;
  hapaxRatio: number;
  sentenceLengthCV: number;
  sentenceLengthMean: number;
  punctuationEntropy: number;
  punctuationCV: number;
  repeatedBigramRatio: number;
  repeatedTrigramRatio: number;
  paragraphUniformity: number;
  transitionDensity: number;
  genericPhraseDensity: number;
  functionWordUniformity: number;
  characterEntropy: number;
  digitPatternRatio: number;
  quoteRatio: number;
  structuralRegularity: number;
  semanticProxy: number;
  aiEvidence: number;
  humanEvidence: number;
  confidence: number;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const words = (text: string) => text.toLocaleLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
const sentences = (text: string) => text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map(s => s.trim()).filter(Boolean) ?? [];
const paragraphs = (text: string) => text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);

const FR = new Set("le la les un une des de du au aux ce cet cette ces et ou mais donc car que qui dont où en y dans par pour sur sous avec sans entre chez comme quand lorsque puisque si afin est sont être avoir il elle ils elles on nous vous je me te se ne pas plus très aussi encore déjà cela ça leur leurs mon ma mes ton ta tes son sa ses notre votre vos".split(" "));
const EN = new Set("the a an of to in on for with from by and or but so because that which who when where if while as is are was were be been being have has had do does did not no more very also this these those it he she they we you i me my your his her our their".split(" "));
const HT = new Set("ak an ap avèk avan bay byen de depi e en epi eske et pou nan sou san se sa si yon yo li nou mwen ou pa plis anpil kòm lè ki gen genyen te pral ka men pouke paske".split(" "));
const TRANSITIONS = new Set("cependant néanmoins toutefois ainsi donc pourtant par conséquent en effet de plus en outre notamment finalement en conclusion premièrement deuxièmement d'une part d'autre part moreover furthermore nevertheless therefore however consequently additionally in conclusion first second on the other hand".toLocaleLowerCase().split(/\s+/));
const GENERIC = [
  "il est important de noter", "il convient de souligner", "il est essentiel de comprendre",
  "dans ce contexte", "de manière générale", "il est nécessaire de", "il est recommandé de",
  "il est intéressant de constater", "en ce qui concerne", "cette approche permet",
  "it is important to note", "it should be noted", "in this context", "more generally",
  "it is essential to understand", "this approach allows", "plays a crucial role",
];

function entropy(values: string[]): number {
  if (!values.length) return 0;
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) { const p = n / values.length; h -= p * Math.log2(p); }
  const max = Math.log2(Math.max(2, freq.size));
  return max ? clamp(h / max) : 0;
}

function cv(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a,b) => a+b, 0) / values.length;
  if (!mean) return 0;
  const variance = values.reduce((a,b) => a + (b-mean)**2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function ngramRepeatRatio(tokens: string[], n: number): number {
  if (tokens.length < n + 1) return 0;
  const counts = new Map<string, number>();
  for (let i=0;i<=tokens.length-n;i++) {
    const key = tokens.slice(i,i+n).join(" ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let repeated = 0;
  for (const count of counts.values()) if (count > 1) repeated += count;
  return clamp(repeated / Math.max(1, tokens.length-n+1));
}

function detectLanguage(ws: string[]): DetectionLanguage {
  if (!ws.length) return "unknown";
  const scores: Array<[DetectionLanguage, number]> = [
    ["fr", ws.filter(w => FR.has(w)).length],
    ["en", ws.filter(w => EN.has(w)).length],
    ["ht", ws.filter(w => HT.has(w)).length],
  ];
  scores.sort((a,b) => b[1]-a[1]);
  return scores[0][1] < Math.max(2, ws.length * 0.015) ? "unknown" : scores[0][0];
}

function genericDensity(text: string, count: number): number {
  if (!count) return 0;
  const lower = text.toLocaleLowerCase();
  let hits = 0;
  for (const phrase of GENERIC) {
    let at = lower.indexOf(phrase);
    while (at >= 0) { hits++; at = lower.indexOf(phrase, at + phrase.length); }
  }
  return clamp(hits / Math.max(1, count / 2));
}

export function extractAdvancedSignals(text: string): AdvancedSignals {
  const ws = words(text);
  const ss = sentences(text);
  const ps = paragraphs(text);
  const wc = ws.length;
  const lengths = ss.map(s => words(s).length).filter(Boolean);
  const punctuation = [...text.matchAll(/[.,;:!?()[\]{}"'—–-]/g)].map(m => m[0]);
  const chars = [...text.toLocaleLowerCase()].filter(c => /\S/u.test(c));
  const unique = new Set(ws).size;
  const hapax = (() => { const f = new Map<string,number>(); for (const w of ws) f.set(w,(f.get(w)??0)+1); return [...f.values()].filter(n=>n===1).length; })();
  const paragraphLengths = ps.map(p => words(p).length).filter(Boolean);
  const starts = ss.map(s => words(s).slice(0,2).join(" ")).filter(Boolean);
  const transitionHits = ws.filter(w => TRANSITIONS.has(w)).length;
  const functionWords = ws.filter(w => FR.has(w) || EN.has(w) || HT.has(w));
  const digitPatternRatio = wc ? clamp((text.match(/\b\d+(?:[.,]\d+)?%?\b/g)?.length ?? 0) / wc * 4) : 0;
  const quoteRatio = clamp((text.match(/["“”«»]/g)?.length ?? 0) / Math.max(1, text.length) * 20);
  const punctuationCounts = ss.map(s => (s.match(/[.,;:!?]/g) ?? []).length);
  const structural = clamp(
    (1 - clamp(cv(lengths) / 0.85)) * 0.42 +
    (1 - clamp(cv(paragraphLengths) / 1.1)) * 0.25 +
    (1 - entropy(starts)) * 0.18 +
    (1 - clamp(cv(punctuationCounts) / 1.5)) * 0.15,
  );
  const lexicalEntropy = entropy(ws);
  const typeTokenRatio = wc ? unique / wc : 0;
  const functionUniformity = wc ? clamp((functionWords.length / wc) * 1.6) : 0;
  const repeatedBigramRatio = ngramRepeatRatio(ws,2);
  const repeatedTrigramRatio = ngramRepeatRatio(ws,3);
  const paragraphUniformity = 1 - clamp(cv(paragraphLengths) / 1.1);
  const transitionDensity = wc ? clamp(transitionHits / wc * 8) : 0;
  const genericPhraseDensity = genericDensity(text, wc);
  const characterEntropy = entropy(chars);
  const punctuationEntropy = entropy(punctuation);
  const punctuationCV = cv(punctuationCounts);
  const semanticProxy = ss.length > 1 ? clamp((1 - clamp(cv(lengths)/0.9))*0.5 + (1-entropy(starts))*0.5) : 0;

  const aiEvidence = clamp(
    (1 - clamp(typeTokenRatio / 0.72)) * 0.12 +
    (1 - clamp(cv(lengths) / 0.80)) * 0.18 +
    (1 - lexicalEntropy) * 0.08 +
    (1 - punctuationEntropy) * 0.07 +
    repeatedBigramRatio * 0.10 +
    repeatedTrigramRatio * 0.08 +
    structural * 0.15 +
    transitionDensity * 0.07 +
    genericPhraseDensity * 0.10 +
    functionUniformity * 0.05,
  );
  const humanEvidence = clamp(
    clamp(typeTokenRatio / 0.55) * 0.18 +
    clamp(cv(lengths) / 0.55) * 0.20 +
    lexicalEntropy * 0.16 +
    punctuationEntropy * 0.08 +
    (1 - structural) * 0.15 +
    (1 - repeatedBigramRatio) * 0.08 +
    (1 - genericPhraseDensity) * 0.08 +
    (1 - functionUniformity) * 0.07,
  );
  const confidence = clamp(0.18 + clamp(wc / 1200) * 0.52 + Math.abs(aiEvidence-humanEvidence)*0.30);

  return {
    language: detectLanguage(ws), wordCount: wc, sentenceCount: ss.length,
    lexicalEntropy, typeTokenRatio, hapaxRatio: wc ? hapax/wc : 0,
    sentenceLengthCV: cv(lengths), sentenceLengthMean: lengths.length ? lengths.reduce((a,b)=>a+b,0)/lengths.length : 0,
    punctuationEntropy, punctuationCV, repeatedBigramRatio, repeatedTrigramRatio,
    paragraphUniformity, transitionDensity, genericPhraseDensity, functionWordUniformity: functionUniformity,
    characterEntropy, digitPatternRatio, quoteRatio, structuralRegularity: structural,
    semanticProxy, aiEvidence, humanEvidence, confidence,
  };
}

export interface OligensConsensus {
  score: number;
  confidence: number;
  verdict: "human" | "mixed" | "ai" | "insufficient";
  signals: AdvancedSignals;
}

export function runOligensConsensus(text: string): OligensConsensus {
  const signals = extractAdvancedSignals(text);
  if (signals.wordCount < 30) return { score: 0, confidence: 0.12, verdict: "insufficient", signals };
  const net = signals.aiEvidence - signals.humanEvidence;
  const score = clamp(0.5 + net * 0.72);
  const confidence = signals.confidence;
  const verdict = score >= 0.64 ? "ai" : score <= 0.36 ? "human" : "mixed";
  return { score, confidence, verdict, signals };
}
