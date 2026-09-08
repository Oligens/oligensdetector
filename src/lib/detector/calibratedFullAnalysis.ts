import { runFullAnalysis, countWords, type FullAnalysisResult, type RunOptions } from "./heuristicEngine";
import { analyzeCalibrated } from "./calibratedDetector";
import { runScanAgents } from "../ai/agenticEngines";

export function runCalibratedFullAnalysis(text: string, options: RunOptions = {}): FullAnalysisResult {
  const base = runFullAnalysis(text, options);
  const calibrated = analyzeCalibrated(text, "generic");
  const words = countWords(text);
  const agents = runScanAgents(text, calibrated.features);

  // The specialist ensemble is a bounded correction layer. It can refine the
  // calibrated result, but it cannot turn a short/uncertain document into a
  // strong conclusion by itself.
  const evidenceGate = Math.min(1, agents.confidence * agents.consensus);
  const agentCorrection = (agents.score - 0.5) * 0.16 * evidenceGate;
  const probability = Math.max(0, Math.min(1, calibrated.probabilite_IA + agentCorrection));
  const uncertainty = calibrated.intervalle_confiance_95[1] - calibrated.probabilite_IA;
  const halfWidth = Math.max(0.08, Math.min(0.24, uncertainty));
  const intervalle_confiance_95: [number, number] = [
    Math.max(0, probability - halfWidth),
    Math.min(1, probability + halfWidth),
  ];

  const report = [...calibrated.rapport_detaille];
  for (const agent of agents.agents) {
    if (agent.confidence >= 0.35 && agent.score >= 0.55) {
      report.push({
        nom: `Agent ${agent.agent} — ${agent.reason}`,
        z_score: agent.score,
        contribution: (agent.score - 0.5) * 0.08,
      });
    }
  }

  const sortedReport = report
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 10);

  return {
    ...base,
    probabilite_IA: Number(probability.toFixed(4)),
    intervalle_confiance_95,
    confiance_analyse: calibrated.confiance_analyse,
    rapport_detaille: sortedReport,
    decision_precaution: calibrated.decision_precaution,
    features: { ...base.features, ...calibrated.features },
    z_scores: base.z_scores,
    processing: { ...base.processing, words },
    signature: probability < 0.35
      ? { ...base.signature, modele_principal: null, note: "Aucune signature automatisée dominante ne se détache." }
      : base.signature,
    references: base.references,
    plagiat_estime: base.plagiat_estime,
  };
}
