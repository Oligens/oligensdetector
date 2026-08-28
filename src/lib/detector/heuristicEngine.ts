// ============================================================
// IA_DETECT_V2.1 — Voie 3 : Heuristique de repli (TypeScript pur)
// 18 features stylométriques · régression logistique pondérée ·
// signature IA potentielle · audit des références · O(n)
// ============================================================

export interface HeuristicResult {
  probabilite_IA: number;
  intervalle_confiance_95: [number, number];
  confiance_analyse: "Faible" | "Moyenne" | "Élevée";
  genre_detecte: string;
  rapport_detaille: Array<{ nom: string; z_score: number; contribution: number }>;
  decision_precaution: string;
}

export interface Features {
  mattr: number;
  yulesK: number;
  richesseMotsPleins: number;
  hapaxLegomena: number;
  burstiness: number;
  diversiteDebutsPhrase: number;
  densiteSubordonnees: number;
  entropiePOS: number;
  variancePonctuation: number;
  similariteInterPhrases: number;
  varianceEmotionnelle: number;
  cohesionGlobale: number;
  tauxTransitionStandard: number;
  perplexiteRelative: number;
  entropieCompression: number;
  scoreOriginalite: number;
  scoreExpressionsIA: number;
  uniformiteStyle: number;
}

const STOPWORDS = new Set([
  "le", "la", "les", "des", "un", "une", "de", "du", "au", "aux", "ce", "cet", "cette",
  "ces", "mon", "ton", "son", "notre", "votre", "leur", "me", "te", "se", "nous", "vous",
  "ils", "elles", "on", "y", "en", "dans", "par", "pour", "sur", "sous", "avec", "sans",
  "chez", "entre", "parmi", "pendant", "depuis", "devant", "derrière", "contre", "malgré",
  "est", "sont", "était", "étaient", "ai", "as", "avons", "avez", "ont", "aura",
  "que", "qui", "dont", "où", "lorsque", "puisque", "quoique", "si", "comme", "quand",
  "the", "a", "an", "of", "to", "for", "with", "on", "at", "from", "by", "in", "into",
  "through", "during", "including", "is", "am", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "must", "shall", "i", "you", "he", "she", "it", "we", "they", "my",
  "your", "his", "her", "our", "their", "him", "us", "them", "this", "that",
  "these", "those", "then", "than", "so", "very", "too", "much", "more", "less", "most",
]);

const TRANSITION_WORDS = new Set([
  "however", "therefore", "consequently", "indeed", "moreover", "furthermore", "nevertheless",
  "conversely", "additionally", "cependant", "par", "conséquent", "effet", "ailleurs",
  "revanche", "outre", "égard", "surcroît",
]);

const IA_EXPRESSIONS = [
  "il est important de noter", "il convient de souligner", "il faut garder à l'esprit",
  "dans le paysage actuel", "il s'agit d'un enjeu majeur", "cette approche permet",
  "il est essentiel de comprendre", "d'un point de vue", "il est également important",
  "il est à noter que", "il est intéressant de constater", "en ce qui concerne",
  "dans ce contexte", "de manière générale", "il est nécessaire de", "il est recommandé de",
  "il est préférable de", "on peut affirmer que", "il apparaît clairement que",
  "il est évident que", "il est clair que", "il ressort que", "il va de soi que",
  "force est de constater que", "il est utile de rappeler que",
  "it is important to note", "it should be noted", "it is worth noting",
  "in the current landscape", "this approach allows", "it is crucial to understand",
  "that being said", "from a perspective", "plays a crucial role",
];

const SUBORDINATION_WORDS = new Set([
  "que", "qui", "dont", "où", "lequel", "laquelle", "lesquels", "lesquelles",
  "that", "which", "who", "whom", "whose", "when", "where", "why", "because",
  "since", "although", "though", "while", "whereas", "unless", "until", "if",
]);

const SENTIMENT_LEXICON: Record<string, number> = {
  good: 1, great: 1, excellent: 1, amazing: 1, wonderful: 1, beautiful: 1, happy: 1,
  love: 1, best: 1, fantastic: 1, bon: 1, beau: 1, super: 1, formidable: 1,
  heureux: 1, amour: 1, meilleur: 1, génial: 1,
  bad: -1, terrible: -1, awful: -1, horrible: -1, worst: -1, ugly: -1, sad: -1,
  hate: -1, disappointing: -1, poor: -1, mauvais: -1, triste: -1, haïr: -1,
  décevant: -1, pauvre: -1,
};

const STATS_REF = {
  mean: [
    0.82, 18.5, 0.65, 0.38, 1.15, 2.4, 0.12, 0.55, 0.75, 0.28,
    0.45, 0.55, 0.035, 4.2, 0.85, 0.65, 0.08, 0.25,
  ],
  std: [
    0.06, 0.8, 0.12, 0.1, 0.35, 0.7, 0.04, 0.18, 0.2, 0.09,
    0.18, 0.14, 0.015, 0.45, 0.08, 0.12, 0.06, 0.12,
  ],
};

const HEURISTIC_WEIGHTS = [
  0.12, 0.1, 0.08, 0.06, 0.14, 0.09, 0.07, 0.11, 0.05, 0.13,
  0.04, 0.06, 0.16, 0.18, 0.08, 0.07, 0.2, 0.09,
];

const FEATURE_NAMES = [
  "MATTR (diversité mobile)", "Yule's K (répétition)", "Richesse mots pleins", "Hapax Legomena",
  "Burstiness (rythme)", "Diversité débuts de phrase", "Densité subordonnées", "Entropie grammaticale",
  "Variance ponctuation", "Similarité inter-phrases", "Variance émotionnelle", "Cohésion globale",
  "Taux transitions discursives", "Entropie caractères (perplexité)", "Redondance bigrammes",
  "Originalité n-grammes", "Score expressions IA", "Uniformité du style",
];

/* ---------- Tokenisation ---------- */

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
}

export function sentencize(text: string): string[] {
  return text.split(/[.!?]\s+|\n{2,}/).filter((s) => s.trim().length > 0);
}

export function countWords(text: string): number {
  return tokenize(text).length;
}

function chunkText(text: string, nbChunks: number): string[] {
  const sentences = sentencize(text);
  if (sentences.length < nbChunks) return [text];
  const chunkSize = Math.ceil(sentences.length / nbChunks);
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    chunks.push(sentences.slice(i, i + chunkSize).join(". "));
  }
  return chunks;
}

/* ---------- Extraction des 18 features ---------- */

export class FeatureExtractor {
  private text: string;
  private tokens: string[];
  private sentences: string[];
  private contentWords: string[];

  constructor(text: string) {
    this.text = text;
    this.tokens = tokenize(text);
    this.sentences = sentencize(text);
    this.contentWords = this.tokens.filter((w) => !STOPWORDS.has(w));
  }

  computeMATTR(windowSize = 50): number {
    const tokens = this.tokens;
    if (tokens.length === 0) return 0;
    if (tokens.length < windowSize) return new Set(tokens).size / tokens.length;
    let sum = 0;
    let count = 0;
    const set = new Set<string>();
    for (let i = 0; i <= tokens.length - windowSize; i++) {
      set.clear();
      for (let j = i; j < i + windowSize; j++) set.add(tokens[j]);
      sum += set.size / windowSize;
      count++;
    }
    return count > 0 ? sum / count : 0;
  }

  computeYulesK(): number {
    const freq: Record<string, number> = {};
    for (const w of this.tokens) freq[w] = (freq[w] || 0) + 1;
    const M1 = this.tokens.length;
    let M2 = 0;
    for (const f of Object.values(freq)) M2 += f * f;
    if (M1 === 0) return 0;
    return (10000 * (M2 - M1)) / (M1 * M1);
  }

  computeRichnessContentWords(): number {
    const total = this.contentWords.length;
    if (total === 0) return 0;
    return new Set(this.contentWords).size / total;
  }

  computeHapax(): number {
    const freq: Record<string, number> = {};
    for (const w of this.tokens) freq[w] = (freq[w] || 0) + 1;
    let hapax = 0;
    for (const f of Object.values(freq)) if (f === 1) hapax++;
    return this.tokens.length > 0 ? hapax / this.tokens.length : 0;
  }

  computeBurstiness(): number {
    const lengths = this.sentences.map((s) => tokenize(s).length).filter((l) => l > 0);
    if (lengths.length < 2) return 0;
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    if (mean === 0) return 0;
    const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
    return Math.sqrt(variance) / mean;
  }

  computeDiversitySentenceStarts(): number {
    const starts: string[] = [];
    for (const s of this.sentences) {
      const words = tokenize(s);
      if (words.length >= 3) starts.push(words.slice(0, 3).join(" "));
      else if (words.length > 0) starts.push(words.join(" "));
    }
    if (starts.length < 2) return 0;
    const freq: Record<string, number> = {};
    for (const start of starts) freq[start] = (freq[start] || 0) + 1;
    let entropy = 0;
    for (const f of Object.values(freq)) {
      const p = f / starts.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  computeSubordinationDensity(): number {
    let count = 0;
    for (const w of this.tokens) if (SUBORDINATION_WORDS.has(w)) count++;
    return this.tokens.length > 0 ? count / this.tokens.length : 0;
  }

  computeEntropyPOS(): number {
    const categories = { stop: 0, content: 0, punct: 0, number: 0 };
    for (const w of this.tokens) {
      if (STOPWORDS.has(w)) categories.stop++;
      else if (/^\d+$/.test(w)) categories.number++;
      else categories.content++;
    }
    const punctMatches = this.text.match(/[.,;:!?()"'`]/g);
    categories.punct = punctMatches ? punctMatches.length : 0;
    const total = categories.stop + categories.content + categories.punct + categories.number;
    if (total === 0) return 0;
    let entropy = 0;
    for (const val of Object.values(categories)) {
      if (val > 0) {
        const p = val / total;
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  computePunctuationVariance(): number {
    const counts = this.sentences.map((s) => (s.match(/[.;:!?]/g) || []).length);
    if (counts.length < 2) return 0;
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    return Math.sqrt(variance);
  }

  computeInterSentenceSimilarity(): number {
    if (this.sentences.length < 2) return 0;
    const wordSets = this.sentences.map((s) => new Set(tokenize(s)));
    let totalSim = 0;
    let pairs = 0;
    const maxPairs = Math.min(this.sentences.length - 1, 200);
    for (let i = 0; i < maxPairs; i++) {
      const a = wordSets[i];
      const b = wordSets[i + 1];
      if (a.size === 0 || b.size === 0) continue;
      let inter = 0;
      for (const w of a) if (b.has(w)) inter++;
      const union = a.size + b.size - inter;
      if (union > 0) {
        totalSim += inter / union;
        pairs++;
      }
    }
    return pairs > 0 ? totalSim / pairs : 0;
  }

  computeEmotionalVariance(): number {
    const scores: number[] = [];
    for (const s of this.sentences) {
      let sum = 0;
      let count = 0;
      for (const w of tokenize(s)) {
        const val = SENTIMENT_LEXICON[w];
        if (val !== undefined) {
          sum += val;
          count++;
        }
      }
      scores.push(count > 0 ? sum / count : 0);
    }
    if (scores.length < 2) return 0;
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
    return Math.sqrt(variance);
  }

  computeGlobalCohesion(): number {
    const paragraphs = this.text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    if (paragraphs.length < 2) return 0;
    const sets = paragraphs.map((p) => new Set(tokenize(p)));
    let totalSim = 0;
    let pairs = 0;
    const max = Math.min(paragraphs.length, 10);
    for (let i = 0; i < max; i++) {
      for (let j = i + 1; j < max; j++) {
        const a = sets[i];
        const b = sets[j];
        if (a.size === 0 || b.size === 0) continue;
        let inter = 0;
        for (const w of a) if (b.has(w)) inter++;
        const union = a.size + b.size - inter;
        if (union > 0) totalSim += inter / union;
        pairs++;
      }
    }
    return pairs > 0 ? totalSim / pairs : 0;
  }

  computeTransitionRate(): number {
    let count = 0;
    for (const w of this.tokens) if (TRANSITION_WORDS.has(w)) count++;
    return this.tokens.length > 0 ? count / this.tokens.length : 0;
  }

  computeCharEntropy(): number {
    const freq: Record<string, number> = {};
    for (const char of this.text.toLowerCase()) {
      if (char.trim().length === 0) continue;
      freq[char] = (freq[char] || 0) + 1;
    }
    const total = Object.values(freq).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    let entropy = 0;
    for (const f of Object.values(freq)) {
      const p = f / total;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  computeBigramEntropy(): number {
    const str = this.text.toLowerCase().replace(/\s+/g, " ");
    if (str.length < 3) return 0;
    const freq: Record<string, number> = {};
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      if (bigram.trim().length < 2) continue;
      freq[bigram] = (freq[bigram] || 0) + 1;
    }
    const total = Object.values(freq).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    let entropy = 0;
    for (const f of Object.values(freq)) {
      const p = f / total;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  computeOriginality(): number {
    const tokens = this.tokens;
    if (tokens.length < 10) return 0.5;
    const trigrams = new Set<string>();
    for (let i = 0; i < tokens.length - 2; i++) trigrams.add(tokens.slice(i, i + 3).join(" "));
    const uniqueRatio = trigrams.size / Math.min(tokens.length - 2, 1);
    return Math.min(1, uniqueRatio / 0.15);
  }

  computeExpressionScore(): number {
    const lower = this.text.toLowerCase();
    let count = 0;
    for (const expr of IA_EXPRESSIONS) if (lower.includes(expr)) count++;
    return Math.min(1, count / 8);
  }

  computeStyleUniformity(): number {
    const chunks = chunkText(this.text, 4);
    if (chunks.length < 2) return 0;
    const scores: number[] = [];
    for (const chunk of chunks) {
      const extractor = new FeatureExtractor(chunk);
      scores.push(extractor.computeMATTR() + extractor.computeBurstiness());
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (mean === 0) return 0;
    const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
    return Math.sqrt(variance) / mean;
  }

  extractAll(): Features {
    return {
      mattr: this.computeMATTR(),
      yulesK: this.computeYulesK(),
      richesseMotsPleins: this.computeRichnessContentWords(),
      hapaxLegomena: this.computeHapax(),
      burstiness: this.computeBurstiness(),
      diversiteDebutsPhrase: this.computeDiversitySentenceStarts(),
      densiteSubordonnees: this.computeSubordinationDensity(),
      entropiePOS: this.computeEntropyPOS(),
      variancePonctuation: this.computePunctuationVariance(),
      similariteInterPhrases: this.computeInterSentenceSimilarity(),
      varianceEmotionnelle: this.computeEmotionalVariance(),
      cohesionGlobale: this.computeGlobalCohesion(),
      tauxTransitionStandard: this.computeTransitionRate(),
      perplexiteRelative: this.computeCharEntropy(),
      entropieCompression: this.computeBigramEntropy(),
      scoreOriginalite: this.computeOriginality(),
      scoreExpressionsIA: this.computeExpressionScore(),
      uniformiteStyle: this.computeStyleUniformity(),
    };
  }
}

/* ---------- Détecteur principal ---------- */

export class IAHeuristicDetector {
  analyze(text: string, genre: string = "generic"): HeuristicResult {
    const cleanText = text.replace(/\s+/g, " ").trim();
    const wordCount = countWords(cleanText);

    if (wordCount < 100) {
      return {
        probabilite_IA: 0.5,
        intervalle_confiance_95: [0.4, 0.6],
        confiance_analyse: "Faible",
        genre_detecte: genre,
        rapport_detaille: [],
        decision_precaution: "Texte trop court pour une analyse fiable (< 100 mots)",
      };
    }

    const features = new FeatureExtractor(cleanText).extractAll();
    const featureArray = Object.values(features);

    const zScores: number[] = [];
    for (let i = 0; i < featureArray.length; i++) {
      const std = STATS_REF.std[i];
      let z = std > 0 ? (featureArray[i] - STATS_REF.mean[i]) / std : 0;
      z = Math.max(-4, Math.min(4, z));
      zScores.push(z);
    }

    let logit = 0;
    const contributions: { nom: string; z_score: number; contribution: number }[] = [];
    for (let i = 0; i < zScores.length; i++) {
      const contrib = zScores[i] * HEURISTIC_WEIGHTS[i];
      logit += contrib;
      contributions.push({ nom: FEATURE_NAMES[i], z_score: zScores[i], contribution: contrib });
    }

    const proba = 1 / (1 + Math.exp(-logit));
    const uncertainty = 0.12 * (1 + (1 - Math.abs(proba - 0.5) * 2));
    const icInf = Math.max(0, proba - uncertainty);
    const icSup = Math.min(1, proba + uncertainty);

    const confianceScore = Math.min(1, wordCount / 1500);
    const confianceAnalyse: "Faible" | "Moyenne" | "Élevée" =
      confianceScore < 0.3 ? "Faible" : confianceScore < 0.65 ? "Moyenne" : "Élevée";

    const topContribs = contributions
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 5);

    let decision: string;
    if (proba > 0.85) decision = "Présence forte d'indices compatibles avec une génération IA.";
    else if (proba > 0.6) decision = "Indices modérés. Une interprétation prudente est recommandée.";
    else decision = "Aucun indice significatif de génération IA détecté.";

    return {
      probabilite_IA: proba,
      intervalle_confiance_95: [icInf, icSup],
      confiance_analyse: confianceAnalyse,
      genre_detecte: genre,
      rapport_detaille: topContribs,
      decision_precaution: decision,
    };
  }
}

/* ---------- Extensions OLIGENS ---------- */

export interface AISignatureModel {
  model: string;
  vendor: string;
  share: number;
}

export type RunLanguage = "fr" | "en" | "auto";

export interface RunOptions {
  language?: RunLanguage;
}

export interface FullAnalysisResult extends HeuristicResult {
  features: Features;
  z_scores: number[];
  signature: { modele_principal: string | null; note: string; modeles: AISignatureModel[] };
  statistiques: { mots: number; phrases: number; caracteres: number };
  langue: "fr" | "en" | "mixte";
  references: { total: number; douteuses: number };
  plagiat_estime: number;
  processing: { mode: "direct" | "worker"; durationMs: number; words: number };
}

function detectLanguage(tokens: string[]): "fr" | "en" | "mixte" {
  const FR = new Set(["le", "la", "les", "des", "une", "est", "que", "qui", "dans", "pour", "avec", "sur", "ce", "cette", "et", "du", "au", "sont", "par", "plus"]);
  const EN = new Set(["the", "and", "of", "to", "is", "in", "that", "for", "with", "are", "was", "on", "as", "at", "by", "this", "it", "from", "or", "an"]);
  const sample = tokens.length > 20000 ? tokens.filter((_, i) => i % 7 === 0) : tokens;
  let fr = 0;
  let en = 0;
  for (const t of sample) {
    if (FR.has(t)) fr++;
    else if (EN.has(t)) en++;
  }
  if (fr === 0 && en === 0) return "mixte";
  const ratio = fr / (fr + en);
  if (ratio >= 0.66) return "fr";
  if (ratio <= 0.34) return "en";
  return "mixte";
}

function attributeSignature(z: number[], proba: number): FullAnalysisResult["signature"] {
  const s: Record<string, number> = {
    "GPT-4o": 24,
    "Claude 3.5 Sonnet": 20,
    "Gemini 1.5 Pro": 19,
    "Llama 3.1 70B": 13,
    "Mistral Large 2": 10,
  };
  s["GPT-4o"] += Math.max(0, z[16]) * 13 + Math.max(0, z[12]) * 7;
  if (z[4] < -0.35 && (z[13] > 0.15 || z[7] > 0.25)) {
    s["Claude 3.5 Sonnet"] += Math.min(2.5, -z[4]) * 9 + Math.max(0, z[13]) * 4;
    s["Gemini 1.5 Pro"] += Math.min(2.5, -z[4]) * 6 + Math.max(0, z[7]) * 5;
  }
  s["Gemini 1.5 Pro"] += Math.max(0, z[17]) * 7 + Math.max(0, z[9]) * 5;
  s["Llama 3.1 70B"] += Math.max(0, -z[0]) * 6 + Math.max(0, z[1]) * 3.5;
  s["Mistral Large 2"] += Math.max(0, z[5]) * 3.5 + Math.max(0, z[10]) * 3 + Math.max(0, -z[15]) * 2;

  const vendors: Record<string, string> = {
    "GPT-4o": "OpenAI",
    "Claude 3.5 Sonnet": "Anthropic",
    "Gemini 1.5 Pro": "Google",
    "Llama 3.1 70B": "Meta",
    "Mistral Large 2": "Mistral AI",
  };
  const total = Object.values(s).reduce((a, b) => a + b, 0) || 1;
  const modeles: AISignatureModel[] = Object.entries(s).map(([model, v]) => ({
    model,
    vendor: vendors[model],
    share: Math.round((v / total) * 100),
  }));
  modeles[0].share += 100 - modeles.reduce((a, m) => a + m.share, 0);
  modeles.sort((a, b) => b.share - a.share);

  if (proba < 0.35) {
    return { modele_principal: null, note: "Profil majoritairement humain — aucune signature de modèle ne se détache nettement.", modeles };
  }
  const primary = modeles[0].model;
  return { modele_principal: primary, note: `Signature dominante : ${primary} (corrélation stylistique, non déterministe).`, modeles };
}

function auditReferences(text: string): { total: number; douteuses: number } {
  const parenthetical = text.match(/\(\s*[A-ZÀ-ÖØ-Þ][\w'’-]*(?:\s*(?:et al\.|&|et)\s*[\w'’-]*)?\s*,\s*\d{4}[a-z]?\s*\)/g) ?? [];
  const brackets = text.match(/\[\s*\d+\s*\]/g) ?? [];
  const total = parenthetical.length + brackets.length;
  const verified = (text.match(/\b10\.\d{4,9}\/[^\s)\]]+/g) ?? []).length + (text.match(/https?:\/\/\S+/g) ?? []).length;
  const douteuses = total === 0 ? 0 : Math.max(0, total - Math.min(verified, total));
  return { total, douteuses };
}

function internalDuplication(sentences: string[]): number {
  if (sentences.length < 2) return 0;
  const seen = new Map<string, number>();
  for (const s of sentences) {
    const k = s.trim().toLowerCase();
    if (k.length >= 50) seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  let dup = 0;
  for (const c of seen.values()) if (c > 1) dup += c;
  return dup / sentences.length;
}

export function runFullAnalysis(text: string, options: RunOptions = {}): FullAnalysisResult {
  const t0 = performance.now();
  const cleanText = text.replace(/\s+/g, " ").trim();

  const detector = new IAHeuristicDetector();
  const core = detector.analyze(cleanText, "generic");

  const extractor = new FeatureExtractor(cleanText);
  const features = extractor.extractAll();
  const values = Object.values(features);
  const z_scores = values.map((v, i) =>
    Math.max(-4, Math.min(4, STATS_REF.std[i] > 0 ? (v - STATS_REF.mean[i]) / STATS_REF.std[i] : 0))
  );

  const tokens = tokenize(cleanText);
  const sentences = sentencize(cleanText);
  const mots = countWords(cleanText);

  const langue = options.language && options.language !== "auto" ? options.language : detectLanguage(tokens);
  const signature = attributeSignature(z_scores, core.probabilite_IA);
  const references = auditReferences(text);

  const dup = internalDuplication(sentences);
  const plagiat_estime = Math.max(0, Math.min(40, Math.round(dup * 140 + (1 - features.scoreOriginalite) * 8)));

  return {
    ...core,
    features,
    z_scores,
    signature,
    statistiques: { mots, phrases: sentences.length, caracteres: cleanText.length },
    langue,
    references,
    plagiat_estime,
    processing: { mode: "direct", durationMs: Math.round(performance.now() - t0), words: mots },
  };
}
