export interface FinalAiScoreMetrics {
  vocabularyDiversity: number;
  originalityScore: number;
  oligensMlSignal: number;
  plagiarismRate: number;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Canonical Oligens AI-score aggregation. Plagiarism remains independent. */
export function computeFinalAiScore(metrics: FinalAiScoreMetrics): number {
  const vocabularyDiversity = clamp(metrics.vocabularyDiversity, -1, 1);
  const originalityScore = clamp(metrics.originalityScore, -1, 1);
  const oligensMlSignal = clamp(metrics.oligensMlSignal, 0, 1);

  const vocabWeight = Math.abs(Math.min(0, vocabularyDiversity)) * 40;
  const originalityWeight = Math.abs(Math.min(0, originalityScore)) * 40;
  const mlWeight = oligensMlSignal * 20;
  let score = vocabWeight + originalityWeight + mlWeight;

  // Hard business rule: a strong negative stylometric signal cannot be diluted.
  if (originalityScore <= -0.80 || vocabularyDiversity <= -0.80) score = Math.max(score, 85);
  return Math.min(Math.round(score), 100);
}
