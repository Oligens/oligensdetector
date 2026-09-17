import { runCalibratedFullAnalysis } from "../../lib/detector/calibratedFullAnalysis";

export type LocalAnalyzerLanguage = "auto" | "fr" | "en";

export interface LocalAnalyzerResult {
  success: true;
  score: number;
  analysis: ReturnType<typeof runCalibratedFullAnalysis>;
  analysis_mode: "local_first";
  offline_engine: true;
  engine: "oligens-local-typescript";
  language: LocalAnalyzerLanguage;
  trace: {
    engine: string;
    external_dependency: false;
    python_subprocess: false;
    started_at: string;
    completed_at: string;
    processing_time_ms: number;
  };
}

/**
 * Vercel-safe local detector.
 *
 * This intentionally delegates to the existing Oligens calibrated TypeScript
 * engine instead of spawning detector.py. The calibrated engine already
 * combines the repository's lexical/stylometric signals, calibrated model,
 * consensus/advanced signals and ML calibration in-process.
 */
export function analyzeLocally(
  text: string,
  language: LocalAnalyzerLanguage = "auto",
): LocalAnalyzerResult {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  const analysis = runCalibratedFullAnalysis(text, {
    language: language === "auto" ? "auto" : language,
  });

  const completed = Date.now();

  return {
    success: true,
    score: Math.round(analysis.probabilite_IA * 100),
    analysis,
    analysis_mode: "local_first",
    offline_engine: true,
    engine: "oligens-local-typescript",
    language,
    trace: {
      engine: "oligens-local-typescript",
      external_dependency: false,
      python_subprocess: false,
      started_at: startedAt,
      completed_at: new Date(completed).toISOString(),
      processing_time_ms: completed - started,
    },
  };
}
