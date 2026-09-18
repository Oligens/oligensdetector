/**
 * ══════════════════════════════════════════════════════════════════════════════
 *   ██████╗  ██████╗      ██╗
 *  ██╔════╝ ██╔═══██╗     ██║
 *  ██║      ██║   ██║     ██║
 *  ██║      ██║   ██║██   ██║
 *  ╚██████╗ ╚██████╔╝╚█████╔╝
 *   ╚═════╝  ╚═════╝  ╚════╝
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔬 COJ Neuro-Heuristic AI Detection Engine v3.0
 * 🧠 Advanced Text Authenticity Analysis via Multi-Dimensional Scoring
 * ⚡ Zero Dependencies | Strict Typing | Deterministic Heuristic Pipeline
 * ✍️ Author / Signature: COJ (Cleef Oligens Joseph)
 * ══════════════════════════════════════════════════════════════════════════════
 */

export interface AnalysisMetrics {
  readonly lexicalDiversity: number;
  readonly yuleIndex: number;
  readonly shannonEntropy: number;
  readonly burstiness: number;
  readonly hapaxRichness: number;
  readonly structuralUniformity: number;
  readonly hedgingDensity: number;
  readonly corporateDensity: number;
  readonly connectorDensity: number;
}

export interface SignatureReport {
  readonly patterns: readonly string[];
  readonly count: number;
  readonly density: number;
  readonly confidence: number;
}

export interface DetectionVerdict {
  readonly isAI: boolean;
  readonly confidenceScore: number;
  readonly metrics: AnalysisMetrics;
  readonly signatures: SignatureReport;
  readonly analysisTimestamp: number;
}

const safeDivide = (numerator: number, denominator: number): number => {
  if (denominator === 0 || !Number.isFinite(denominator)) return 0;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
};

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const calculateEntropy = (frequencies: readonly number[]): number => {
  if (frequencies.length === 0) return 0;
  const total = frequencies.reduce((sum, freq) => sum + freq, 0);
  if (total === 0) return 0;

  let entropy = 0;
  for (const freq of frequencies) {
    if (freq > 0) {
      const probability = freq / total;
      entropy -= probability * Math.log2(probability);
    }
  }

  const maxEntropy = Math.log2(frequencies.length);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
};

const LLM_SIGNATURE_PATTERNS: readonly RegExp[] = [
  /\b(?:artificial intelligence|machine learning|deep learning)\b/gi,
  /\b(?:furthermore|additionally|in addition)\b/gi,
  /\b(?:on the other hand|however|nevertheless)\b/gi,
  /\b(?:it is important to note that)\b/gi,
  /\b(?:in conclusion|to summarize|in summary)\b/gi,
  /\b(?:as mentioned previously|as discussed above)\b/gi,
  /\b(?:a comprehensive approach|holistic view|multi-faceted)\b/gi,
  /\b(?:leveraging synergies|paradigm shift|disruptive innovation)\b/gi,
];

const CORPORATE_JARGON: readonly string[] = [
  "synergize", "leverage", "optimize", "streamline", "facilitate",
  "empower", "strategize", "monetize", "capitalize", "pivot",
  "bandwidth", "touchbase", "deep dive", "circle back", "move the needle",
];

const HEDGING_PHRASES: readonly string[] = [
  "perhaps", "maybe", "could be", "might be", "possibly", "likely",
  "tend to", "generally", "often", "usually", "frequently", "typically",
  "in most cases", "on average", "tends to be", "appears to be",
];

const CONNECTOR_WORDS: readonly string[] = [
  "therefore", "consequently", "subsequently", "meanwhile", "furthermore",
  "moreover", "additionally", "however", "nevertheless", "nonetheless",
  "although", "despite", "regardless", "alternatively", "otherwise",
];

class QuantumTokenizer {
  static tokenize(text: string): readonly string[] {
    if (!text || typeof text !== "string") return [];
    const normalized = text.trim().replace(/\s+/g, " ");
    if (!normalized) return [];

    const sentences = normalized.split(/[.!?]+/).filter(s => s.trim());
    const tokens: string[] = [];

    for (const sentence of sentences) {
      const words = sentence
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_\s]/gu, " ")
        .split(/\s+/)
        .filter(Boolean);
      tokens.push(...words);
    }

    return tokens;
  }

  static getSentences(text: string): readonly string[] {
    if (!text || typeof text !== "string") return [];
    return text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  }
}

class HeuristicFeatureExtractor {
  static extractMetrics(tokens: readonly string[], sentences: readonly string[]): AnalysisMetrics {
    return {
      lexicalDiversity: this.calculateLexicalDiversity(tokens),
      yuleIndex: this.calculateYuleIndex(tokens),
      shannonEntropy: this.calculateShannonEntropy(tokens),
      burstiness: this.calculateBurstiness(sentences),
      hapaxRichness: this.calculateHapaxRichness(tokens),
      structuralUniformity: this.calculateStructuralUniformity(sentences),
      hedgingDensity: this.calculateDensity(tokens, HEDGING_PHRASES),
      corporateDensity: this.calculateDensity(tokens, CORPORATE_JARGON),
      connectorDensity: this.calculateDensity(tokens, CONNECTOR_WORDS),
    };
  }

  private static calculateLexicalDiversity(tokens: readonly string[]): number {
    if (!tokens.length) return 0;
    return clamp(safeDivide(new Set(tokens).size, tokens.length), 0, 1);
  }

  private static calculateYuleIndex(tokens: readonly string[]): number {
    if (!tokens.length) return 0;
    const frequencyMap = new Map<string, number>();
    for (const token of tokens) frequencyMap.set(token, (frequencyMap.get(token) || 0) + 1);
    const frequencies = Array.from(frequencyMap.values());
    if (frequencies.length <= 1) return 0;
    const sum = frequencies.reduce((acc, f) => acc + f * (f - 1), 0);
    const yuleK = (10000 * sum) / (tokens.length * (tokens.length - 1));
    return clamp(1 / (yuleK + 1), 0, 1);
  }

  private static calculateShannonEntropy(tokens: readonly string[]): number {
    if (!tokens.length) return 0;
    const frequencyMap = new Map<string, number>();
    for (const token of tokens) frequencyMap.set(token, (frequencyMap.get(token) || 0) + 1);
    return calculateEntropy(Array.from(frequencyMap.values()));
  }

  private static calculateBurstiness(sentences: readonly string[]): number {
    if (sentences.length < 2) return 0;
    const lengths = sentences.map(s => s.trim().length).filter(l => l > 0);
    if (lengths.length < 2) return 0;
    const mean = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    if (!mean) return 0;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;
    return safeDivide(Math.sqrt(variance), mean);
  }

  private static calculateHapaxRichness(tokens: readonly string[]): number {
    if (!tokens.length) return 0;
    const frequencyMap = new Map<string, number>();
    for (const token of tokens) frequencyMap.set(token, (frequencyMap.get(token) || 0) + 1);
    const hapaxCount = Array.from(frequencyMap.values()).filter(freq => freq === 1).length;
    return safeDivide(hapaxCount, tokens.length);
  }

  private static calculateStructuralUniformity(sentences: readonly string[]): number {
    if (sentences.length < 2) return 0;
    const lengths = sentences.map(s => s.trim().length).filter(l => l > 0);
    if (lengths.length < 2) return 0;
    const mean = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    if (!mean) return 0;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;
    return clamp(variance / (mean * mean), 0, 1);
  }

  private static calculateDensity(tokens: readonly string[], dictionary: readonly string[]): number {
    if (!tokens.length || !dictionary.length) return 0;
    const dictionarySet = new Set(dictionary);
    const found = tokens.filter(token => dictionarySet.has(token)).length;
    return safeDivide(found, tokens.length);
  }
}

class NeuralScoringEngine {
  static calculateConfidence(metrics: AnalysisMetrics): number {
    const scores = {
      burstiness: this.scoreBurstiness(metrics.burstiness),
      entropy: this.scoreEntropy(metrics.shannonEntropy),
      connectors: this.scoreConnectors(metrics.connectorDensity),
      ttr: this.scoreTTR(metrics.lexicalDiversity),
      hapax: this.scoreHapax(metrics.hapaxRichness),
      hedging: this.scoreHedging(metrics.hedgingDensity),
      corporate: this.scoreCorporate(metrics.corporateDensity),
      uniformity: this.scoreUniformity(metrics.structuralUniformity),
    };

    const weightedScore =
      scores.burstiness * 0.25 +
      scores.entropy * 0.15 +
      scores.connectors * 0.15 +
      scores.ttr * 0.10 +
      scores.hapax * 0.10 +
      scores.hedging * 0.10 +
      scores.corporate * 0.10 +
      scores.uniformity * 0.05;

    return clamp(weightedScore * 100, 1, 99);
  }

  private static scoreBurstiness(value: number): number { return clamp(value, 0, 1); }

  private static scoreEntropy(value: number): number {
    if (value >= 0.55 && value <= 0.80) return 0;
    if (value < 0.4 || value > 0.9) return 1;
    return 0.5;
  }

  private static scoreConnectors(value: number): number {
    if (value > 0.05) return 1;
    if (value > 0.02) return 0.7;
    return 0;
  }

  private static scoreTTR(value: number): number {
    if (value >= 0.5 && value <= 0.7) return 0;
    if (value < 0.3 || value > 0.8) return 1;
    return 0.5;
  }

  private static scoreHapax(value: number): number { return 1 - clamp(value * 3, 0, 1); }

  private static scoreHedging(value: number): number {
    if (value > 0.03) return 1;
    if (value > 0.01) return 0.7;
    return 0;
  }

  private static scoreCorporate(value: number): number {
    if (value > 0.02) return 1;
    if (value > 0.005) return 0.7;
    return 0;
  }

  private static scoreUniformity(value: number): number { return clamp(value, 0, 1); }
}

export class AIDetectionEngine {
  static analyzeText(input: unknown): DetectionVerdict {
    const text = typeof input === "string" ? input : "";
    const trimmedText = text.trim();
    if (!trimmedText) return this.createDefaultVerdict();

    const tokens = QuantumTokenizer.tokenize(trimmedText);
    const sentences = QuantumTokenizer.getSentences(trimmedText);
    const metrics = HeuristicFeatureExtractor.extractMetrics(tokens, sentences);
    const confidenceScore = NeuralScoringEngine.calculateConfidence(metrics);
    const signatures = this.extractSignatures(trimmedText);

    return {
      isAI: confidenceScore > 50,
      confidenceScore,
      metrics,
      signatures,
      analysisTimestamp: Date.now(),
    };
  }

  static quickCheck(input: unknown): [boolean, number] {
    const result = this.analyzeText(input);
    return [result.isAI, result.confidenceScore];
  }

  static getMetrics(input: unknown): AnalysisMetrics {
    const text = typeof input === "string" ? input.trim() : "";
    if (!text) return this.getDefaultMetrics();
    return HeuristicFeatureExtractor.extractMetrics(
      QuantumTokenizer.tokenize(text),
      QuantumTokenizer.getSentences(text),
    );
  }

  static getSignatures(input: unknown): SignatureReport {
    const text = typeof input === "string" ? input.trim() : "";
    if (!text) return { patterns: [], count: 0, density: 0, confidence: 0 };
    return this.extractSignatures(text);
  }

  private static createDefaultVerdict(): DetectionVerdict {
    return {
      isAI: false,
      confidenceScore: 50,
      metrics: this.getDefaultMetrics(),
      signatures: { patterns: [], count: 0, density: 0, confidence: 0 },
      analysisTimestamp: Date.now(),
    };
  }

  private static getDefaultMetrics(): AnalysisMetrics {
    return {
      lexicalDiversity: 0,
      yuleIndex: 0,
      shannonEntropy: 0,
      burstiness: 0,
      hapaxRichness: 0,
      structuralUniformity: 0,
      hedgingDensity: 0,
      corporateDensity: 0,
      connectorDensity: 0,
    };
  }

  private static extractSignatures(text: string): SignatureReport {
    const allMatches: string[] = [];
    for (const pattern of LLM_SIGNATURE_PATTERNS) allMatches.push(...(text.match(pattern) || []));
    const uniquePatterns = Array.from(new Set(allMatches));
    const density = safeDivide(uniquePatterns.length, text.split(/\s+/).filter(Boolean).length);
    return {
      patterns: uniquePatterns,
      count: uniquePatterns.length,
      density,
      confidence: clamp(density * 100, 0, 100),
    };
  }
}

export const analyzeText = AIDetectionEngine.analyzeText.bind(AIDetectionEngine);
export const quickCheck = AIDetectionEngine.quickCheck.bind(AIDetectionEngine);
export const getMetrics = AIDetectionEngine.getMetrics.bind(AIDetectionEngine);
export const getSignatures = AIDetectionEngine.getSignatures.bind(AIDetectionEngine);

/**
 * Compatibility adapter for the existing Oligens Detector API.
 * The COJ engine above is the only detection implementation used here.
 */
export interface PythonDetectorFeatures {
  signatureScore: number;
  entropyDiversityIndex: number;
  verbDiversity: number;
  hedgingPhrases: number;
  transitionMarkers: number;
  repetitionPatterns: number;
  avgSentenceComplexity: number;
  punctuationVariability: number;
  overallAiProbability: number;
  signatureHits: Record<string, number>;
}

export interface PythonDetectorResult {
  score: number;
  probability: number;
  features: PythonDetectorFeatures;
  engine: "coj-neuro-heuristic-typescript";
}

const countHits = (text: string, phrases: readonly string[]): number => {
  const lower = text.toLocaleLowerCase();
  return phrases.reduce((total, phrase) => {
    const escaped = phrase.replace(/[.*+?^{}()|[\]\\]/g, "\\$&");
    return total + (lower.match(new RegExp(`\\b${escaped}\\b`, "gu"))?.length ?? 0);
  }, 0);
};

export function runPythonDetectorPort(text: string): PythonDetectorResult {
  const verdict = AIDetectionEngine.analyzeText(text);
  const metrics = verdict.metrics;
  const signatures = verdict.signatures;
  const tokenCount = QuantumTokenizer.tokenize(text).length;
  const sentenceList = QuantumTokenizer.getSentences(text);
  const signatureHits = { coj: signatures.count };

  // Convert the COJ engine's native metrics to the existing API feature contract.
  const features: PythonDetectorFeatures = {
    signatureScore: signatures.confidence,
    entropyDiversityIndex: clamp(metrics.shannonEntropy * 100),
    verbDiversity: clamp(metrics.lexicalDiversity * 100),
    hedgingPhrases: clamp(metrics.hedgingDensity * 1000),
    transitionMarkers: clamp(metrics.connectorDensity * 1000),
    repetitionPatterns: clamp((1 - metrics.lexicalDiversity) * 100),
    avgSentenceComplexity: sentenceList.length ? clamp((tokenCount / sentenceList.length) * 3.5) : 0,
    punctuationVariability: clamp(metrics.burstiness * 100),
    overallAiProbability: verdict.confidenceScore,
    signatureHits,
  };

  return {
    score: Math.round(verdict.confidenceScore),
    probability: verdict.confidenceScore / 100,
    features,
    engine: "coj-neuro-heuristic-typescript",
  };
}
