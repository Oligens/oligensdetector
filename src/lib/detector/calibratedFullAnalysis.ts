import { runFullAnalysis, countWords, type FullAnalysisResult, type RunOptions } from "./heuristicEngine";
import { analyzeCalibrated } from "./calibratedDetector";

export function runCalibratedFullAnalysis(text: string, options: RunOptions = {}): FullAnalysisResult {
  const base = runFullAnalysis(text, options);
  const calibrated = analyzeCalibrated(text, "generic");
  const words = countWords(text);
  const uncertainty = calibrated.intervalle_confiance_95[1] - calibrated.probabilite_IA;
  return {
    ...base,
    probabilite_IA: calibrated.probabilite_IA,
    intervalle_confiance_95: calibrated.intervalle_confiance_95,
    confiance_analyse: calibrated.confiance_analyse,
    rapport_detaille: calibrated.rapport_detaille,
    decision_precaution: calibrated.decision_precaution,
    features: { ...base.features, ...calibrated.features },
    z_scores: base.z_scores,
    processing: { ...base.processing, words },
    signature: calibrated.probabilite_IA < 0.35 ? { ...base.signature, modele_principal: null, note: "Aucune signature automatisée dominante ne se détache." } : base.signature,
    references: base.references,
    plagiat_estime: base.plagiat_estime,
  };
}
