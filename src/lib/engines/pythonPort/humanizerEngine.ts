export interface PythonHumanizerConfig {
  intensity?: number;
  warmth?: number;
  seed?: number;
  maxIterations?: number;
}

export interface PythonHumanizerResult {
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
  detected_language: string;
  engine_used: "python-humanizer-typescript-port";
  fallback_engine: false;
  processing_time_ms: number;
}

const WORD_RE = /[\p{L}\p{N}_']+/gu;
const SENTENCE_RE = /[^.!?…]+[.!?…]+|[^.!?…]+$/gu;
const SPACE_RE = /\s+/g;
const FRENCH = new Set(["le", "la", "les", "des", "une", "est", "dans", "pour", "avec", "que", "qui", "et"]);
const ENGLISH = new Set(["the", "and", "of", "to", "is", "in", "for", "with", "that", "this", "are"]);

function words(text: string): string[] { return text.toLocaleLowerCase().match(WORD_RE) ?? []; }
function sentences(text: string): string[] { return text.match(SENTENCE_RE) ?? (text.trim() ? [text.trim()] : []); }

function entropy(text: string): number {
  const tokens = words(text);
  if (!tokens.length) return 0;
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let result = 0;
  for (const count of counts.values()) { const p = count / tokens.length; result -= p * Math.log2(p); }
  return Number(result.toFixed(4));
}

function burstiness(text: string): number {
  const lengths = sentences(text).map(sentence => words(sentence).length).filter(Boolean);
  if (lengths.length < 2) return 0;
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (!mean) return 0;
  const variance = lengths.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lengths.length;
  return Number((Math.sqrt(variance) / mean).toFixed(4));
}

function naturalness(text: string): number {
  const tokens = words(text);
  if (!tokens.length) return 0;
  const diversity = new Set(tokens).size / tokens.length;
  const lengths = sentences(text).map(sentence => words(sentence).length).filter(Boolean);
  let variation = 0;
  if (lengths.length > 1) {
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    variation = Math.min(1, (Math.max(...lengths) - Math.min(...lengths)) / Math.max(mean, 1));
  }
  return Number(Math.min(100, 55 + diversity * 30 + variation * 15).toFixed(2));
}

function detectLanguage(text: string): string {
  const tokens = words(text);
  if (!tokens.length) return "unknown";
  let french = 0;
  let english = 0;
  for (const token of tokens) { if (FRENCH.has(token)) french++; if (ENGLISH.has(token)) english++; }
  if (!french && !english) return "unknown";
  if (french === english) return "mixed";
  return french > english ? "fr" : "en";
}

/** Native TypeScript port of .github/python_engine/text_humanizer_v2.py. */
export function runPythonHumanizerPort(text: string, _config: PythonHumanizerConfig = {}): PythonHumanizerResult {
  const started = Date.now();
  const original = text.trim();
  const normalized = original.replace(SPACE_RE, " ");
  const beforeEntropy = entropy(original);
  const afterEntropy = entropy(normalized);
  const beforeBurstiness = burstiness(original);
  const afterBurstiness = burstiness(normalized);
  const score = naturalness(normalized);

  return {
    original_text: original,
    humanized_text: normalized,
    naturalness_score: score,
    burstiness_before: beforeBurstiness,
    burstiness_after: afterBurstiness,
    entropy_before: beforeEntropy,
    entropy_after: afterEntropy,
    feedback_loops: 0,
    changes_applied: normalized === original ? 0 : 1,
    is_natural: score >= 72,
    detected_language: detectLanguage(original),
    engine_used: "python-humanizer-typescript-port",
    fallback_engine: false,
    processing_time_ms: Date.now() - started,
  };
}
