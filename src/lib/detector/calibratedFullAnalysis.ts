import { runFullAnalysis, countWords, type FullAnalysisResult, type RunOptions } from "./heuristicEngine";
import { analyzeCalibrated } from "./calibratedDetector";
import { runScanAgents } from "../ai/agenticEngines";
import { runOligensConsensus } from "./advancedSignals";
import { runOligensMlCalibration } from "./oligensMlCalibration";
import { sanitizeDocument } from "./documentSanitizer";
import { runPythonDetectorPort } from "../engines/pythonPort/detectorEngine";

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export function runCalibratedFullAnalysis(text: string, options: RunOptions = {}): FullAnalysisResult {
  const sanitized = sanitizeDocument(text);
  const activeText = sanitized.activeText;
  const base = runFullAnalysis(activeText, options);
  const calibrated = analyzeCalibrated(activeText, "generic");
  const words = countWords(activeText);
  const agents = runScanAgents(activeText, calibrated.features);
  const olig = runOligensConsensus(activeText);
  const ml = runOligensMlCalibration(activeText, calibrated.features);

  // Primary detector score: native TypeScript port of the repository's
  // Python FeatureExtractor. The surrounding Oligens engines remain active
  // as secondary evidence and reporting signals.
  const pythonPort = runPythonDetectorPort(activeText);
  const probability = pythonPort.probability;

  const vocabularyDiversity = clamp((base.z_scores[0] ?? 0) / 2, -1, 1);
  const originalityScore = clamp((base.z_scores[15] ?? 0) / 2, -1, 1);
  const plagiarismRate = clamp(base.plagiat_estime, 0, 100);

  const report = [...calibrated.rapport_detaille];
  report.push({
    nom: "Python-port — signature IA",
    z_score: pythonPort.features.signatureScore / 100,
    contribution: pythonPort.features.signatureScore / 100,
  });
  report.push({
    nom: "Python-port — diversité entropique",
    z_score: pythonPort.features.entropyDiversityIndex / 100,
    contribution: (100 - pythonPort.features.entropyDiversityIndex) / 100,
  });
  report.push({
    nom: "Python-port — diversité verbale",
    z_score: pythonPort.features.verbDiversity / 100,
    contribution: (100 - pythonPort.features.verbDiversity) / 100,
  });
  report.push({
    nom: "Python-port — marqueurs de prudence",
    z_score: pythonPort.features.hedgingPhrases / 100,
    contribution: pythonPort.features.hedgingPhrases / 100,
  });
  report.push({
    nom: "Python-port — transitions LLM",
    z_score: pythonPort.features.transitionMarkers / 100,
    contribution: pythonPort.features.transitionMarkers / 100,
  });
  report.push({
    nom: "Python-port — répétitions",
    z_score: pythonPort.features.repetitionPatterns / 100,
    contribution: pythonPort.features.repetitionPatterns / 100,
  });

  report.push({
    nom: "Oligens — diversité du vocabulaire",
    z_score: vocabularyDiversity,
    contribution: Math.abs(Math.min(0, vocabularyDiversity)) * 0.40,
  });
  report.push({
    nom: "Oligens — originalité des formulations",
    z_score: originalityScore,
    contribution: Math.abs(Math.min(0, originalityScore)) * 0.40,
  });
  report.push({
    nom: "Oligens ML — signal IA secondaire",
    z_score: ml.scoreIA,
    contribution: ml.scoreIA * 0.20,
  });

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
  const oligensMl = {
    modelVersion: ml.modelVersion,
    scoreIA: ml.scoreIA,
    confidence: ml.confidence,
    verdict: ml.verdict,
    mixedText: ml.mixedText,
    coverage: ml.coverage,
    passages: ml.passages,
    explanation: ml.explanation,
    metrics: ml.metrics,
  };

  return {
    ...base,
    probabilite_IA: Number(probability.toFixed(4)),
    intervalle_confiance_95: [Math.max(0, probability - 0.15), Math.min(1, probability + 0.15)],
    confiance_analyse: confidence >= 0.70 ? "Élevée" : confidence >= 0.50 ? "Moyenne" : "Faible",
    rapport_detaille: sortedReport,
    decision_precaution: ml.mixedText ? ml.explanation : calibrated.decision_precaution,
    features: { ...base.features, ...calibrated.features },
    z_scores: base.z_scores,
    processing: { ...base.processing, words },
    signature: probability < 0.35
      ? { ...base.signature, modele_principal: null, note: "Aucune signature automatisée dominante ne se détache." }
      : base.signature,
    references: {
      total:
        (text.match(/\(\s*[A-ZÀ-ÖØ-Þ][\w'’-]*(?:\s*(?:et al\.|&|et)\s*[\w'’-]*)?\s*,\s*\d{4}[a-z]?\s*\)/g) ?? []).length +
        (text.match(/\[\s*\d+\s*\]/g) ?? []).length,
      douteuses: base.references.douteuses,
    },
    plagiat_estime: plagiarismRate,
    oligensMl,
    pythonDetector: {
      engine: pythonPort.engine,
      score: pythonPort.score,
      probability: pythonPort.probability,
      features: pythonPort.features,
    },
  } as FullAnalysisResult & { oligensMl: typeof oligensMl; pythonDetector: typeof pythonPort };
}
