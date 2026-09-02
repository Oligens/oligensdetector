import { IAHeuristicDetector, countWords, sentencize, type HeuristicResult } from "../detector/heuristicEngine";
import type { HumanizeOutcome, HumanizerConfig, HumanizerProgress, HumanizerReport, IterationAnomaly, IterationRecord } from "./humanizerUltimate";

const DEFAULTS: HumanizerConfig = {
  seuilCible: 0.05,
  iterationsMax: 5,
  intensite: 0.78,
  langue: "mixte",
  modeAggressif: false,
};

const IA_PATTERNS: Record<string, RegExp> = {
  phrase_template: /\b(il est important de noter|il convient de souligner|il est essentiel de comprendre|il est à noter que|il est intéressant de constater)\b/gi,
  context_template: /\b(dans le paysage actuel|dans ce contexte|d'un point de vue|en ce qui concerne|de manière générale)\b/gi,
  conclusion_template: /\b(par conséquent|en conclusion|en définitive|force est de constater|on peut affirmer que)\b/gi,
  mirror_structure: /\bnon seulement\b[\s\S]{0,180}\bmais aussi\b/gi,
  excessive_connector: /\b(cependant|par ailleurs|en outre|de plus|néanmoins|toutefois|ainsi|par conséquent)\b/gi,
};

const REPLACEMENTS: Record<string, string[]> = {
  "il est important de noter": ["il faut retenir", "un point mérite l'attention", "on remarque surtout"],
  "il convient de souligner": ["on peut souligner", "un élément ressort", "il faut relever"],
  "il est essentiel de comprendre": ["il faut comprendre", "le point clé est de comprendre", "on comprend mieux"],
  "il est à noter que": ["on remarque que", "on constate que", "à noter :"],
  "il est intéressant de constater": ["on observe que", "un fait ressort", "on voit que"],
  "dans le paysage actuel": ["aujourd'hui", "dans la situation actuelle", "actuellement"],
  "dans ce contexte": ["ici", "sur ce point", "dans cette situation"],
  "d'un point de vue": ["si l'on regarde", "sous cet angle", "du côté de"],
  "en ce qui concerne": ["pour", "sur", "quant à"],
  "de manière générale": ["globalement", "dans l'ensemble", "en règle générale"],
  "par conséquent": ["donc", "de ce fait", "ce qui conduit à"],
  "en conclusion": ["pour finir", "au final", "en résumé"],
  "en définitive": ["au bout du compte", "finalement", "au final"],
  "force est de constater": ["on constate", "les faits montrent", "il faut reconnaître"],
  "on peut affirmer que": ["on peut dire que", "les éléments montrent que", "tout indique que"],
};

const CONNECTORS = new Set(["cependant", "par ailleurs", "en outre", "de plus", "néanmoins", "toutefois", "ainsi", "par conséquent"]);
const NATURAL_CONNECTORS = ["mais", "pourtant", "en pratique", "sur ce point", "dans les faits", "au fond"];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function seededRandom(text: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
  return () => {
    seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
    seed ^= seed >>> 16;
    return ((seed >>> 0) % 1_000_000) / 1_000_000;
  };
}

function splitSentences(text: string): string[] {
  return text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

function detectLang(text: string): "fr" | "en" {
  const fr = (text.match(/\b(le|la|les|des|une|dans|pour|avec|mais|que|qui|est|sont|du|au|en)\b/gi) ?? []).length;
  const en = (text.match(/\b(the|and|of|to|with|but|that|which|is|are|for|in|on)\b/gi) ?? []).length;
  return fr >= en ? "fr" : "en";
}

function replacePatterns(text: string, rng: () => number): string {
  let out = text;
  for (const [key, options] of Object.entries(REPLACEMENTS)) {
    const re = new RegExp(escapeRegExp(key), "gi");
    out = out.replace(re, (match) => {
      if (rng() > 0.72) return match;
      return options[Math.floor(rng() * options.length)];
    });
  }
  out = out.replace(IA_PATTERNS.mirror_structure, (match) => {
    const m = match.replace(/\bnon seulement\b/i, "").replace(/\bmais aussi\b/i, " et");
    return m.trim().replace(/^,\s*/, "");
  });
  return out;
}

function reduceConnectorRepetition(text: string): string {
  const sentences = splitSentences(text);
  let previous = "";
  return sentences.map((sentence) => {
    const m = sentence.match(/^\s*([A-Za-zÀ-ÿ'’ -]+?)[,;:]\s+/);
    if (!m) return sentence;
    const connector = m[1].trim().toLowerCase();
    if (!CONNECTORS.has(connector) || connector !== previous) {
      previous = connector;
      return sentence;
    }
    const rest = sentence.slice(m[0].length);
    previous = "";
    return `${NATURAL_CONNECTORS[Math.abs(hashString(rest)) % NATURAL_CONNECTORS.length]}, ${rest}`;
  }).join(" ");
}

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = Math.imul(31, h) + value.charCodeAt(i) | 0;
  return Math.abs(h);
}

function adjustSentenceFlow(text: string, intensity: number): string {
  const sentences = splitSentences(text);
  if (sentences.length < 3) return text;
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const words = s.split(/\s+/);
    if (words.length > 28 && intensity > 0.55 && i % 3 === 1) {
      const mid = Math.max(8, Math.min(words.length - 7, Math.floor(words.length * 0.56)));
      out.push(`${words.slice(0, mid).join(" ")}. ${words.slice(mid).join(" ")}`);
    } else if (words.length < 7 && i > 0 && i < sentences.length - 1 && out[out.length - 1].split(/\s+/).length < 16 && intensity > 0.7) {
      out[out.length - 1] = `${out[out.length - 1]} ${s}`;
    } else out.push(s);
  }
  return out.join(" ");
}

function humanizePunctuation(text: string, rng: () => number): string {
  const sentences = splitSentences(text);
  return sentences.map((s, i) => {
    if (i === 0 || rng() > 0.15 || !s.endsWith(".")) return s;
    const next = i % 5 === 0 ? "…" : ".";
    return s.slice(0, -1) + next;
  }).join(" ");
}

function humanityScore(text: string): number {
  const sentences = splitSentences(text);
  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length).filter(Boolean);
  const words = text.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  const unique = new Set(words).size;
  const diversity = words.length ? Math.min(1, unique / words.length * 1.35) : 0;
  const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const variance = lengths.length > 1 ? lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length : 0;
  const rhythm = Math.min(1, Math.sqrt(variance) / 8);
  const templateHits = Object.values(IA_PATTERNS).reduce((n, re) => n + (text.match(re) ?? []).length, 0);
  const templatePenalty = Math.min(1, templateHits / Math.max(4, sentences.length * 0.25));
  const connectorCount = (text.match(/\b(cependant|par ailleurs|en outre|de plus|néanmoins|toutefois|par conséquent)\b/gi) ?? []).length;
  const connectorPenalty = Math.min(1, connectorCount / Math.max(3, sentences.length * 0.18));
  return Math.max(0, Math.min(1, 0.4 * diversity + 0.35 * rhythm + 0.25 * (1 - Math.max(templatePenalty, connectorPenalty))));
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\s+([,.;!?…])/g, "$1").replace(/([,;])\s*([.!?])/g, "$2").replace(/([.!?…])\s*([.!?…])/g, "$1").trim();
}

function anomalySnapshot(result: HeuristicResult): IterationAnomaly[] {
  return (result.rapport_detaille ?? []).filter((x) => x.contribution > 0.02).sort((a, b) => b.contribution - a.contribution).slice(0, 5);
}

function buildReport(initial: HeuristicResult, final: HeuristicResult, cfg: HumanizerConfig, history: IterationRecord[], iterations: number, naturalness: number): HumanizerReport {
  const finalProba = final.probabilite_IA;
  return {
    proba_initiale: initial.probabilite_IA,
    proba_finale: finalProba,
    reduction_pourcent: (initial.probabilite_IA - finalProba) * 100,
    iterations_realisees: iterations,
    historique: history,
    features_finales: final.rapport_detaille,
    decision: finalProba <= cfg.seuilCible ? "Réécriture terminée : les marqueurs stylistiques ciblés ont été fortement réduits." : "Réécriture terminée : certains marqueurs résiduels restent présents.",
    config: cfg,
    warning: `Score de naturalité stylistique : ${Math.round(naturalness * 100)} %. Ce score mesure la variété rédactionnelle et ne constitue pas une preuve d'auteur humain.`,
  };
}

export class EnhancedHumanizer {
  private detector = new IAHeuristicDetector();

  async humanize(text: string, config: Partial<HumanizerConfig> = {}, onProgress?: (p: HumanizerProgress) => void): Promise<HumanizeOutcome> {
    const cfg = { ...DEFAULTS, ...config };
    const clean = normalize(text);
    if (!clean || countWords(clean) < 40) {
      const result = this.detector.analyze(clean);
      return { texteFinal: clean, rapport: buildReport(result, result, cfg, [], 0, humanityScore(clean)) };
    }

    const initial = this.detector.analyze(clean);
    let current = clean;
    let analysis = initial;
    let score = analysis.probabilite_IA;
    let best = current;
    let bestScore = score;
    const history: IterationRecord[] = [];
    const rng = seededRandom(clean);
    const lang = cfg.langue === "mixte" ? detectLang(clean) : cfg.langue;

    for (let iteration = 1; iteration <= cfg.iterationsMax; iteration++) {
      const anomalies = anomalySnapshot(analysis);
      history.push({ iteration, proba: score, anomalies });
      onProgress?.({ iteration, total: cfg.iterationsMax, proba: score, phase: `Optimisation naturelle ${iteration}/${cfg.iterationsMax} · ${lang.toUpperCase()}`, anomalies: anomalies.slice(0, 3) });
      if (score <= cfg.seuilCible) break;

      const intensity = Math.max(0.35, Math.min(0.95, cfg.intensite * (1 + score * 0.35)));
      current = replacePatterns(current, rng);
      current = reduceConnectorRepetition(current);
      current = adjustSentenceFlow(current, intensity);
      current = humanizePunctuation(current, rng);
      current = normalize(current);

      const next = this.detector.analyze(current);
      analysis = next;
      score = next.probabilite_IA;
      if (score < bestScore) {
        bestScore = score;
        best = current;
      }
      if (score <= cfg.seuilCible) break;
    }

    const finalText = normalize(best);
    const final = this.detector.analyze(finalText);
    const naturalness = humanityScore(finalText);
    onProgress?.({ iteration: Math.min(cfg.iterationsMax, history.length), total: cfg.iterationsMax, proba: final.probabilite_IA, phase: "Finalisation · contrôle de cohérence", anomalies: anomalySnapshot(final).slice(0, 3) });
    return { texteFinal: finalText, rapport: buildReport(initial, final, cfg, history, history.length, naturalness) };
  }
}

export const enhancedHumanizer = new EnhancedHumanizer();
