import { FeatureExtractor, countWords, type Features, type HeuristicResult } from "./heuristicEngine";

const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const scale = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo));
const inverse = (v: number, center: number, span: number) => clamp(0.5 + (center - v) / (span * 2));

/** Calibrated layer over the existing 18-feature extractor. A single stylistic habit never decides the result. */
export function analyzeCalibrated(text: string, genre = "generic"): HeuristicResult & { features: Features } {
  const clean = text.replace(/\s+/g, " ").trim();
  const words = countWords(clean);
  const features = new FeatureExtractor(clean).extractAll();
  if (!words) return { probabilite_IA: 0, intervalle_confiance_95: [0, 0], confiance_analyse: "Faible", genre_detecte: genre, rapport_detaille: [], decision_precaution: "Aucun texte à analyser.", features };

  const template = features.scoreExpressionsIA;
  const repetition = scale(features.yulesK, 10, 28);
  const lexicalRegularity = 0.5 * inverse(features.mattr, 0.72, 0.28) + 0.5 * inverse(features.hapaxLegomena, 0.38, 0.30);
  const rhythmRegularity = inverse(features.burstiness, 0.55, 0.90);
  const startRegularity = inverse(features.diversiteDebutsPhrase, 1.7, 3.0);
  const similarity = scale(features.similariteInterPhrases, 0.12, 0.55);
  const styleUniformity = inverse(features.uniformiteStyle, 0.16, 0.65);
  const standardTransitions = scale(features.tauxTransitionStandard, 0.015, 0.09);
  const lowOriginality = inverse(features.scoreOriginalite, 0.72, 0.45);

  const aiEvidence = template * 0.30 + repetition * 0.12 + lexicalRegularity * 0.14 + rhythmRegularity * 0.10 + startRegularity * 0.08 + similarity * 0.10 + styleUniformity * 0.07 + standardTransitions * 0.05 + lowOriginality * 0.04;
  const humanEvidence = scale(features.mattr, 0.55, 0.88) * 0.24 + scale(features.hapaxLegomena, 0.22, 0.55) * 0.18 + scale(features.burstiness, 0.28, 1.05) * 0.20 + scale(features.diversiteDebutsPhrase, 1.0, 3.2) * 0.14 + scale(features.variancePonctuation, 0.12, 1.10) * 0.07 + scale(features.varianceEmotionnelle, 0.03, 0.55) * 0.05 + scale(features.scoreOriginalite, 0.55, 1) * 0.12;

  const raw = clamp(0.05 + aiEvidence * 0.92 - humanEvidence * 0.62);
  const reliability = clamp((words - 80) / 920);
  const probability = clamp(0.5 + (raw - 0.5) * (0.35 + reliability * 0.65));

  const report = [
    ["Expressions standardisées", template * 0.30],
    ["Répétition lexicale", repetition * 0.12],
    ["Rythme régulier", rhythmRegularity * 0.10],
    ["Similarité entre phrases", similarity * 0.10],
    ["Diversité du vocabulaire", -scale(features.mattr, 0.55, 0.88) * 0.18],
    ["Variation des longueurs", -scale(features.burstiness, 0.28, 1.05) * 0.16],
    ["Diversité des débuts", -scale(features.diversiteDebutsPhrase, 1.0, 3.2) * 0.12],
  ].map(([nom, contribution]) => ({ nom: String(nom), z_score: 0, contribution: Number(contribution) })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 7);

  const uncertainty = clamp(0.24 - reliability * 0.16, 0.07, 0.24);
  const confiance_analyse: HeuristicResult["confiance_analyse"] = words < 250 ? "Faible" : words < 800 ? "Moyenne" : "Élevée";
  const decision = probability >= 0.70 ? "Plusieurs indices indépendants sont compatibles avec une génération automatisée. Résultat à interpréter avec prudence." : probability >= 0.45 ? "Quelques indices sont présents, mais ils ne suffisent pas à conclure. Une vérification humaine reste recommandée." : "Le texte présente davantage de caractéristiques compatibles avec une rédaction naturelle. Ce résultat n'est pas une preuve d'auteur humain.";
  return { probabilite_IA: probability, intervalle_confiance_95: [clamp(probability - uncertainty), clamp(probability + uncertainty)], confiance_analyse, genre_detecte: genre, rapport_detaille: report, decision_precaution: decision, features };
}
