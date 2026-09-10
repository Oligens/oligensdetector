import { runFullAnalysis, countWords, type FullAnalysisResult, type RunOptions } from "./heuristicEngine";
import { analyzeCalibrated } from "./calibratedDetector";
import { runScanAgents } from "../ai/agenticEngines";
import { runOligensConsensus } from "./advancedSignals";
import { runOligensMlCalibration } from "./oligensMlCalibration";

const clamp=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));

export function runCalibratedFullAnalysis(text:string,options:RunOptions={}):FullAnalysisResult{
  const base=runFullAnalysis(text,options);
  const calibrated=analyzeCalibrated(text,"generic");
  const words=countWords(text);
  const agents=runScanAgents(text,calibrated.features);
  const olig=runOligensConsensus(text);
  const ml=runOligensMlCalibration(text,calibrated.features);

  const strongAgents=agents.agents.filter(a=>a.confidence>=.40&&a.score>=.70).length;
  const evidenceGate=strongAgents>=3?Math.min(1,agents.confidence*agents.consensus):0;
  const agentCorrection=(agents.score-.5)*.10*evidenceGate;
  const advancedGate=clamp(olig.confidence*(.55+agents.consensus*.45));
  const advancedCorrection=(olig.score-.5)*.18*advancedGate;
  // Oligens ML is an independent evidence family. Its influence is bounded and
  // calibrated separately so it cannot silently dominate the legacy engine.
  const mlGate=clamp(ml.confidence*.85+ml.coverage*.15);
  const mlCorrection=(ml.scoreIA-.5)*.20*mlGate;
  const probability=clamp(calibrated.probabilite_IA+agentCorrection+advancedCorrection+mlCorrection);

  const uncertainty=calibrated.intervalle_confiance_95[1]-calibrated.probabilite_IA;
  const halfWidth=Math.max(.08,Math.min(.24,uncertainty));
  const intervalle_confiance_95:[number,number]=[Math.max(0,probability-halfWidth),Math.min(1,probability+halfWidth)];
  const report=[...calibrated.rapport_detaille];
  if(ml.scoreIA>=.55||ml.mixedText)report.push({nom:`Oligens ML — ${ml.explanation}`,z_score:ml.scoreIA,contribution:mlCorrection});
  for(const agent of agents.agents)if(agent.confidence>=.40&&agent.score>=.70)report.push({nom:"Agent "+agent.agent+" — "+agent.reason,z_score:agent.score,contribution:(agent.score-.5)*.05});
  const s=olig.signals;
  const advancedFactors:Array<[string,number,number]>=[
    ["Oligens — régularité structurelle",s.structuralRegularity,(s.structuralRegularity-.5)*.035],
    ["Oligens — répétition de bigrammes",s.repeatedBigramRatio,s.repeatedBigramRatio*.025],
    ["Oligens — répétition de trigrammes",s.repeatedTrigramRatio,s.repeatedTrigramRatio*.025],
    ["Oligens — densité de formulations génériques",s.genericPhraseDensity,s.genericPhraseDensity*.03],
    ["Oligens — diversité lexicale",1-s.typeTokenRatio,(1-s.typeTokenRatio)*.02],
    ["Oligens — variation du rythme",1-clamp(s.sentenceLengthCV/.8),(1-clamp(s.sentenceLengthCV/.8))*.025],
  ];
  for(const [nom,z_score,contribution] of advancedFactors)if(Math.abs(contribution)>=.008)report.push({nom,z_score,contribution});
  const sortedReport=report.sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,10);
  const confidence=clamp(calibrated.confiance_analyse==="Élevée"?.76:calibrated.confiance_analyse==="Moyenne"?.58:.38,.20,.92);

  return {...base,probabilite_IA:Number(probability.toFixed(4)),intervalle_confiance_95,confiance_analyse:confidence>=.70?"Élevée":confidence>=.50?"Moyenne":"Faible",rapport_detaille:sortedReport,decision_precaution:ml.mixedText?ml.explanation:calibrated.decision_precaution,features:{...base.features,...calibrated.features},z_scores:base.z_scores,processing:{...base.processing,words},signature:probability<.35?{...base.signature,modele_principal:null,note:"Aucune signature automatisée dominante ne se détache."}:base.signature,references:base.references,plagiat_estime:base.plagiat_estime,
    // Persisted inside analysis_result JSONB; no PostgreSQL schema change required.
    oligENS_ml:{modelVersion:ml.modelVersion,scoreIA:ml.scoreIA,confidence:ml.confidence,verdict:ml.verdict,mixedText:ml.mixedText,coverage:ml.coverage,passages:ml.passages,explanation:ml.explanation,metrics:ml.metrics},
  } as FullAnalysisResult & { oligENS_ml: typeof ml };
}
