import { FeatureExtractor, countWords, type Features, type HeuristicResult } from "./heuristicEngine";
import { computeCorrectedOriginality, computeStructuralSignals } from "./structuralSignals";
import { evidenceConfidence, lengthConfidence } from "../ai/innovationLayer";

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const scale = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo));

/**
 * Oligens Detector V4: evidence-based calibration.
 * Human-like characteristics are supporting evidence, never a reason to erase
 * strong, independent AI-like evidence. 0% is reserved for empty input.
 */
export function analyzeCalibrated(text: string, genre = "generic"): HeuristicResult & { features: Features } {
  const clean = text.replace(/\s+/g, " ").trim();
  const words = countWords(clean);
  const features = new FeatureExtractor(clean).extractAll();
  features.scoreOriginalite = computeCorrectedOriginality(clean);
  const structural = computeStructuralSignals(clean);

  if (!words) return {
    probabilite_IA: 0, intervalle_confiance_95: [0, 0], confiance_analyse: "Faible",
    genre_detecte: genre, rapport_detaille: [], decision_precaution: "Aucun texte à analyser.", features,
  };

  const template = features.scoreExpressionsIA;
  const repetition = scale(features.yulesK, 12, 34);
  const regularity = scale(0.52 - features.burstiness, 0, 0.40);
  const startRegularity = scale(1.55 - features.diversiteDebutsPhrase, 0, 1.55);
  const similarity = scale(features.similariteInterPhrases, 0.18, 0.56);
  const styleUniformity = scale(0.20 - features.uniformiteStyle, 0, 0.20);
  const standardTransitions = scale(features.tauxTransitionStandard, 0.025, 0.085);
  const lowOriginality = scale(0.68 - features.scoreOriginalite, 0, 0.68);

  const aiEvidence = clamp(
    template * 0.30 + structural.score * 0.18 + repetition * 0.10 +
    regularity * 0.09 + similarity * 0.08 + startRegularity * 0.07 +
    styleUniformity * 0.06 + standardTransitions * 0.06 + lowOriginality * 0.06,
  );

  const lexicalDiversity = scale(features.mattr, 0.56, 0.86);
  const hapaxDiversity = scale(features.hapaxLegomena, 0.20, 0.55);
  const rhythmVariation = scale(features.burstiness, 0.25, 1.00);
  const startDiversity = scale(features.diversiteDebutsPhrase, 1.0, 3.0);
  const punctuationVariation = scale(features.variancePonctuation, 0.08, 1.00);
  const originality = scale(features.scoreOriginalite, 0.52, 0.96);

  const humanEvidence = clamp(
    lexicalDiversity * 0.24 + hapaxDiversity * 0.16 + rhythmVariation * 0.22 +
    startDiversity * 0.13 + punctuationVariation * 0.07 + originality * 0.18,
  );

  const signalFlags = [
    template >= 0.30,
    structural.score >= 0.28,
    repetition >= 0.68,
    regularity >= 0.68,
    similarity >= 0.70,
    styleUniformity >= 0.70,
    standardTransitions >= 0.72,
  ];
  const strongSignals = signalFlags.filter(Boolean).length;

  const formalGenre = /academic|académique|scientific|scientifique|legal|juridique|administratif|administrative|report|rapport/i.test(genre);
  const prior = formalGenre ? 0.035 : 0.045;

  // Base estimate. Human evidence can reduce an estimate, but only after the
  // independent AI evidence has been measured.
  const raw = clamp(prior + aiEvidence * 0.92 - humanEvidence * (formalGenre ? 0.30 : 0.32));
  let probability = raw;

  // Strong multi-signal convergence is more informative than a single
  // human-looking characteristic. These floors prevent the previous failure
  // mode where an actually AI-like document was reported as 1-3% AI.
  if (strongSignals >= 5 && aiEvidence >= 0.52) probability = Math.max(probability, 0.78);
  else if (strongSignals >= 4 && aiEvidence >= 0.46) probability = Math.max(probability, 0.68);
  else if (strongSignals >= 3 && aiEvidence >= 0.40) probability = Math.max(probability, 0.52);
  else if (strongSignals === 2) probability = Math.min(probability, 0.62);
  else if (strongSignals === 1) probability = Math.min(probability, 0.34);
  else probability = Math.min(probability, 0.18);

  if (template < 0.18 && structural.score < 0.20 && aiEvidence < 0.42) {
    probability = Math.min(probability, 0.28);
  }

  probability = clamp(probability, 0.01, 1);

  const length = lengthConfidence(words);
  const agreement = strongSignals / signalFlags.length;
  const confidence = evidenceConfidence(words, agreement, Math.max(1, strongSignals));
  const evidenceStrength = clamp(Math.abs(aiEvidence - humanEvidence) * 1.7 + 0.18);
  const blendedConfidence = clamp(confidence * 0.76 + length * 0.14 + evidenceStrength * 0.10, 0.20, 1);

  // Confidence is allowed to reduce uncertain estimates, but never below the
  // evidence floor established above when several independent AI signals agree.
  const evidenceFloor = strongSignals >= 5 && aiEvidence >= 0.52
    ? 0.78
    : strongSignals >= 4 && aiEvidence >= 0.46
      ? 0.68
      : strongSignals >= 3 && aiEvidence >= 0.40
        ? 0.52
        : 0.01;
  probability = strongSignals >= 3
    ? Math.max(evidenceFloor, 0.01 + (probability - 0.01) * blendedConfidence)
    : clamp(0.01 + (probability - 0.01) * blendedConfidence, 0.01, 1);

  const uncertainty = clamp(0.24 - confidence * 0.14, 0.07, 0.24);
  const intervalle_confiance_95: [number, number] = [clamp(probability - uncertainty), clamp(probability + uncertainty)];
  const confiance_analyse: HeuristicResult["confiance_analyse"] =
    words < 250 ? "Faible" : words < 800 ? "Moyenne" : confidence >= 0.72 ? "Élevée" : "Moyenne";

  const contributions = [
    { nom: "Expressions standardisées", z_score: template, contribution: template * 0.30 },
    { nom: "Structures discursives", z_score: structural.score, contribution: structural.score * 0.18 },
    { nom: "Répétition lexicale", z_score: repetition, contribution: repetition * 0.10 },
    { nom: "Rythme très régulier", z_score: regularity, contribution: regularity * 0.09 },
    { nom: "Similarité entre phrases", z_score: similarity, contribution: similarity * 0.08 },
    { nom: "Diversité du vocabulaire", z_score: -lexicalDiversity, contribution: -lexicalDiversity * 0.24 },
    { nom: "Variation des longueurs", z_score: -rhythmVariation, contribution: -rhythmVariation * 0.22 },
    { nom: "Originalité des formulations", z_score: -originality, contribution: -originality * 0.18 },
    ...structural.signals.slice(0, 4).map(s => ({ nom: s.name, z_score: s.count, contribution: s.contribution * 0.10 })),
  ].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 10);

  let decision_precaution: string;
  if (probability >= 0.78 && strongSignals >= 4 && confidence >= 0.60) {
    decision_precaution = "Plusieurs signaux indépendants convergent fortement vers une production automatisée. Le résultat reste une estimation stylistique.";
  } else if (probability >= 0.55 && strongSignals >= 3) {
    decision_precaution = "Des indices IA convergents sont présents. Une vérification humaine est recommandée avant toute conclusion.";
  } else if (probability <= 0.25 && humanEvidence >= 0.42) {
    decision_precaution = "Les caractéristiques observées sont surtout compatibles avec une rédaction naturelle. Ce résultat ne constitue pas une preuve d'auteur humain.";
  } else {
    decision_precaution = "Les indices disponibles sont mixtes ou insuffisants pour conclure avec certitude.";
  }

  return {
    probabilite_IA: Number(probability.toFixed(4)),
    intervalle_confiance_95, confiance_analyse, genre_detecte: genre,
    rapport_detaille: contributions, decision_precaution, features,
  };
}