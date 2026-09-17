import type { VercelRequest, VercelResponse } from "@vercel/node";

const ENGINE_USED = "Oligens_Local_Heuristic_Engine";
const MIN_TEXT_LENGTH = 20;
const MAX_TEXT_LENGTH = 100_000;

const AI_PATTERNS: Array<{ label: string; regex: RegExp; weight: number }> = [
  { label: "il est important de noter", regex: /\bil\s+est\s+important\s+de\s+noter\b/gi, weight: 0.16 },
  { label: "en outre", regex: /\ben\s+outre\b/gi, weight: 0.10 },
  { label: "par conséquent", regex: /\bpar\s+cons[eé]quent\b/gi, weight: 0.10 },
  { label: "cependant", regex: /\bcependant\b/gi, weight: 0.06 },
  { label: "en conclusion", regex: /\ben\s+conclusion\b/gi, weight: 0.10 },
  { label: "dans l'ensemble", regex: /\bdans\s+l['’]ensemble\b/gi, weight: 0.08 },
  { label: "il convient de", regex: /\bil\s+convient\s+de\b/gi, weight: 0.12 },
  { label: "il est essentiel de", regex: /\bil\s+est\s+essentiel\s+de\b/gi, weight: 0.12 },
  { label: "de plus", regex: /\bde\s+plus\b/gi, weight: 0.07 },
  { label: "en effet", regex: /\ben\s+effet\b/gi, weight: 0.06 },
  { label: "ainsi", regex: /\bainsi\b/gi, weight: 0.05 },
  { label: "notamment", regex: /\bnotamment\b/gi, weight: 0.04 },
  { label: "autrement dit", regex: /\bautrement\s+dit\b/gi, weight: 0.08 },
];

type DetectionMetrics = {
  total_words: number;
  unique_words: number;
  lexical_diversity: number;
  patterns_detected: string[];
  ai_patterns_detected: string[];
};

type DetectionCore = {
  is_ai_generated: boolean;
  confidence_score: number;
  metrics: DetectionMetrics;
  engine_used: typeof ENGINE_USED;
};

type DetectionResponse = DetectionCore & {
  success: boolean;
  status: "success" | "fallback" | "error";
  data: DetectionCore;
  result: string;
  timestamp: string;
  fallback?: boolean;
  error?: string;
};

function normalizeText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function tokenize(text: string): string[] {
  return text
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
}

function calculateLexicalDiversity(words: string[]): number {
  if (words.length === 0) return 0;
  return new Set(words).size / words.length;
}

function detectAIPatterns(text: string): string[] {
  const detected: string[] = [];
  for (const pattern of AI_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) detected.push(pattern.label);
    pattern.regex.lastIndex = 0;
  }
  return detected;
}

function calculatePatternScore(text: string, detectedPatterns: string[]): number {
  let score = 0;
  for (const pattern of AI_PATTERNS) {
    if (!detectedPatterns.includes(pattern.label)) continue;
    pattern.regex.lastIndex = 0;
    const occurrences = text.match(pattern.regex)?.length ?? 0;
    pattern.regex.lastIndex = 0;
    score += Math.min(pattern.weight * occurrences, pattern.weight * 2);
  }
  return Math.min(score, 0.75);
}

function calculateConfidence(totalWords: number, lexicalDiversity: number, patternScore: number): number {
  if (totalWords === 0) return 0;
  const lengthFactor = Math.min(totalWords / 150, 1);
  const lowDiversitySignal =
    Math.max(0, Math.min(1, (0.58 - lexicalDiversity) / 0.30)) *
    lengthFactor *
    0.35;
  return Math.round(Math.min(Math.max(patternScore + lowDiversitySignal, 0), 1) * 100) / 100;
}

function buildResponse(core: DetectionCore, success = true, status: "success" | "fallback" | "error" = "success", error?: string): DetectionResponse {
  const result = core.is_ai_generated ? "Contenu généré par IA" : "Contenu d'origine humaine";
  return {
    success,
    status,
    data: core,
    is_ai_generated: core.is_ai_generated,
    confidence_score: core.confidence_score,
    metrics: core.metrics,
    engine_used: core.engine_used,
    result,
    timestamp: new Date().toISOString(),
    ...(status !== "success" ? { fallback: true } : {}),
    ...(error ? { error } : {}),
  };
}

function createFallback(reason?: string): DetectionResponse {
  const core: DetectionCore = {
    is_ai_generated: false,
    confidence_score: 0,
    metrics: {
      total_words: 0,
      unique_words: 0,
      lexical_diversity: 0,
      patterns_detected: [],
      ai_patterns_detected: [],
    },
    engine_used: ENGINE_USED,
  };
  return buildResponse(core, false, "fallback", reason);
}

function analyzeText(text: string): DetectionResponse {
  const words = tokenize(text);
  const uniqueWords = new Set(words);
  const patternsDetected = detectAIPatterns(text);
  const lexicalDiversity = calculateLexicalDiversity(words);
  const patternScore = calculatePatternScore(text, patternsDetected);
  const confidenceScore = calculateConfidence(words.length, lexicalDiversity, patternScore);
  const isAIGenerated = words.length >= MIN_TEXT_LENGTH && confidenceScore >= 0.5;

  const core: DetectionCore = {
    is_ai_generated: isAIGenerated,
    confidence_score: confidenceScore,
    metrics: {
      total_words: words.length,
      unique_words: uniqueWords.size,
      lexical_diversity: Math.round(lexicalDiversity * 1000) / 1000,
      patterns_detected: patternsDetected,
      ai_patterns_detected: patternsDetected,
    },
    engine_used: ENGINE_USED,
  };

  return buildResponse(core);
}

export default function handler(req: VercelRequest, res: VercelResponse): void {
  try {
    if (req.method !== "POST") {
      res.status(405).json(createFallback("Méthode HTTP non autorisée."));
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const rawText = body.text;

    if (typeof rawText !== "string") {
      res.status(400).json(createFallback("Le champ 'text' est obligatoire."));
      return;
    }

    const text = normalizeText(rawText);

    if (text.length < MIN_TEXT_LENGTH) {
      res.status(400).json(createFallback(`Le texte doit contenir au moins ${MIN_TEXT_LENGTH} caractères.`));
      return;
    }

    if (text.length > MAX_TEXT_LENGTH) {
      res.status(413).json(createFallback(`Le texte ne peut pas dépasser ${MAX_TEXT_LENGTH} caractères.`));
      return;
    }

    res.status(200).json(analyzeText(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue du moteur local.";
    // Défense ultime : aucune exception inattendue ne produit HTTP 500.
    res.status(200).json(createFallback(message));
  }
}
