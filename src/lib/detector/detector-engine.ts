export interface FinalAiScoreMetrics {
  vocabularyDiversity: number; // -1.0 à 1.0
  originalityScore: number; // -1.0 à 1.0
  oligensMlSignal: number; // 0.0 à 1.0
  plagiarismRate: number; // 0 à 100%
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * Authoritative AI score aggregation.
 * Plagiarism is deliberately not an AI signal here: it is retained as an
 * independent metric and must never dilute strong Oligens stylometric evidence.
 */
export function computeFinalAiScore(metrics: FinalAiScoreMetrics): number {
  const vocabularyDiversity = clamp(metrics.vocabularyDiversity, -1, 1);
  const originalityScore = clamp(metrics.originalityScore, -1, 1);
  const oligensMlSignal = clamp(metrics.oligensMlSignal, 0, 1);

  const vocabWeight = Math.abs(Math.min(0, vocabularyDiversity)) * 40;
  const originalityWeight = Math.abs(Math.min(0, originalityScore)) * 40;
  const mlWeight = oligensMlSignal * 20;

  let score = vocabWeight + originalityWeight + mlWeight;

  // Dominant stylometric override: strong convergence cannot be diluted by
  // factual dates, quotations or low plagiarism scores.
  if (originalityScore <= -0.90 || vocabularyDiversity <= -0.85) {
    score = Math.max(score, 80);
  }

  return Math.min(Math.round(score), 100);
}
