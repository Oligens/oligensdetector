import type { Features } from "../detector/heuristicEngine";
import { computeStructuralSignals } from "../detector/structuralSignals";

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const tokens = (s: string) => s.toLocaleLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];

export type ScanAgentName =
  | "lexical" | "rhythm" | "syntax" | "template"
  | "repetition" | "punctuation" | "structure" | "coherence"
  | "specificity" | "humanVariance";

export interface ScanAgentResult {
  agent: ScanAgentName;
  score: number;
  confidence: number;
  reason: string;
}

export interface ScanAgentReport {
  score: number;
  confidence: number;
  consensus: number;
  agents: ScanAgentResult[];
}

/**
 * Local specialist ensemble. Each agent observes one family of signals.
 * The ensemble is evidence collection, not an authorship oracle.
 */
export function runScanAgents(text: string, features: Features): ScanAgentReport {
  const structural = computeStructuralSignals(text);
  const wordCount = tokens(text).length;
  const lengthConfidence = clamp((wordCount - 80) / 900, 0, 1);

  const naturalVariation = clamp(
    ((features.mattr - 0.56) / 0.30) * 0.30 +
    ((features.burstiness - 0.25) / 0.75) * 0.30 +
    ((features.diversiteDebutsPhrase - 1.0) / 2.0) * 0.20 +
    ((features.variancePonctuation - 0.08) / 0.92) * 0.20,
  );

  const agents: ScanAgentResult[] = [
    { agent: "lexical", score: clamp(1 - (features.mattr - 0.56) / 0.30), confidence: lengthConfidence, reason: "Diversité du vocabulaire." },
    { agent: "rhythm", score: clamp((0.52 - features.burstiness) / 0.40), confidence: lengthConfidence, reason: "Régularité des longueurs de phrases." },
    { agent: "syntax", score: clamp(features.uniformiteStyle / 0.20), confidence: lengthConfidence, reason: "Uniformité du style." },
    { agent: "template", score: clamp(features.scoreExpressionsIA), confidence: clamp((wordCount - 120) / 600), reason: "Formulations très standardisées." },
    { agent: "repetition", score: clamp((features.yulesK - 12) / 22), confidence: lengthConfidence, reason: "Répétitions lexicales." },
    { agent: "punctuation", score: clamp(1 - (features.variancePonctuation - 0.08) / 0.92), confidence: lengthConfidence, reason: "Régularité de la ponctuation." },
    { agent: "structure", score: structural.score, confidence: clamp((wordCount - 100) / 700), reason: "Structures discursives standardisées." },
    { agent: "coherence", score: clamp((features.similariteInterPhrases - 0.18) / 0.38), confidence: clamp((wordCount - 160) / 800), reason: "Similarité entre phrases." },
    { agent: "specificity", score: clamp(features.scoreExpressionsIA * 0.55 + structural.score * 0.45), confidence: clamp((wordCount - 120) / 700), reason: "Spécificité des marqueurs potentiellement automatisés." },
    { agent: "humanVariance", score: clamp(1 - naturalVariation), confidence: lengthConfidence, reason: "Absence de variations stylistiques naturelles." },
  ];

  const active = agents.filter(a => a.confidence >= 0.25);
  const weights = active.map(a => 0.5 + a.confidence * 0.5);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const score = active.reduce((sum, a, i) => sum + a.score * weights[i], 0) / total;
  const above = active.filter(a => a.score >= 0.55).length;
  const below = active.filter(a => a.score <= 0.35).length;
  const consensus = active.length ? Math.max(above, below) / active.length : 0;

  return {
    score: clamp(score),
    confidence: clamp(0.22 + lengthConfidence * 0.58 + consensus * 0.20),
    consensus,
    agents,
  };
}

export type HumanizerAgentName =
  | "intentGuard" | "factGuard" | "structure" | "lexical"
  | "rhythm" | "voice" | "naturalness" | "quality"
  | "coherence" | "antiGlitch";

export interface HumanizerAgentPlan {
  intensity: number;
  iterations: number;
  modeAggressif: boolean;
  agents: HumanizerAgentName[];
  objectives: string[];
}

export function buildHumanizerAgentPlan(
  text: string,
  requested: Partial<{ intensite: number; iterationsMax: number; modeAggressif: boolean }> = {},
): HumanizerAgentPlan {
  const wc = tokens(text).length;
  const sentences = text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.filter(Boolean) ?? [];
  const hasNumbers = /\b\d+(?:[.,]\d+)?%?\b/.test(text);
  const hasCitations = /\([^()]{1,100}\b(?:19|20)\d{2}\b[^()]{0,30}\)/.test(text);
  const avg = sentences.length ? wc / sentences.length : 0;
  const agents: HumanizerAgentName[] = [
    "intentGuard", "factGuard", "structure", "lexical", "rhythm",
    "voice", "naturalness", "quality", "coherence", "antiGlitch",
  ];
  const objectives: string[] = [];
  if (avg > 25) objectives.push("alléger certaines phrases longues");
  if (avg < 9 && sentences.length > 4) objectives.push("éviter un rythme trop haché");
  if (/\b(il est important de noter|il convient de souligner|en conclusion|par conséquent|dans le cadre de)\b/i.test(text)) {
    objectives.push("réduire les formulations convenues");
  }
  if (hasNumbers || hasCitations) objectives.push("préserver strictement les données et références");
  if (!objectives.length) objectives.push("améliorer le rythme et la variété sans changer les faits");

  const base = clamp(requested.intensite ?? 0.78, 0.35, 0.96);
  const complexity = clamp((wc - 250) / 1800, 0, 1);
  return {
    intensity: clamp(base + complexity * 0.08, 0.35, 0.96),
    iterations: Math.max(2, Math.min(10, requested.iterationsMax ?? 6)),
    modeAggressif: Boolean(requested.modeAggressif),
    agents,
    objectives,
  };
}

export function safeNaturalFallback(text: string): string {
  const out = text.trim();
  if (!out) return "";
  const swaps: Array<[RegExp, string]> = [
    [/\bcependant\b/i, "mais"],
    [/\bnéanmoins\b/i, "pourtant"],
    [/\bpar conséquent\b/i, "donc"],
    [/\ben conclusion\b/i, "pour finir"],
    [/\bdans le cadre de\b/i, "dans"],
    [/\bil est important de noter que\b/i, "on remarque que"],
  ];
  for (const [re, to] of swaps) if (re.test(out)) return out.replace(re, to);
  const long = out.match(/[^.!?…]{120,}[.!?…]/);
  if (long) {
    const comma = long[0].indexOf(", ");
    if (comma > 35 && comma < long[0].length - 35) {
      const s = long[0];
      return out.replace(s, s.slice(0, comma) + ". " + s.slice(comma + 2).replace(/^\p{Ll}/u, c => c.toUpperCase()));
    }
  }
  const semi = out.indexOf("; ");
  if (semi > 20) return out.slice(0, semi) + ". " + out.slice(semi + 2);
  return out;
}
