// ============================================================
// HUMANIZER_V1_ULTIMATE — Moteur local de neutralisation des traces IA
// Objectif : probabilité IA < 5 % · lexiques monolingues FR/EN ·
// marqueurs anti-glitch · circuit breaker 8 s · yield entre blocs
// ============================================================
import { countWords, IAHeuristicDetector, sentencize, type HeuristicResult } from "../detector/heuristicEngine";

export const HUMANIZER_VERSION = "V1_ULTIMATE";

export interface HumanizerConfig {
  seuilCible: number;
  iterationsMax: number;
  intensite: number;
  langue: "fr" | "en" | "mixte";
  modeAggressif: boolean;
}

export interface IterationAnomaly {
  nom: string;
  z_score: number;
  contribution: number;
}

export interface IterationRecord {
  iteration: number;
  proba: number;
  anomalies: IterationAnomaly[];
}

export interface HumanizerReport {
  proba_initiale: number;
  proba_finale: number;
  reduction_pourcent: number;
  iterations_realisees: number;
  engineMode?: "worker" | "direct";
  viaApi?: boolean;
  model?: string;
  historique: IterationRecord[];
  features_finales: IterationAnomaly[];
  decision: string;
  config: {
    seuilCible: number;
    intensite: number;
    iterationsMax: number;
    modeAggressif: boolean;
    langue: HumanizerConfig["langue"];
  };
  partial?: boolean;
  warning?: string;
}

export interface HumanizerProgress {
  iteration: number;
  total: number;
  proba: number;
  phase: string;
  anomalies: IterationAnomaly[];
}

export interface HumanizeOutcome {
  texteFinal: string;
  rapport: HumanizerReport;
}

const DEFAULT_CONFIG: HumanizerConfig = {
  seuilCible: 0.05,
  iterationsMax: 12,
  intensite: 0.95,
  langue: "mixte",
  modeAggressif: true,
};

const MAX_BUDGET_MS = 8000;
const DEEP_EVERY = 4;
const PARTIAL_WARNING = "Humanisation partielle — optimisée pour préserver les performances.";

/* ---------- Lexiques monolingues (purification stricte) ---------- */

interface FillerFamily {
  start: string[];
  emotional: string[];
  hesitation: string[];
  interjections: string[];
}

const FILLERS_FR: FillerFamily = {
  start: ["Bon,", "Eh bien,", "Alors,", "Bref,", "Tiens,", "Franchement,", "En fait,", "Du coup,", "En vérité,", "De toute façon,", "Après tout,", "Au fond,"],
  emotional: ["franchement", "vraiment", "absolument", "totalement", "simplement", "clairement", "honnêtement", "évidemment", "assurément"],
  hesitation: ["en quelque sorte", "pour ainsi dire", "si je puis dire", "en réalité", "d'une certaine façon", "en somme", "à vrai dire"],
  interjections: ["Ah", "Oh", "Eh", "Hé", "Tiens", "Ben", "Allez", "Voilà"],
};

const FILLERS_EN: FillerFamily = {
  start: ["Well,", "You know,", "Honestly,", "Actually,", "Listen,", "So,", "The thing is,", "Basically,"],
  emotional: ["truly", "really", "absolutely", "honestly", "definitely", "obviously", "clearly"],
  hesitation: ["sort of", "kind of", "in a way", "pretty much", "so to speak", "in fact"],
  interjections: ["Hey", "Wow", "Well", "Gee", "Gosh"],
};

const SYNONYMS_FR: Record<string, string[]> = {
  cependant: ["mais", "pourtant", "toutefois", "néanmoins", "quand même"],
  "en effet": ["effectivement", "certes", "en réalité", "à vrai dire", "en fait"],
  "par conséquent": ["donc", "ainsi", "de ce fait", "si bien que", "en conséquence"],
  "par ailleurs": ["d'un autre côté", "en outre", "de surcroît", "d'autre part"],
  "en conclusion": ["pour finir", "finalement", "en résumé", "bref", "au final"],
  utiliser: ["employer", "se servir de", "recourir à", "mobiliser"],
  significatif: ["important", "marquant", "notable", "majeur", "substantiel"],
  nombreux: ["beaucoup de", "quantité de", "une multitude de", "plusieurs"],
  démontrer: ["montrer", "prouver", "établir", "révéler", "souligner"],
  obtenir: ["avoir", "recevoir", "décrocher", "se procurer"],
  aider: ["secourir", "soutenir", "épauler", "accompagner"],
  tenter: ["essayer", "chercher à", "s'efforcer de"],
  suffisant: ["assez", "ample", "convenable", "satisfaisant"],
};

const SYNONYMS_EN: Record<string, string[]> = {
  therefore: ["so", "thus", "hence", "as a result", "which means"],
  however: ["but", "yet", "though", "still", "even so"],
  moreover: ["besides", "also", "furthermore", "what's more"],
  nevertheless: ["yet", "still", "even so", "that said"],
  "in conclusion": ["to sum up", "finally", "all in all", "in short"],
  utilize: ["use", "employ", "apply", "make use of"],
  significant: ["major", "notable", "key", "substantial"],
  numerous: ["many", "several", "countless", "plenty of"],
  demonstrate: ["show", "prove", "display", "reveal", "highlight"],
  obtain: ["get", "gain", "secure", "achieve"],
  assist: ["help", "aid", "support", "lend a hand"],
  attempt: ["try", "seek", "undertake"],
  sufficient: ["enough", "ample", "adequate"],
};

const ADVERBS_FR = ["très", "vraiment", "absolument", "extrêmement", "particulièrement", "remarquablement"];
const ADVERBS_EN = ["very", "really", "absolutely", "extremely", "particularly", "remarkably"];
const INCISES_FR = ["à mon avis", "je pense", "en fait", "à vrai dire", "autrement dit"];
const INCISES_EN = ["in my opinion", "I think", "you know", "actually", "to be honest"];
const SPLIT_CONNECTORS_FR = ["Alors,", "Ensuite,", "Et puis,", "Puis,", "En fait,", "Du coup,"];
const SPLIT_CONNECTORS_EN = ["Well,", "So,", "You see,", "Now,"];

const TOKEN_SPLIT = /[^a-zàâçéèêëîïôûùüÿæœ0-9']+/;

/* ---------- Marqueurs anti-glitch ---------- */
const SENTINEL = "\uE000";
const mark = (s: string): string => SENTINEL + s + SENTINEL;
const isMarked = (s: string): boolean => s.includes(SENTINEL);

const INTRO_WORDS = [
  "cependant", "pourtant", "néanmoins", "toutefois", "en effet", "en fait", "en vérité",
  "bref", "du coup", "alors", "donc", "ainsi", "ensuite", "puis", "enfin", "bon",
  "eh bien", "franchement", "honnêtement", "vraiment", "absolument", "de toute façon",
  "après tout", "au fond", "d'ailleurs", "en outre", "de plus", "or", "finalement",
  "au final", "pour finir", "en résumé", "well", "actually", "honestly", "listen",
  "basically", "anyway", "moreover", "however", "therefore", "nevertheless", "so",
  "then", "finally", "hey", "wow", "truly", "really", "absolutely", "definitely",
];
const INTRO_ALT = INTRO_WORDS.slice()
  .sort((a, b) => b.length - a.length)
  .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

/* ---------- Langue dominante ---------- */

const FR_FUNC = new Set(["le", "la", "les", "des", "une", "est", "sont", "que", "qui", "dans", "pour", "avec", "sur", "ce", "cette", "et", "du", "au", "pas", "plus", "mais", "nous", "ont", "par", "en", "ne"]);
const EN_FUNC = new Set(["the", "and", "of", "to", "is", "in", "that", "for", "with", "are", "was", "on", "as", "at", "by", "this", "it", "from", "or", "an", "be", "not", "have"]);

function detectTextLang(text: string): "fr" | "en" {
  const tokens = text.toLowerCase().split(TOKEN_SPLIT).filter(Boolean);
  const sample = tokens.length > 4000 ? tokens.filter((_, i) => i % 5 === 0) : tokens;
  let fr = 0;
  let en = 0;
  for (const t of sample) {
    if (FR_FUNC.has(t)) fr++;
    else if (EN_FUNC.has(t)) en++;
  }
  return fr >= en ? "fr" : "en";
}

/* ---------- Yield + estimation rapide ---------- */

function yieldToBrowser(): Promise<void> {
  if (typeof requestAnimationFrame === "function") {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(0);
  });
}

const IA_PHRASES = [
  "il est important de noter", "il convient de souligner", "il faut garder à l'esprit",
  "dans le paysage actuel", "il s'agit d'un enjeu majeur", "cette approche permet",
  "il est essentiel de comprendre", "d'un point de vue", "il est à noter que",
  "il est intéressant de constater", "en ce qui concerne", "dans ce contexte",
  "de manière générale", "il est nécessaire de", "il est recommandé de",
  "on peut affirmer que", "il est évident que", "il ressort que", "il va de soi que",
  "force est de constater que",
];

const TRANSITION_TOKENS = new Set([
  "cependant", "toutefois", "néanmoins", "pourtant", "ensuite", "puis", "enfin", "donc",
  "ainsi", "or", "mais", "however", "therefore", "moreover", "furthermore", "nevertheless",
  "consequently", "additionally", "thus", "hence", "yet",
]);

function fastProbaEstimate(text: string): number {
  const tokens = text.toLowerCase().split(TOKEN_SPLIT).filter(Boolean);
  if (tokens.length === 0) return 0.5;
  const lower = text.toLowerCase();

  let exprHits = 0;
  for (const p of IA_PHRASES) if (lower.includes(p)) exprHits++;
  const exprScore = Math.min(1, exprHits / 6);

  let tr = 0;
  for (const t of tokens) if (TRANSITION_TOKENS.has(t)) tr++;
  const trScore = Math.min(1, tr / tokens.length / 0.03);

  const lengths = sentencize(text).map((s) => s.split(/\s+/).length).filter((l) => l > 0);
  let rhythmScore = 0.5;
  if (lengths.length >= 3) {
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const cov = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length) / mean;
    rhythmScore = Math.max(0, Math.min(1, 1 - cov / 1.2));
  }

  return Math.max(0.01, Math.min(0.99, 0.45 * exprScore + 0.3 * trScore + 0.25 * rhythmScore));
}

/* ---------- Lissage syntaxique impératif ---------- */

export function lisserTexteUltimate(text: string, opts: { stripMarkers: boolean } = { stripMarkers: false }): string {
  let t = text;
  if (opts.stripMarkers) t = t.replace(new RegExp(SENTINEL, "g"), "");

  t = t.replace(/\s+/g, " ").trim();

  // Doublons de mots consécutifs (« que que », « vraiment vraiment »)
  const dupRe = /(\p{L}[\p{L}'’-]*)[ \t]+\1(?![\p{L}'’-])/giu;
  for (let i = 0; i < 3; i++) t = t.replace(dupRe, "$1");

  // Ponctuations aberrantes
  t = t.replace(/(?:\s*,){2,}/g, ",");
  t = t.replace(/,\s*([.!?…])/g, "$1");
  t = t.replace(/([.!?…])\s*,/g, "$1");
  t = t.replace(/([.!?…])\s*([.!?…])/g, "$1");
  t = t.replace(/([?!])\1+/g, "$1");
  t = t.replace(/^(\s*)[,;]+\s*/g, "$1");

  // Empilements de connecteurs en tête (« Écoutez, finalement, » → « Finalement, »)
  const stackedIntro = new RegExp(`^(\\s*(?:${INTRO_ALT}))\\s*,?\\s+(?=(?:${INTRO_ALT})\\s*[,;]?\\s)`, "i");
  t = t
    .split(/(?<=[.!?…])\s+/)
    .map((chunk) => {
      let s = chunk;
      let guard = 0;
      while (stackedIntro.test(s) && guard++ < 4) s = s.replace(stackedIntro, "");
      return s.replace(/^(\s*)(\p{Ll})/u, (_m, sp: string, c: string) => sp + c.toUpperCase());
    })
    .join(" ");

  t = t.replace(/\s+([,.;!?:])/g, "$1");
  t = t.replace(/(^|[.!?…]\s+)(\p{Ll})/gu, (_m, pre: string, c: string) => pre + c.toUpperCase());
  if (t.length > 0 && !/[.!?…]$/.test(t)) t += ".";
  return t.trim();
}

/* ---------- Mutateur ---------- */

export class TextMutatorUltimate {
  private rng: () => number;
  private lang: "fr" | "en" = "fr";
  private synonymCache = new Map<string, string[] | null>();

  constructor(seed?: number) {
    this.rng = seed ? this.seededRandom(seed) : Math.random;
  }

  private seededRandom(seed: number): () => number {
    return function () {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  private pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(this.rng() * arr.length)];
  }

  private fillers(): FillerFamily {
    return this.lang === "fr" ? FILLERS_FR : FILLERS_EN;
  }

  private splitSentences(text: string): string[] {
    return text.match(/[^.!?]+[.!?]+/g) || [text];
  }

  mutatePhrasesUltimate(text: string, intensity: number): string {
    let result = text;
    const lower = result.toLowerCase();
    for (const phrase of IA_PHRASES) {
      if (!lower.includes(phrase)) continue;
      if (this.rng() >= intensity * 0.8) continue;
      const alt = mark(this.alternativeFor(phrase));
      result = result.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), alt);
    }
    return result;
  }

  private alternativeFor(iaPhrase: string): string {
    const FR: Record<string, string[]> = {
      important: ["faut vraiment retenir", "c'est un point clé", "c'est capital", "on doit y être attentif"],
      souligner: ["on voit bien", "c'est flagrant", "ce qui saute aux yeux"],
      noter: ["on remarque", "on peut observer", "ce qui est intéressant"],
      paysage: ["actuellement", "dans ce contexte", "à l'heure actuelle"],
      contexte: ["dans ce cadre", "sur ce point", "en l'occurrence"],
      approche: ["cette façon de faire", "cette méthode", "cette manière de procéder"],
      "point de vue": ["vu sous cet angle", "dans cette optique", "si on regarde bien"],
      enjeu: ["c'est un vrai sujet", "ça compte vraiment", "c'est un point décisif"],
      essentiel: ["il faut bien saisir", "on doit comprendre", "c'est à garder en tête"],
      conclure: ["pour finir", "finalement", "au final", "tout compte fait"],
      évident: ["c'est net", "on le voit bien", "c'est assez clair"],
      constater: ["on le voit", "on l'observe", "les faits sont là"],
      nécessaire: ["il faut", "on doit", "cela exige de"],
      recommander: ["mieux vaut", "il vaut mieux", "on gagnera à"],
      affirmer: ["on peut dire", "rien n'empêche de dire", "on soutiendra que"],
      "va de soi": ["naturellement", "évidemment", "cela tombe sous le sens"],
      "force est": ["on doit bien admettre", "il faut reconnaître", "disons-le"],
    };
    const EN: Record<string, string[]> = {
      important: ["key point is", "the thing to remember", "what really matters"],
      landscape: ["these days", "nowadays", "in today's world"],
      approach: ["this way", "this method"],
    };
    const lang = detectTextLang(iaPhrase);
    const alts = lang === "fr" ? FR : EN;
    for (const [key, list] of Object.entries(alts)) {
      if (iaPhrase.includes(key)) return this.pickRandom(list);
    }
    const fam = lang === "fr" ? FILLERS_FR : FILLERS_EN;
    const bridge = lang === "fr" ? this.pickRandom(["on peut dire que", "autrement dit", "en clair", "en d'autres termes"]) : this.pickRandom(["in other words", "to put it simply", "what I mean is"]);
    return `${this.pickRandom(fam.start)} ${bridge}`;
  }

  mutateBurstinessUltimate(text: string, intensity: number): string {
    const sentences = this.splitSentences(text);
    if (sentences.length < 3) return text;
    const out: string[] = [];
    let i = 0;
    const connectors = this.lang === "fr" ? SPLIT_CONNECTORS_FR : SPLIT_CONNECTORS_EN;
    while (i < sentences.length) {
      const current = sentences[i];
      const wc = current.split(/\s+/).length;
      if (wc < 8 && i > 0 && this.rng() < intensity * 0.8 && !isMarked(current)) {
        const prev = out.pop() || "";
        out.push((prev.trim() + " " + current.trim()).trim());
        i++;
        continue;
      }
      if (wc > 20 && this.rng() < intensity * 0.7 && !isMarked(current)) {
        const words = current.split(/\s+/);
        const mid = Math.floor(words.length * (0.3 + this.rng() * 0.4));
        out.push(words.slice(0, mid).join(" ") + ". ");
        const second = words.slice(mid).join(" ");
        out.push(mark(this.pickRandom(connectors)) + " " + second.charAt(0).toLowerCase() + second.slice(1));
        i++;
        continue;
      }
      out.push(current);
      i++;
    }
    return out.join(" ");
  }

  mutateSynonymsUltimate(text: string, intensity: number): string {
    const words = text.split(/\s+/);
    const langMap = this.lang === "fr" ? SYNONYMS_FR : SYNONYMS_EN;
    let substituted = 0;
    const maxSubs = Math.floor(words.length * intensity * 0.25);
    const out: string[] = [];
    for (const word of words) {
      const key = this.lang + ":" + word;
      let syns = this.synonymCache.get(key);
      if (syns === undefined) {
        const lower = word.toLowerCase().replace(/[^a-zàâçéèêëîïôûùüÿæœ-]/g, "");
        syns = langMap[lower] ?? null;
        this.synonymCache.set(key, syns);
      }
      if (syns && substituted < maxSubs && this.rng() < intensity * 0.5) {
        const chosen = this.pickRandom(syns);
        out.push(word[0] === word[0].toUpperCase() ? chosen.charAt(0).toUpperCase() + chosen.slice(1) : chosen);
        substituted++;
      } else {
        out.push(word);
      }
    }
    return out.join(" ");
  }

  mutateSentenceStartsUltimate(text: string, intensity: number): string {
    const sentences = this.splitSentences(text);
    if (sentences.length < 2) return text;
    const iaStarts = this.lang === "fr"
      ? ["cependant", "par", "en", "de", "d'ailleurs", "ensuite", "puis", "enfin"]
      : ["moreover", "therefore", "consequently", "however", "nevertheless", "furthermore", "additionally", "finally"];
    return sentences
      .map((s, idx) => {
        if (idx < 2 || this.rng() > intensity * 0.7) return s;
        if (isMarked(s)) return s;
        const words = s.trim().split(/\s+/);
        const first = (words[0] ?? "").toLowerCase().replace(/,$/, "");
        if (iaStarts.includes(first) || this.rng() < intensity * 0.3) {
          const filler = mark(this.pickRandom(this.fillers().start));
          const rest = words.slice(1).join(" ");
          return filler + " " + (rest.charAt(0).toLowerCase() + rest.slice(1));
        }
        return s;
      })
      .join(" ");
  }

  mutateTransitionsAndFillersUltimate(text: string, intensity: number): string {
    const fam = this.fillers();
    return this.splitSentences(text)
      .map((s) => {
        if (this.rng() > intensity * 0.5) return s;
        if (isMarked(s)) return s;
        const words = s.split(/\s+/);
        if (words.length < 5) return s;
        const pos = Math.floor(this.rng() * (words.length - 2)) + 1;
        const filler = mark(this.pickRandom([...fam.emotional, ...fam.hesitation, ...fam.interjections]));
        words.splice(pos, 0, filler);
        return words.join(" ");
      })
      .join(" ");
  }

  mutateEmotionUltimate(text: string, intensity: number): string {
    const adverbs = this.lang === "fr" ? ADVERBS_FR : ADVERBS_EN;
    const sentences = this.splitSentences(text);
    return sentences
      .map((s, idx) => {
        if (this.rng() > intensity * 0.4) return s;
        if (isMarked(s)) return s;
        const words = s.split(/\s+/);
        if (words.length < 4) return s;
        const pos = Math.floor(this.rng() * (words.length - 2));
        words.splice(pos + 1, 0, mark(this.pickRandom(adverbs)));
        if (idx > 0 && idx < sentences.length - 1 && this.rng() < intensity * 0.3 && s.trim().endsWith(".")) {
          const repl = this.pickRandom([".", "!", "…"]);
          return words.map((w, i) => (i === words.length - 1 ? w.slice(0, -1) + repl : w)).join(" ");
        }
        return words.join(" ");
      })
      .join(" ");
  }

  mutateRestructureUltimate(text: string, intensity: number): string {
    const sentences = this.splitSentences(text);
    if (sentences.length < 3) return text;
    const incises = this.lang === "fr" ? INCISES_FR : INCISES_EN;
    return sentences
      .map((s, idx) => {
        if (idx < 2 || this.rng() > intensity * 0.3) return s;
        if (isMarked(s)) return s;
        const words = s.split(/\s+/);
        if (words.length < 11 || this.rng() >= intensity * 0.3) return s;
        const pos = Math.floor(words.length * 0.4);
        words.splice(pos, 0, ", " + mark(this.pickRandom(incises)) + ",");
        return words.join(" ");
      })
      .join(" ");
  }

  async applyAllMutationsAsync(
    text: string,
    intensity: number,
    onPhase?: (phase: string) => void,
    yielder: () => Promise<void> = yieldToBrowser
  ): Promise<string> {
    this.lang = detectTextLang(text);
    let mutated = text;

    onPhase?.("neutralisation des expressions IA");
    mutated = this.mutatePhrasesUltimate(mutated, intensity);
    await yielder();

    onPhase?.("restructuration profonde (incises)");
    mutated = this.mutateRestructureUltimate(mutated, intensity);
    await yielder();

    const mutations = [
      this.mutateBurstinessUltimate.bind(this),
      this.mutateSynonymsUltimate.bind(this),
      this.mutateSentenceStartsUltimate.bind(this),
      this.mutateTransitionsAndFillersUltimate.bind(this),
      this.mutateEmotionUltimate.bind(this),
    ];

    for (let pass = 0; pass < 3; pass++) {
      onPhase?.(`passe stylistique ${pass + 1}/3 — burstiness & rythme`);
      for (let i = mutations.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [mutations[i], mutations[j]] = [mutations[j], mutations[i]];
      }
      for (const mut of mutations) {
        mutated = mut(mutated, intensity);
        await yielder();
      }
    }

    onPhase?.("lissage syntaxique");
    return lisserTexteUltimate(mutated, { stripMarkers: false });
  }
}

/* ---------- Algorithme principal ---------- */

export class TextHumanizerUltimate {
  private detector: IAHeuristicDetector;

  constructor() {
    this.detector = new IAHeuristicDetector();
  }

  private buildRapport(
    initial: HeuristicResult,
    final: HeuristicResult,
    cfg: HumanizerConfig,
    history: IterationRecord[],
    finalIteration: number,
    flags: { partial?: boolean; warning?: string } = {}
  ): HumanizerReport {
    const finalProba = final.probabilite_IA;
    const decision =
      finalProba < 0.05
        ? "Texte quasi-indistinguable d'un humain — probabilité IA inférieure à 5 %."
        : finalProba < 0.25
          ? "Traces IA fortement réduites — profil majoritairement humain."
          : "Réduction partielle — des marqueurs résiduels subsistent.";
    return {
      proba_initiale: initial.probabilite_IA,
      proba_finale: finalProba,
      reduction_pourcent: (initial.probabilite_IA - finalProba) * 100,
      iterations_realisees: finalIteration || cfg.iterationsMax,
      historique: history,
      features_finales: final.rapport_detaille,
      decision,
      config: {
        seuilCible: cfg.seuilCible,
        intensite: cfg.intensite,
        iterationsMax: cfg.iterationsMax,
        modeAggressif: cfg.modeAggressif,
        langue: cfg.langue,
      },
      partial: flags.partial,
      warning: flags.warning,
    };
  }

  /**
   * Exécution asynchrone avec progression temps réel.
   * Circuit breaker (8 s) + meilleur état conservé + analyses profondes
   * espacées (tous les DEEP_EVERY cycles, estimation rapide entre-deux).
   */
  async humanizeUltimateStream(
    text: string,
    config: Partial<HumanizerConfig> = {},
    onProgress?: (p: HumanizerProgress) => void,
    yielder: () => Promise<void> = yieldToBrowser
  ): Promise<HumanizeOutcome> {
    const cfg: HumanizerConfig = { ...DEFAULT_CONFIG, ...config };

    if (countWords(text) < 100) {
      const short = this.detector.analyze(text);
      return {
        texteFinal: text,
        rapport: {
          ...this.buildRapport(short, short, cfg, [], 0),
          iterations_realisees: 0,
          decision: "Texte trop court (< 100 mots) — humanisation non appliquée.",
        },
      };
    }

    const initialAnalysis = this.detector.analyze(text);
    const mutator = new TextMutatorUltimate();
    let currentText = text;
    const history: IterationRecord[] = [];
    let finalIteration = 0;
    let currentAnalysis = initialAnalysis;
    let currentProba = currentAnalysis.probabilite_IA;
    const intensityCap = cfg.modeAggressif ? 1 : 0.85;

    const deadline = performance.now() + MAX_BUDGET_MS;
    let bestText = text;
    let bestProba = currentProba;
    let timedOut = false;

    const EMIT_MIN_MS = 150;
    let lastEmitAt = 0;
    const emit = (p: HumanizerProgress, force = false) => {
      const now = Date.now();
      if (!force && now - lastEmitAt < EMIT_MIN_MS) return;
      lastEmitAt = now;
      onProgress?.(p);
    };

    for (let iter = 1; iter <= cfg.iterationsMax; iter++) {
      await yielder();

      if (performance.now() > deadline) {
        timedOut = true;
        break;
      }
      if (currentProba < cfg.seuilCible) {
        finalIteration = iter;
        break;
      }

      const anomalies = (currentAnalysis.rapport_detaille || [])
        .filter((f) => f.contribution > 0.03)
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 5);
      history.push({ iteration: iter, proba: currentProba, anomalies });

      emit(
        { iteration: iter, total: cfg.iterationsMax, proba: currentProba, phase: `Passé ${iter}/${cfg.iterationsMax} — destruction des marqueurs IA`, anomalies: anomalies.slice(0, 3) },
        true
      );

      const dynamicIntensity = Math.min(intensityCap, cfg.intensite * (1 + (currentProba - cfg.seuilCible) * 2));
      currentText = await mutator.applyAllMutationsAsync(currentText, dynamicIntensity, (phase) =>
        emit({ iteration: iter, total: cfg.iterationsMax, proba: currentProba, phase: `Passé ${iter}/${cfg.iterationsMax} — ${phase}`, anomalies: anomalies.slice(0, 3) }),
        yielder
      );

      emit({ iteration: iter, total: cfg.iterationsMax, proba: currentProba, phase: `Passé ${iter}/${cfg.iterationsMax} — réanalyse des métriques`, anomalies: anomalies.slice(0, 3) });
      await yielder();

      const isDeep = iter % DEEP_EVERY === 0 || iter === cfg.iterationsMax;
      if (isDeep) {
        currentAnalysis = this.detector.analyze(currentText);
        currentProba = currentAnalysis.probabilite_IA;
      } else {
        currentProba = fastProbaEstimate(currentText);
      }

      if (currentProba < bestProba) {
        bestProba = currentProba;
        bestText = currentText;
      }

      if (cfg.modeAggressif && iter > 3 && currentProba > 0.3 && deadline - performance.now() > MAX_BUDGET_MS * 0.4) {
        emit(
          { iteration: iter, total: cfg.iterationsMax, proba: currentProba, phase: `Passé ${iter}/${cfg.iterationsMax} — résistance détectée, mutations supplémentaires`, anomalies: anomalies.slice(0, 3) },
          true
        );
        currentText = await mutator.applyAllMutationsAsync(currentText, 0.99, undefined, yielder);
        await yielder();
        currentText = await mutator.applyAllMutationsAsync(currentText, 0.99, undefined, yielder);
        const resistProba = fastProbaEstimate(currentText);
        if (resistProba < bestProba) {
          bestProba = resistProba;
          bestText = currentText;
        }
        currentProba = resistProba;
      }

      if (currentProba < cfg.seuilCible) {
        finalIteration = iter;
        break;
      }
      if (performance.now() > deadline) {
        timedOut = true;
        break;
      }
    }

    currentText = bestText;
    if (timedOut) finalIteration = history.length;

    const finalAnalysis = this.detector.analyze(currentText);
    const finalText = lisserTexteUltimate(currentText, { stripMarkers: true });

    return {
      texteFinal: finalText,
      rapport: this.buildRapport(initialAnalysis, finalAnalysis, cfg, history, finalIteration, {
        partial: timedOut || undefined,
        warning: timedOut ? PARTIAL_WARNING : undefined,
      }),
    };
  }
}

export const humanizerEngine = new TextHumanizerUltimate();
