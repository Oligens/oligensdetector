import { humanizerEngine } from "../../humanizer/humanizerUltimate";

export interface PythonHumanizerConfig {
  intensity?: number;
  warmth?: number;
  seed?: number;
  language?: "fr" | "en" | "mixte";
  targetScore?: number;
  maxIterations?: number;
}

export interface PythonHumanizationResult {
  original_text: string;
  humanized_text: string;
  naturalness_score: number;
  burstiness_before: number;
  burstiness_after: number;
  entropy_before: number;
  entropy_after: number;
  feedback_loops: number;
  changes_applied: number;
  is_natural: boolean;
  engine_used: "python-humanizer-typescript-port";
  fallback_engine: false;
  detected_language: "fr" | "en" | "mixed" | "unknown";
  error_message: null;
  compatibility: {
    python_module: "text_humanizer.py + text_humanizer_v2.py";
    local_only: true;
    cloud_required: false;
  };
}

const WORD_RE = /[\p{L}\p{N}_']+/gu;
const sentenceLengths = (text: string): number[] =>
  (text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/gu) ?? [])
    .map(sentence => (sentence.match(WORD_RE) ?? []).length)
    .filter(Boolean);

const tokens = (text: string): string[] => (text.toLocaleLowerCase().match(WORD_RE) ?? []);

function entropy(text: string): number {
  const list = tokens(text);
  if (!list.length) return 0;
  const counts = new Map<string, number>();
  for (const token of list) counts.set(token, (counts.get(token) ?? 0) + 1);
  let result = 0;
  for (const count of counts.values()) {
    const p = count / list.length;
    result -= p * Math.log2(p);
  }
  return Number(result.toFixed(4));
}

function burstiness(text: string): number {
  const lengths = sentenceLengths(text);
  if (lengths.length < 2) return 0;
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (!mean) return 0;
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
  return Number((Math.sqrt(variance) / mean).toFixed(4));
}

function naturalness(text: string): number {
  const list = tokens(text);
  if (!list.length) return 0;
  const diversity = new Set(list).size / list.length;
  const lengths = sentenceLengths(text);
  let variation = 0;
  if (lengths.length > 1) {
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    variation = Math.min(1, (Math.max(...lengths) - Math.min(...lengths)) / Math.max(mean, 1));
  }
  return Number(Math.min(100, 55 + diversity * 30 + variation * 15).toFixed(2));
}

function detectLanguage(text: string): PythonHumanizationResult["detected_language"] {
  const list = tokens(text);
  if (!list.length) return "unknown";
  const fr = new Set(["le", "la", "les", "des", "une", "est", "dans", "pour", "avec", "que", "qui", "et"]);
  const en = new Set(["the", "and", "of", "to", "is", "in", "for", "with", "that", "this", "are"]);
  const frHits = list.filter(w => fr.has(w)).length;
  const enHits = list.filter(w => en.has(w)).length;
  if (!frHits && !enHits) return "unknown";
  if (frHits === enHits) return "mixed";
  return frHits > enHits ? "fr" : "en";
}

/**
 * TypeScript implementation of the local Python humanizer contract.
 *
 * The Python integration layer delegates its local operation to
 * text_humanizer_v2.TextHumanizer. Oligens keeps the richer V1_ULTIMATE
 * transformer for actual rewriting, then exposes the Python-compatible
 * result shape and metrics. This avoids Python subprocesses on Vercel while
 * preserving the existing production humanization behavior.
 */
export async function runPythonHumanizerPort(
  text: string,
  config: PythonHumanizerConfig = {},
): Promise<PythonHumanizationResult> {
  const original = text.trim();
  const language = config.language === "fr" || config.language === "en" ? config.language : "mixte";
  const intensity = Math.max(0, Math.min(1, config.intensity ?? 0.95));
  const maxIterations = Math.max(1, Math.min(12, Math.round(config.maxIterations ?? 12)));

  const beforeEntropy = entropy(original);
  const beforeBurstiness = burstiness(original);
  const beforeNaturalness = naturalness(original);

  const outcome = await humanizerEngine.humanizeUltimateStream(original, {
    seuilCible: Math.max(0.01, Math.min(1, config.targetScore ?? 0.05)),
    iterationsMax: maxIterations,
    intensite: intensity,
    langue: language,
    modeAggressif: intensity >= 0.8,
  });

  const humanized = outcome.texteFinal.trim();
  const afterEntropy = entropy(humanized);
  const afterBurstiness = burstiness(humanized);
  const afterNaturalness = naturalness(humanized);
  const changes = humanized === original ? 0 : Math.max(1, outcome.rapport.features_finales.length);

  return {
    original_text: original,
    humanized_text: humanized,
    naturalness_score: afterNaturalness,
    burstiness_before: beforeBurstiness,
    burstiness_after: afterBurstiness,
    entropy_before: beforeEntropy,
    entropy_after: afterEntropy,
    feedback_loops: outcome.rapport.iterations_realisees,
    changes_applied: changes,
    is_natural: afterNaturalness >= 72,
    engine_used: "python-humanizer-typescript-port",
    fallback_engine: false,
    detected_language: detectLanguage(original),
    error_message: null,
    compatibility: {
      python_module: "text_humanizer.py + text_humanizer_v2.py",
      local_only: true,
      cloud_required: false,
    },
  };
}
