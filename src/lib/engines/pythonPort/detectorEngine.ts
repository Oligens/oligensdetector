export interface PythonDetectorFeatures {
  signatureScore: number;
  entropyDiversityIndex: number;
  verbDiversity: number;
  hedgingPhrases: number;
  transitionMarkers: number;
  repetitionPatterns: number;
  avgSentenceComplexity: number;
  punctuationVariability: number;
  overallAiProbability: number;
  signatureHits: Record<string, number>;
}

export interface PythonDetectorResult {
  score: number;
  probability: number;
  features: PythonDetectorFeatures;
  engine: "python-detector-typescript-port";
}

const WORD_RE = /[\p{L}\p{N}_]+/gu;
const SENTENCE_RE = /[^.!?…]+[.!?…]+|[^.!?…]+$/gu;
const PUNCT_RE = /[,;:!?…]/g;

const GPT_SIGNATURES = [
  /\bgpt\b/i, /\bchatgpt\b/i, /\bgenerative ai\b/i, /\blanguage model\b/i,
  /\bje suis un modèle de langage\b/i, /\bje suis un assistant\b/i, /\bopenai\b/i,
  /\bmaintenant,? permettez-moi\b/i, /\bvoici ce que\b/i,
  /\ben tant que modèle d['’]intelligence artificielle\b/i, /\bas an ai\b/i,
  /\bbeing an ai\b/i, /\bje ne peux pas ressentir\b/i, /\bi cannot feel\b/i,
  /\bje suis limité à\b/i, /\bi am limited to\b/i, /\bje ne peux pas avoir d['’]opinions\b/i,
  /\bi cannot have opinions\b/i, /\bje ne suis pas capable de\b/i, /\bi am not able to\b/i,
  /\bdésolé,? mais\b/i, /\bsorry,? but\b/i, /\bje dois préciser\b/i,
  /\bi must clarify\b/i, /\bvoici les informations disponibles\b/i,
  /\bhere is the information available\b/i,
];

const CLAUDE_SIGNATURES = [
  /\bclaude\b/i, /\banthropic\b/i, /\banthropique\b/i,
  /\bje suis conçu pour être utile, inoffensif et honnête\b/i,
  /\bi am designed to be helpful, harmless, and honest\b/i,
  /\bje ne peux pas vous dire\b/i, /\bi cannot tell you\b/i,
  /\bje dois être prudent\b/i, /\bi must be careful\b/i,
  /\bvoici mon analyse\b/i, /\bhere is my analysis\b/i,
  /\bje dois noter\b/i, /\bi must note\b/i, /\bcela dit\b/i, /\bthat said\b/i,
  /\bje dois souligner\b/i, /\bi must emphasize\b/i,
  /\bje suis un modèle d['’]intelligence artificielle\b/i, /\bi am an ai model\b/i,
  /\bje dois préciser que\b/i, /\bi must specify that\b/i,
  /\bceci est un modèle de\b/i, /\bthis is a model of\b/i,
];

const LLAMA_SIGNATURES = [
  /\bllama\b/i, /\bmeta\b/i, /\blarge language model\b/i,
  /\bmodèle de langage large\b/i, /\bje suis un modèle open source\b/i,
  /\bi am an open source model\b/i, /\bje ne suis pas un être humain\b/i,
  /\bi am not a human\b/i, /\bje suis un modèle de Meta\b/i,
  /\bi am a model by Meta\b/i, /\bje ne peux pas agir\b/i, /\bi cannot act\b/i,
  /\bje suis un système informatique\b/i, /\bi am a computer system\b/i,
  /\bje ne peux pas expérimenter\b/i, /\bi cannot experience\b/i,
  /\bje suis conçu pour\b/i, /\bi am designed to\b/i,
  /\bje dois mentionner\b/i, /\bi must mention\b/i,
  /\bje ne peux pas former d['’]opinion\b/i, /\bi cannot form an opinion\b/i,
];

const GEMINI_SIGNATURES = [
  /\bgemini\b/i, /\bgoogle\b/i, /\bdeepmind\b/i, /\bje suis Gemini\b/i, /\bi am Gemini\b/i,
  /\bje suis un modèle Google\b/i, /\bi am a Google model\b/i,
  /\bje suis conçu pour aider\b/i, /\bi am designed to assist\b/i,
  /\bje dois préciser que je suis\b/i, /\bi must specify that I am\b/i,
  /\bje ne suis pas un être humain réel\b/i, /\bi am not a real human\b/i,
  /\bje suis un modèle d['’]intelligence artificielle de Google\b/i,
  /\bi am a Google AI model\b/i, /\bje ne peux pas effectuer d['’]actions\b/i,
  /\bi cannot perform actions\b/i, /\bje dois me souvenir que\b/i,
  /\bi must remember that\b/i, /\bje suis un modèle de recherche\b/i,
  /\bi am a research model\b/i, /\bje ne peux pas vous dire ce que\b/i,
  /\bi cannot tell you what\b/i,
];

const TRANSITIONS = [
  "indeed", "in fact", "in other words", "moreover", "furthermore", "additionally",
  "alternatively", "hence", "thus", "consequently", "therefore", "as a result",
  "on the other hand", "however", "yet", "still", "nevertheless", "nonetheless",
  "although", "though", "whereas", "rather", "instead", "likewise", "similarly",
  "certainly", "of course", "currently", "recently", "finally", "ultimately",
  "essentially", "generally", "overall", "frankly", "honestly", "actually", "really",
  "particularly", "especially", "notably", "primarily", "mainly", "chiefly", "mostly",
  "largely", "above all", "most importantly", "first and foremost", "to begin with",
  "to conclude", "in conclusion", "to summarize", "en somme", "donc", "ainsi",
  "par conséquent", "par ailleurs", "de plus", "de surcroît", "alors", "néanmoins",
  "toutefois", "cependant", "quoique", "mais", "quant à", "du point de vue",
  "de manière générale", "en général", "notamment", "spécialement", "particulièrement",
  "principalement", "avant tout", "finalement", "à première vue", "apparemment",
  "semble-t-il", "autrement dit", "en d'autres termes", "à savoir",
];

const HEDGING = [
  "it seems", "it appears", "it could be", "may be", "might be", "perhaps", "possibly",
  "likely", "probably", "could be", "can be", "appears to be", "seems to be", "is likely",
  "is probable", "is possible", "should be", "would be", "there is a chance",
  "there is a possibility", "there is a likelihood", "il semble", "il apparaît",
  "il pourrait être", "peut-être", "possiblement", "probablement", "semble être",
  "paraît être", "est susceptible", "est vraisemblablement", "est possible", "devrait être",
  "serait", "il y a une chance", "il y a une possibilité", "il y a une probabilité",
  "certainement", "sûrement", "assurément", "prétendument", "supposedly", "reportedly",
  "apparently", "so-called", "supposément", "présumément", "théoriquement",
  "conceptuellement", "en principe", "in principle", "in theory", "theoretically",
  "conceptually", "in essence", "en pratique", "in practice", "practically", "pratiquement",
  "effectivement", "in effect", "essentiellement", "virtually", "virtuellement", "relativement",
  "relatively",
];

const VERB_ENDINGS_FR = /(er|ez|ons|ont|ent|ais|ait|ions|iez|aient|ai|as|at|âmes|âtes|èrent|rai|ras|ra|rons|rés|ront|erais|erait|erions|eriez|eraient|erai|eras|era|erons|erez|eront)$/iu;
const VERB_ENDINGS_EN = /(ing|ed|es|s|d)$/i;
const NOUN_BLACKLIST = /(eur|ier|aire|oire|iste|tion|sion|ment|ness|nesses|ments|or|ary|ory|ry|ly|al|ial|ian|ism|ist|ship|hood|dom|ful|less|ous|ive|able)$/i;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const words = (text: string) => text.match(WORD_RE) ?? [];
const sentences = (text: string) => text.match(SENTENCE_RE) ?? (text.trim() ? [text.trim()] : []);

function entropy(tokens: string[]): number {
  if (!tokens.length) return 0;
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  let h = 0;
  for (const count of counts.values()) {
    const p = count / tokens.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!mean) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function countPhraseHits(text: string, phrases: string[]): number {
  const lower = text.toLocaleLowerCase();
  return phrases.reduce((n, phrase) => n + (lower.match(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "giu"))?.length ?? 0), 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function signatureHits(text: string) {
  const groups: Record<string, RegExp[]> = {
    gpt: GPT_SIGNATURES,
    claude: CLAUDE_SIGNATURES,
    llama: LLAMA_SIGNATURES,
    gemini: GEMINI_SIGNATURES,
  };
  const hits: Record<string, number> = {};
  for (const [name, patterns] of Object.entries(groups)) {
    hits[name] = patterns.reduce((n, pattern) => n + (pattern.test(text) ? 1 : 0), 0);
  }
  return hits;
}

export function extractPythonDetectorFeatures(text: string): PythonDetectorFeatures {
  const normalized = text.normalize("NFC").replace(/\s+/g, " ").trim();
  const tokens = words(normalized).map(w => w.toLocaleLowerCase());
  const unique = new Set(tokens);
  const sents = sentences(normalized);
  const lengths = sents.map(s => words(s).length).filter(Boolean);
  const hits = signatureHits(normalized);
  const totalSignatureHits = Object.values(hits).reduce((a, b) => a + b, 0);

  const entropyValue = entropy(tokens);
  const entropyNormalized = tokens.length > 1 ? clamp((entropyValue / Math.log2(tokens.length)) * 100) : 0;
  const verbTokens = tokens.filter(token => (VERB_ENDINGS_FR.test(token) || VERB_ENDINGS_EN.test(token)) && !NOUN_BLACKLIST.test(token));
  const verbDiversity = verbTokens.length ? (new Set(verbTokens).size / verbTokens.length) * 100 : 0;
  const hedgeCount = countPhraseHits(normalized, HEDGING);
  const transitionCount = countPhraseHits(normalized, TRANSITIONS);
  const repetition = tokens.length > 1 ? 1 - unique.size / tokens.length : 0;
  const complexity = lengths.length ? clamp((lengths.reduce((a, b) => a + b, 0) / lengths.length) * 3.5) : 0;
  const punctuationCounts = normalized.match(PUNCT_RE) ?? [];
  const punctuationVariability = clamp(coefficientOfVariation(lengths.length ? lengths : [punctuationCounts.length]) * 100);

  const signatureScore = clamp(totalSignatureHits * 18);
  const hedgeScore = clamp((hedgeCount / Math.max(1, tokens.length)) * 1000);
  const transitionScore = clamp((transitionCount / Math.max(1, tokens.length)) * 900);
  const repetitionScore = clamp(repetition * 100);

  const overall = clamp(
    signatureScore * 0.34 +
    (100 - entropyNormalized) * 0.08 +
    (100 - verbDiversity) * 0.07 +
    hedgeScore * 0.12 +
    transitionScore * 0.14 +
    repetitionScore * 0.10 +
    Math.max(0, 65 - punctuationVariability) * 0.05 +
    Math.min(100, complexity) * 0.10,
  );

  return {
    signatureScore,
    entropyDiversityIndex: entropyNormalized,
    verbDiversity,
    hedgingPhrases: hedgeScore,
    transitionMarkers: transitionScore,
    repetitionPatterns: repetitionScore,
    avgSentenceComplexity: complexity,
    punctuationVariability,
    overallAiProbability: overall,
    signatureHits: hits,
  };
}

export function runPythonDetectorPort(text: string): PythonDetectorResult {
  const features = extractPythonDetectorFeatures(text);
  return {
    score: Math.round(features.overallAiProbability),
    probability: features.overallAiProbability / 100,
    features,
    engine: "python-detector-typescript-port",
  };
}
