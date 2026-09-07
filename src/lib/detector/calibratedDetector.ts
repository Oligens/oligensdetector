import { FeatureExtractor, countWords, type Features, type HeuristicResult } from "./heuristicEngine";
import { computeCorrectedOriginality, computeStructuralSignals } from "./structuralSignals";

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const scale = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo));

/**
 * Oligens calibration v3.
 *
 * Important: this is an evidence score, not an authorship proof. The previous
 * implementation deliberately pulled every long document toward 50%, which
 * made natural writing look suspicious even when there was little positive AI
 * evidence. The new calibration starts from a low prior and only moves upward
 * when several independent signals agree.
 */
export function analyzeCalibrated(text: string, genre = "generic"): HeuristicResult & { features: Features } {
  const clean = text.replace(/\s+/g, " ").trim();
  const words = countWords(clean);
  const features = new FeatureExtractor(clean).extractAll();
  features.scoreOriginalite = computeCorrectedOriginality(clean);
  const structural = computeStructuralSignals(clean);

  if (!words) {
    return {
      probabilite_IA: 0,
      intervalle_confiance_95: [0, 0],
      confiance_analyse: "Faible",
      genre_detecte: genre,
      rapport_detaille: [],
      decision_precaution: "Aucun texte à analyser.",
      features,
    };
  }

  // Positive AI evidence. Template phrases and repeated standardized
  // transitions are useful, but neither is allowed to dominate alone.
  const template = features.scoreExpressionsIA;
  const repetition = scale(features.yulesK, 10, 34);
  const regularity = scale(0.58 - features.burstiness, 0, 0.42);
  const startRegularity = scale(1.65 - features.diversiteDebutsPhrase, 0, 1.65);
  const similarity = scale(features.similariteInterPhrases, 0.16, 0.55);
  const styleUniformity = scale(0.22 - features.uniformiteStyle, 0, 0.22);
  const standardTransitions = scale(features.tauxTransitionStandard, 0.02, 0.085);
  const lowOriginality = scale(0.72 - features.scoreOriginalite, 0, 0.72);

  const aiEvidence = clamp(
    template * 0.34 +
      repetition * 0.10 +
      regularity * 0.10 +
      startRegularity * 0.07 +
      similarity * 0.09 +
      styleUniformity * 0.07 +
      standardTransitions * 0.08 +
      lowOriginality * 0.05 +
      structural.score * 0.10
  );

  // Counter-evidence prevents a single formal phrase from becoming a high
  // score on an otherwise varied, original text.
  const lexicalDiversity = scale(features.mattr, 0.55, 0.86);
  const hapaxDiversity = scale(features.hapaxLegomena, 0.20, 0.55);
  const rhythmVariation = scale(features.burstiness, 0.26, 1.05);
  const startDiversity = scale(features.diversiteDebutsPhrase, 1.0, 3.1);
  const punctuationVariation = scale(features.variancePonctuation, 0.08, 1.05);
  const originality = scale(features.scoreOriginalite, 0.52, 0.96);

  const humanEvidence = clamp(
    lexicalDiversity * 0.22 +
      hapaxDiversity * 0.17 +
      rhythmVariation * 0.20 +
      startDiversity * 0.14 +
      punctuationVariation * 0.08 +
      originality * 0.19
  );

  // Base prior is intentionally below 50%. A neutral text should not be
  // labelled 50% AI simply because the classifier is uncertain.
  const raw = clamp(0.10 + aiEvidence * 0.92 - humanEvidence * 0.54);

  // Short texts must remain conservative. Long texts get more confidence, but
  // confidence never manufactures evidence.
  const lengthConfidence = clamp((words - 120) / 900, 0, 1);
  const evidenceStrength = clamp(Math.abs(aiEvidence - humanEvidence) * 1.8 + 0.18);
  const confidence = clamp(0.25 + lengthConfidence * 0.55 + evidenceStrength * 0.20, 0.25, 1);
  const probability = clamp(0.18 + (raw - 0.18) * confidence);

  const uncertainty = clamp(0.24 - confidence * 0.14, 0.08, 0.24);
  const intervalle_confiance_95: [number, number] = [
    clamp(probability - uncertainty),
    clamp(probability + uncertainty),
  ];

  const confiance_analyse: HeuristicResult["confiance_analyse"] =
    words < 250 ? "Faible" : words < 800 ? "Moyenne" : confidence >= 0.72 ? "Élevée" : "Moyenne";

  const contributions = [
    { nom: "Expressions standardisées", z_score: template, contribution: template * 0.34 },
    { nom: "Répétition lexicale", z_score: repetition, contribution: repetition * 0.10 },
    { nom: "Rythme régulier", z_score: regularity, contribution: regularity * 0.10 },
    { nom: "Similarité entre phrases", z_score: similarity, contribution: similarity * 0.09 },
    { nom: "Transitions standardisées", z_score: standardTransitions, contribution: standardTransitions * 0.08 },
    { nom: "Diversité du vocabulaire", z_score: -lexicalDiversity, contribution: -lexicalDiversity * 0.22 },
    { nom: "Variation des longueurs", z_score: -rhythmVariation, contribution: -rhythmVariation * 0.20 },
    { nom: "Originalité des formulations", z_score: -originality, contribution: -originality * 0.19 },
    ...structural.signals.slice(0, 4).map((s) => ({
      nom: s.name,
      z_score: s.count,
      contribution: s.contribution * 0.10,
    })),
  ].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 8);

  let decision_precaution: string;
  if (probability >= 0.78 && aiEvidence >= 0.55) {
    decision_precaution = "Plusieurs indices indépendants sont compatibles avec une génération automatisée. Résultat à interpréter avec prudence.";
  } else if (probability >= 0.55) {
    decision_precaution = "Quelques indices sont présents, mais ils ne suffisent pas à conclure seuls. Une vérification humaine reste recommandée.";
  } else if (probability <= 0.25 && humanEvidence >= 0.45) {
    decision_precaution = "Le texte présente surtout des caractéristiques compatibles avec une rédaction naturelle. Ce résultat n'est pas une preuve d'auteur humain.";
  } else {
    decision_precaution = "Le résultat est intermédiaire : les indices disponibles ne permettent pas de conclure avec certitude.";
  }

  return {
    probabilite_IA: Number(probability.toFixed(4)),
    intervalle_confiance_95,
    confiance_analyse,
    genre_detecte: genre,
    rapport_detaille: contributions,
    decision_precaution,
    features,
  };
}
