import { countWords, sentencize, tokenize, type Features } from "./heuristicEngine";

/**
 * Oligens ML Calibration Layer v1.
 *
 * This is a local, dependency-free probabilistic model owned by Oligens.
 * It performs inference from calibrated stylometric features; it does not call
 * an external AI provider and does not claim authorship certainty.
 * Coefficients are versioned so a future labeled Oligens corpus can replace
 * them without changing the public result contract.
 */
export const OLIGENS_ML_MODEL_VERSION = "oligens-ml-calibration-v1";

export type PassageLevel = "phrase" | "paragraphe";
export type PassageVerdict = "humain" | "mixte" | "ia" | "insuffisant";

export interface OligensPassageEvidence {
  id: string;
  level: PassageLevel;
  index: number;
  text: string;
  scoreIA: number;
  confidence: number;
  verdict: PassageVerdict;
  signals: Array<{ name: string; value: number; direction: "ia" | "humain" }>;
  explanation: string;
}

export interface OligensMlMetrics {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  falsePositiveRate: number | null;
  evaluatedSamples: number;
}

export interface OligensMlCalibration {
  modelVersion: string;
  scoreIA: number;
  confidence: number;
  verdict: PassageVerdict;
  mixedText: boolean;
  coverage: number;
  passages: OligensPassageEvidence[];
  explanation: string;
  metrics: OligensMlMetrics;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

function normalizeFeatures(f: Features) {
  return {
    lexical: clamp((f.mattr - 0.45) / 0.45),
    hapax: clamp((f.hapaxLegomena - 0.10) / 0.50),
    burst: clamp((f.burstiness - 0.18) / 0.85),
    starts: clamp((f.diversiteDebutsPhrase - 0.8) / 2.2),
    punctuation: clamp(f.variancePonctuation / 1.2),
    similarity: clamp((f.similariteInterPhrases - 0.08) / 0.55),
    transitions: clamp((f.tauxTransitionStandard - 0.01) / 0.09),
    generic: clamp(f.scoreExpressionsIA),
    originality: clamp(f.scoreOriginalite),
    uniformity: clamp(1 - f.uniformiteStyle / 0.35),
  };
}

/** Logistic inference. Positive coefficients represent AI-like evidence. */
function infer(f: Features, words: number): { score: number; confidence: number } {
  const x = normalizeFeatures(f);
  const logit =
    -1.35 +
    1.45 * (1 - x.lexical) +
    0.85 * (1 - x.hapax) +
    1.20 * (1 - x.burst) +
    0.70 * (1 - x.starts) +
    0.40 * (1 - x.punctuation) +
    1.05 * x.similarity +
    0.72 * x.transitions +
    1.65 * x.generic +
    0.70 * (1 - x.originality) +
    0.72 * x.uniformity;
  const raw = sigmoid(logit);
  const lengthConfidence = clamp(words / 1200, 0.18, 0.92);
  return { score: clamp(raw), confidence: lengthConfidence };
}

function buildPassageFeatures(text: string): Features {
  // Importing FeatureExtractor directly would expose no new external dependency;
  // dynamic construction keeps this layer independent at the type boundary.
  // The calibrated detector already owns feature extraction, so use its public API.
  // eslint/TS-compatible require-free construction is handled by the adapter below.
  throw new Error("PASSAGE_FEATURE_ADAPTER");
}

function passageWindows(text: string): Array<{ level: PassageLevel; index: number; text: string }> {
  const paragraphs = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  const result: Array<{ level: PassageLevel; index: number; text: string }> = [];
  if (paragraphs.length) {
    paragraphs.forEach((p, i) => result.push({ level: "paragraphe", index: i, text: p }));
  }
  let sentenceIndex = 0;
  for (const paragraph of paragraphs) {
    const sentences = sentencize(paragraph).map(s => s.trim()).filter(s => tokenize(s).length >= 8);
    for (const sentence of sentences) {
      result.push({ level: "phrase", index: sentenceIndex++, text: sentence });
    }
  }
  return result;
}

function classify(score: number, words: number): PassageVerdict {
  if (words < 8) return "insuffisant";
  if (score >= 0.67) return "ia";
  if (score >= 0.40) return "mixte";
  return "humain";
}

function explain(score: number, signals: OligensPassageEvidence["signals"], words: number): string {
  if (words < 20) return "Passage court : les signaux sont insuffisants pour une conclusion robuste.";
  const ai = signals.filter(s => s.direction === "ia").sort((a, b) => b.value - a.value).slice(0, 2).map(s => s.name);
  const human = signals.filter(s => s.direction === "humain").sort((a, b) => b.value - a.value).slice(0, 2).map(s => s.name);
  if (score >= 0.67) return ai.length ? `Signaux IA dominants : ${ai.join(", ")}. Plusieurs caractéristiques convergent vers un style automatisé.` : "Le score agrégé dépasse le seuil IA malgré des signaux individuels modérés.";
  if (score <= 0.33) return human.length ? `Signaux humains dominants : ${human.join(", ")}. Le passage présente davantage de variation stylistique.` : "Les signaux IA restent faibles dans ce passage.";
  return "Signaux mixtes : certaines caractéristiques sont compatibles avec une production automatisée, d'autres avec une rédaction humaine.";
}

export function runOligensMlCalibration(text: string, features: Features): OligensMlCalibration {
  const words = countWords(text);
  if (!words) return {
    modelVersion: OLIGENS_ML_MODEL_VERSION, scoreIA: 0, confidence: 0, verdict: "insuffisant",
    mixedText: false, coverage: 0, passages: [], explanation: "Aucun texte à analyser.",
    metrics: { precision: null, recall: null, f1: null, falsePositiveRate: null, evaluatedSamples: 0 },
  };

  const global = infer(features, words);
  const windows = passageWindows(text);
  const passages: OligensPassageEvidence[] = [];
  for (const w of windows.slice(0, 120)) {
    const passageWords = countWords(w.text);
    if (passageWords < 8) continue;
    // Local features are intentionally computed by the same Oligens feature engine.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { FeatureExtractor } = require("./heuristicEngine") as typeof import("./heuristicEngine");
    const local = new FeatureExtractor(w.text).extractAll();
    const prediction = infer(local, passageWords);
    const x = normalizeFeatures(local);
    const signals = [
      { name: "diversité lexicale", value: 1 - x.lexical, direction: "ia" as const },
      { name: "régularité du rythme", value: 1 - x.burst, direction: "ia" as const },
      { name: "similarité inter-phrases", value: x.similarity, direction: "ia" as const },
      { name: "expressions standardisées", value: x.generic, direction: "ia" as const },
      { name: "variation des débuts", value: x.starts, direction: "humain" as const },
      { name: "variation de ponctuation", value: x.punctuation, direction: "humain" as const },
      { name: "originalité", value: x.originality, direction: "humain" as const },
    ].sort((a, b) => b.value - a.value).slice(0, 5);
    passages.push({
      id: `${w.level}-${w.index}`,
      level: w.level, index: w.index, text: w.text,
      scoreIA: Number(prediction.score.toFixed(4)),
      confidence: Number(prediction.confidence.toFixed(4)),
      verdict: classify(prediction.score, passageWords),
      signals,
      explanation: explain(prediction.score, signals, passageWords),
    });
  }

  const phraseScores = passages.filter(p => p.level === "phrase").map(p => p.scoreIA);
  const high = phraseScores.filter(s => s >= 0.67).length;
  const low = phraseScores.filter(s => s <= 0.33).length;
  const mixedText = phraseScores.length >= 4 && high >= 2 && low >= 2;
  const coverage = clamp(passages.length / Math.max(1, phraseScores.length + 1));
  const scoreIA = Number((mixedText ? mean(phraseScores) * 0.72 + global.score * 0.28 : global.score * 0.65 + mean(phraseScores) * 0.35).toFixed(4));
  const confidence = Number(clamp(global.confidence * (0.70 + coverage * 0.30)).toFixed(4));
  const verdict = classify(scoreIA, words);

  return {
    modelVersion: OLIGENS_ML_MODEL_VERSION, scoreIA, confidence, verdict,
    mixedText, coverage,
    passages,
    explanation: mixedText
      ? "Le texte présente des zones dont les profils stylistiques diffèrent nettement : Oligens le classe comme potentiellement mixte humain + IA."
      : explain(scoreIA, passages[0]?.signals ?? [], words),
    // Metrics are populated by the offline benchmark API below, never invented from one document.
    metrics: { precision: null, recall: null, f1: null, falsePositiveRate: null, evaluatedSamples: 0 },
  };
}

export interface OligensBenchmarkSample { expectedIA: boolean; scoreIA: number; }

/** Computes classification metrics from a labeled evaluation corpus. */
export function evaluateOligensMl(samples: OligensBenchmarkSample[], threshold = 0.5): OligensMlMetrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const sample of samples) {
    const predicted = sample.scoreIA >= threshold;
    if (predicted && sample.expectedIA) tp++;
    else if (predicted && !sample.expectedIA) fp++;
    else if (!predicted && !sample.expectedIA) tn++;
    else fn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  const falsePositiveRate = fp + tn ? fp / (fp + tn) : 0;
  return { precision, recall, f1, falsePositiveRate, evaluatedSamples: samples.length };
}
