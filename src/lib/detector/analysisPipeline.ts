import { runCalibratedFullAnalysis } from "./calibratedFullAnalysis";

export type AnalysisPipelineResult = Awaited<ReturnType<typeof runCalibratedFullAnalysis>>;

/**
 * Single authoritative analysis entry point.
 * Workers should call this pipeline instead of running a detector and then
 * running the complete detector again on the main thread.
 */
export async function runAnalysisPipeline(text: string): Promise<AnalysisPipelineResult> {
  const clean = text.trim();
  if (!clean) throw new Error("Aucun texte à analyser.");
  return runCalibratedFullAnalysis(clean);
}
