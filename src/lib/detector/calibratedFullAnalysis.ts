import { runFullAnalysis, countWords, type FullAnalysisResult, type RunOptions } from "./heuristicEngine";
import { analyzeCalibrated } from "./calibratedDetector";
import { runScanAgents } from "../ai/agenticEngines";
import { runOligensConsensus } from "./advancedSignals";

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export function runCalibratedFullAnalysis(text: string, options: RunOptions = {}): FullAnalysisResult {
  const base = runFullAnalysis(text, options);
  const calibrated = analyzeCalibrated(text, "generic");
  const words = countWords(text);
  const agents = runScanAgents(text, calibrated.features);
  const olig = runOligensConsensus(text);

  // Multi-engine consensus. The proprietary Oligens layer is an independent
  // evidence family; it cannot override the calibrated detector by itself.
  const strongAgents = agents.agents.filter(a => a.confidence >= 0.40 && a.score >= 0.70).length;
  const evidenceGate = strongAgents >= 3 ? Math.min(1, agents.confidence * agents.consensus) : 0;
  const agentCorrection = (agents.score - 0.5) * 0.10 * evidenceGate;

  // Keep the independent advanced layer deliberately bounded so generic
  // stylistic traits never become a categorical authorship claim.
  const advancedGate = clamp(olig.confidence * (0.55 + agents.consensus * 0.45));
  const advancedCorrection = (olig.score - 0.5) * 0.18 * advancedGate;
  const probability = clamp(calibrated.probabilite_IA + agentCorrection + advancedCorrection);

  const uncertainty = calibrated.intervalle_confiance_95[1] - calibrated.probabilite_IA;
  const halfWidth = Math.max(0.08, Math.min(0.24, uncertainty));
  const intervalle_confiance_95: [number, number] = [
    Math.max(0, probability - halfWidth),
    Math.min(1, probability + halfWidth),
  ];

  const report = [...calibrated.rapport_detaille];
  for (const agent of agents.agents) {
    if (agent.confidence >= 0.40 && agent.score >= 0.70) {
      report.push({
        nom: "Agent " + agent.agent + " — " + agent.reason,
        z_score: agent.score,
        contribution: (agent.score - 0.5) * 0.05,
      });
    }
  }

  const s = olig.signals;
  const advancedFactors: Array<[string, number, number]> = [
    ["Oligens — régularité structurelle", s.structuralRegularity, (s.structuralRegularity - 0.5) * 0.035],
    ["Oligens — répétition de bigrammes", s.repeatedBigramRatio, s.repeatedBigramRatio * 0.025],
    ["Oligens — répétition de trigrammes", s.repeatedTrigramRatio, s.repeatedTrigramRatio * 0.025],
    ["Oligens — densité de formulations génériques", s.genericPhraseDensity, s.genericPhraseDensity * 0.03],
    ["Oligens — diversité lexicale", 1 - s.typeTokenRatio, (1 - s.typeTokenRatio) * 0.02],
    ["Oligens — variation du rythme", 1 - clamp(s.sentenceLengthCV / 0.8), (1 - clamp(s.sentenceLengthCV / 0.8)) * 0.025],
  ];
  for (const [nom, z_score, contribution] of advancedFactors) {
    if (Math.abs(contribution) >= 0.008) report.push({ nom, z_score, contribution });
  }

  const sortedReport = report
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 10);

  const confidence = clamp(
    calibrated.confiance_analyse === "Élevée" ? 0.76 : calibrated.confiance_analyse === "Moyenne" ? 0.58 : 0.38,
    0.20,
    0.92,
  );

  return {
    ...base,
    probabilite_IA: Number(probability.toFixed(4)),
    intervalle_confiance_95,
    confiance_analyse: confidence >= 0.70 ? "Élevée" : confidence >= 0.50 ? "Moyenne" : "Faible",
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
