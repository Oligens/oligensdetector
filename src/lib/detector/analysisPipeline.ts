import { runCalibratedFullAnalysis } from "./calibratedFullAnalysis";
import type { RunOptions } from "./heuristicEngine";

export type AnalysisPipelineResult = Awaited<ReturnType<typeof runCalibratedFullAnalysis>>;

/** Single authoritative analysis entry point for direct and worker execution. */
export async function runAnalysisPipeline(text: string, options?: RunOptions): Promise<AnalysisPipelineResult> {
  const clean = text.trim();
  if (!clean) throw new Error("Aucun texte à analyser.");
  return runCalibratedFullAnalysis(clean, options);
}
