import { analyzeCalibrated } from "../detector/calibratedDetector";
import { countWords } from "../detector/heuristicEngine";
import type { HumanizeOutcome, HumanizerConfig, HumanizerProgress, HumanizerReport, IterationAnomaly, IterationRecord } from "./humanizerUltimate";

const DEFAULTS: HumanizerConfig = {
  seuilCible: 0.12,
  iterationsMax: 6,
  intensite: 0.78,
  langue: "mixte",
  modeAggressif: false,
};

type Replacement = [RegExp, string[]];

const FR_REPLACEMENTS: Replacement[] = [
  [/\bil est important de noter que\b/gi, ["on remarque que", "un point ressort :", "il faut surtout retenir que"]],
  [/\bil convient de souligner que\b/gi, ["on peut souligner que", "un élément ressort :", "il faut relever que"]],
  [/\bil est essentiel de comprendre\b/gi, ["il faut comprendre", "le point clé est", "on comprend mieux"]],
  [/\bil est à noter que\b/gi, ["on remarque que", "à noter :", "on constate que"]],
  [/\bil est intéressant de constater\b/gi, ["on observe que", "un fait ressort :", "on voit que"]],
  [/\bdans le paysage actuel\b/gi, ["aujourd'hui", "dans la situation actuelle", "actuellement"]],
  [/\bdans ce contexte\b/gi, ["ici", "sur ce point", "dans cette situation"]],
  [/\ben ce qui concerne\b/gi, ["pour", "quant à", "sur"]],
  [/\bde manière générale\b/gi, ["globalement", "dans l'ensemble", "en règle générale"]],
  [/\bpar conséquent\b/gi, ["donc", "de ce fait", "ce qui conduit à"]],
  [/\ben conclusion\b/gi, ["pour finir", "au final", "en résumé"]],
  [/\ben définitive\b/gi, ["finalement", "au bout du compte", "au final"]],
  [/\bforce est de constater\b/gi, ["on constate", "les faits montrent", "il faut reconnaître"]],
  [/\bon peut affirmer que\b/gi, ["on peut dire que", "les éléments montrent que", "tout indique que"]],
  [/\bpremièrement\b/gi, ["d'abord", "pour commencer", "en premier lieu"]],
  [/\bdeuxièmement\b/gi, ["ensuite", "puis", "dans un second temps"]],
  [/\btroisièmement\b/gi, ["enfin", "pour finir"]],
  [/\bdans le cadre de\b/gi, ["dans", "pour", "en vue de"]],
  [/\bau niveau de\b/gi, ["concernant", "sur", "en matière de"]],
  [/\bafin de\b/gi, ["pour", "dans le but de"]],
  [/\bde plus\b/gi, ["aussi", "par ailleurs", "en outre"]],
  [/\ben effet\b/gi, ["en réalité", "effectivement", "de fait"]],
  [/\bcependant\b/gi, ["mais", "pourtant", "toutefois"]],
  [/\bnéanmoins\b/gi, ["pourtant", "cependant", "malgré cela"]],
  [/\bpermet de\b/gi, ["donne la possibilité de", "aide à", "rend possible"]],
  [/\butiliser\b/gi, ["employer", "recourir à", "se servir de"]],
  [/\bimportant\b/gi, ["essentiel", "majeur", "notable"]],
  [/\bnombreux\b/gi, ["plusieurs", "beaucoup de", "un grand nombre de"]],
];

const EN_REPLACEMENTS: Replacement[] = [
  [/\bit is important to note that\b/gi, ["notably", "one point is that", "what matters is that"]],
  [/\bit should be noted that\b/gi, ["notably", "the point is that", "we can observe that"]],
  [/\bin conclusion\b/gi, ["finally", "overall", "to sum up"]],
  [/\bin the current landscape\b/gi, ["today", "in the current situation", "currently"]],
  [/\bmoreover\b/gi, ["also", "besides that", "another point is"]],
  [/\bfurthermore\b/gi, ["also", "in addition", "another point is"]],
  [/\btherefore\b/gi, ["so", "as a result", "that means"]],
  [/\bhowever\b/gi, ["but", "still", "yet"]],
  [/\butilize\b/gi, ["use", "employ", "apply"]],
  [/\bsignificant\b/gi, ["important", "notable", "major"]],
];

const RHYTHM_CONNECTORS_FR = ["Alors,", "Ensuite,", "Puis,", "En pratique,", "Au fond,", "Sur ce point,"];
const RHYTHM_CONNECTORS_EN = ["So,", "Then,", "In practice,", "At that point,", "Overall,"];

const normalize = (s: string) =>
  s
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;!?…])/g, "$1")
    .replace(/([.!?…])\s*([.!?…])/g, "$1")
    .replace(/(^|[.!?…]\s+)(\p{Ll})/gu, (_m, pre: string, c: string) => pre + c.toUpperCase())
    .trim();

const splitSentences = (s: string) =>
  s.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [];

function seed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function choose<T>(arr: T[], rng: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

function replaceBoilerplate(text: string, rng: () => number, intensity: number): string {
  const replacements = [...FR_REPLACEMENTS, ...EN_REPLACEMENTS];
  let out = text;
  const probability = Math.min(0.98, 0.72 + intensity * 0.24);
  for (const [regex, options] of replacements) {
    out = out.replace(regex, (match) => (rng() < probability ? choose(options, rng) : match));
  }
  return out;
}

function varySentenceStarts(text: string, rng: () => number, intensity: number): string {
  const sentences = splitSentences(text);
  if (sentences.length < 4 || intensity < 0.45) return text;
  const connectors = /^(cependant|par ailleurs|en outre|de plus|néanmoins|toutefois|donc|ainsi|en effet|moreover|furthermore|however|therefore|nevertheless|also)[,;:]\s+/i;
  let previous = "";
  return sentences
    .map((sentence, index) => {
      const match = sentence.match(connectors);
      if (match) {
        const current = match[1].toLowerCase();
        if (current === previous) {
          return sentence.slice(match[0].length).replace(/^\p{Ll}/u, (c) => c.toUpperCase());
        }
        previous = current;
        return sentence;
      }
      if (index > 0 && rng() < 0.20 * intensity) {
        const list = /\b(the|and|of|to|is|in)\b/i.test(sentence) ? RHYTHM_CONNECTORS_EN : RHYTHM_CONNECTORS_FR;
        const prefix = choose(list, rng);
        return `${prefix} ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
      }
      return sentence;
    })
    .join(" ");
}

function varyFlow(text: string, intensity: number, rng: () => number): string {
  const sentences = splitSentences(text);
  if (sentences.length < 3) return text;
  const out: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const words = sentence.split(/\s+/);
    const last = sentence.match(/[.!?…]$/)?.[0] ?? ".";

    if (words.length > 34 && intensity > 0.45) {
      const cut = Math.max(12, Math.min(words.length - 10, Math.floor(words.length * (0.52 + rng() * 0.12))));
      out.push(words.slice(0, cut).join(" ") + last, words.slice(cut).join(" "));
      continue;
    }

    if (words.length < 8 && out.length > 0 && rng() < 0.28 * intensity) {
      const previous = out.pop() ?? "";
      out.push(previous.replace(/[.!?…]+$/g, "") + "; " + sentence.charAt(0).toLowerCase() + sentence.slice(1));
      continue;
    }

    // Move a trailing discourse phrase to the middle when the sentence has a
    // natural comma boundary. This changes rhythm without inventing facts.
    const clause = sentence.match(/^(.{28,}?),(\s*)(cependant|pourtant|toutefois|en réalité|however|however,)(\s+.+)$/i);
    if (clause && rng() < 0.45 * intensity) {
      out.push(`${clause[1]}${clause[4]} ${clause[3]}${last}`);
      continue;
    }

    out.push(sentence);
  }

  return out.join(" ");
}

function lexicalRefresh(text: string, rng: () => number, intensity: number): string {
  const common: Replacement[] = [
    [/\bcommence\b/gi, ["débute", "s'ouvre"]],
    [/\bmontre\b/gi, ["révèle", "met en évidence", "fait apparaître"]],
    [/\bpermet\b/gi, ["favorise", "rend possible", "facilite"]],
    [/\bproblème\b/gi, ["difficulté", "question", "enjeu"]],
    [/\bchose\b/gi, ["élément", "point", "aspect"]],
    [/\bimportant\b/gi, ["essentiel", "majeur", "notable"]],
    [/\butilise\b/gi, ["emploie", "mobilise", "recourt à"]],
    [/\butiliser\b/gi, ["employer", "mobiliser", "recourir à"]],
    [/\bbeaucoup\b/gi, ["largement", "souvent", "en grande partie"]],
  ];
  let out = text;
  const probability = 0.12 + intensity * 0.22;
  for (const [regex, options] of common) {
    out = out.replace(regex, (match) => (rng() < probability ? choose(options, rng) : match));
  }
  return out;
}

function punctuationAndSpacing(text: string, rng: () => number, intensity: number): string {
  let out = normalize(text);
  if (intensity > 0.65 && rng() < 0.30) {
    const sentences = splitSentences(out);
    if (sentences.length > 5) {
      const idx = Math.floor(rng() * (sentences.length - 1));
      const a = sentences[idx].replace(/[.!?…]+$/, "");
      const b = sentences[idx + 1].replace(/^[\s\p{Ll}]/u, (c) => c.trim());
      if (a.split(/\s+/).length < 28 && b.split(/\s+/).length < 28) {
        sentences.splice(idx, 2, `${a} — ${b.charAt(0).toLowerCase()}${b.slice(1)}.`);
        out = sentences.join(" ");
      }
    }
  }
  return normalize(out);
}

function ensureChange(original: string, candidate: string): string {
  if (normalize(candidate) !== normalize(original)) return normalize(candidate);

  const sentences = splitSentences(original);
  if (sentences.length > 1) {
    const longIndex = sentences.findIndex((s) => s.split(/\s+/).length > 24);
    if (longIndex >= 0) {
      const words = sentences[longIndex].split(/\s+/);
      const cut = Math.max(10, Math.floor(words.length * 0.60));
      sentences[longIndex] = `${words.slice(0, cut).join(" ")}. ${words.slice(cut).join(" ")}`;
      return normalize(sentences.join(" "));
    }
  }

  const safe: Replacement[] = [
    [/\bafin de\b/gi, ["pour"]],
    [/\bpar conséquent\b/gi, ["donc"]],
    [/\ben conclusion\b/gi, ["pour finir"]],
    [/\bcependant\b/gi, ["pourtant"]],
    [/\bde plus\b/gi, ["aussi"]],
    [/\bil est\b/gi, ["on trouve"]],
  ];
  for (const [regex, options] of safe) {
    if (regex.test(original)) return normalize(original.replace(regex, options[0]));
  }

  // Last-resort stylistic change: punctuation only, never content. This keeps
  // the UI honest: a humanization action must not silently return an untouched
  // string when the source contains no known boilerplate.
  const semi = original.indexOf(";");
  if (semi >= 0) return normalize(original.slice(0, semi) + "." + original.slice(semi + 1));
  const comma = original.indexOf(", ");
  if (comma >= 0) return normalize(original.slice(0, comma) + "; " + original.slice(comma + 2));
  return normalize(original);
}

function anomalies(result: ReturnType<typeof analyzeCalibrated>): IterationAnomaly[] {
  return (result.rapport_detaille ?? [])
    .filter((x) => Math.abs(x.contribution) > 0.02)
    .slice(0, 6);
}

function candidateScore(original: string, candidate: string): number {
  const result = analyzeCalibrated(candidate);
  const originalWords = countWords(original);
  const candidateWords = countWords(candidate);
  const lengthPenalty = Math.min(0.18, Math.abs(candidateWords - originalWords) / Math.max(1, originalWords) * 0.5);
  return result.probabilite_IA + lengthPenalty;
}

export const enhancedHumanizerV2 = {
  async humanize(
    text: string,
    config: Partial<HumanizerConfig> = {},
    onProgress?: (p: HumanizerProgress) => void,
  ): Promise<HumanizeOutcome> {
    const cfg = { ...DEFAULTS, ...config };
    const original = normalize(text);

    if (!original) {
      return {
        texteFinal: "",
        rapport: {
          proba_initiale: 0,
          proba_finale: 0,
          reduction_pourcent: 0,
          iterations_realisees: 0,
          historique: [],
          features_finales: [],
          decision: "Aucun texte à humaniser.",
          config: cfg,
        },
      };
    }

    const initial = analyzeCalibrated(original);
    let current = original;
    let currentScore = initial.probabilite_IA;
    let best = original;
    let bestScore = currentScore;
    const history: IterationRecord[] = [];
    const rng = seed(original);
    const passes = Math.max(1, Math.min(12, cfg.iterationsMax));
    let iterations = 0;

    // Every request performs a real rewrite pass. We evaluate several
    // conservative candidates and keep the one that improves the calibrated
    // evidence score without exploding the document length.
    for (let i = 1; i <= passes; i++) {
      iterations = i;
      const before = analyzeCalibrated(current);
      const currentAnomalies = anomalies(before);
      history.push({ iteration: i, proba: currentScore, anomalies: currentAnomalies });
      onProgress?.({ iteration: i, total: passes, proba: currentScore, phase: `Réécriture naturelle ${i}/${passes}`, anomalies: currentAnomalies });

      if (i > 1 && currentScore <= cfg.seuilCible) break;

      const intensity = Math.max(0.35, Math.min(0.96, cfg.intensite + currentScore * 0.20));
      const candidates = [0, 1, 2].map((variant) => {
        const localSeed = `${current}:${i}:${variant}`;
        const localRng = seed(localSeed);
        let next = replaceBoilerplate(current, localRng, intensity);
        if (variant !== 1) next = lexicalRefresh(next, localRng, intensity);
        next = varySentenceStarts(next, localRng, variant === 0 ? intensity * 0.65 : intensity);
        next = varyFlow(next, intensity * (variant === 2 ? 1 : 0.82), localRng);
        if (variant === 2) next = punctuationAndSpacing(next, localRng, intensity);
        return ensureChange(current, normalize(next));
      });

      const scored = candidates
        .filter((candidate) => candidate.length > 0)
        .map((candidate) => ({ candidate, score: candidateScore(original, candidate) }))
        .sort((a, b) => a.score - b.score);

      const selected = scored[0]?.candidate ?? current;
      const selectedResult = analyzeCalibrated(selected);
      current = selected;
      currentScore = selectedResult.probabilite_IA;

      // Prefer the best candidate, but do not chase tiny score changes that
      // would cause excessive rewriting.
      if (selected !== original && (currentScore + 0.005 < bestScore || best === original)) {
        best = selected;
        bestScore = currentScore;
      }

      if (i === passes && best === original) {
        best = selected;
        bestScore = currentScore;
      }

      // Yield so long documents remain responsive in the browser.
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
        else window.setTimeout(resolve, 0);
      });
    }

    const finalText = normalize(best);
    const final = analyzeCalibrated(finalText);
    const changed = finalText !== original;
    const report: HumanizerReport = {
      proba_initiale: initial.probabilite_IA,
      proba_finale: final.probabilite_IA,
      reduction_pourcent: (initial.probabilite_IA - final.probabilite_IA) * 100,
      iterations_realisees: iterations,
      historique: history,
      features_finales: final.rapport_detaille,
      decision: changed
        ? final.probabilite_IA <= cfg.seuilCible
          ? "Réécriture terminée : le style a été remanié et plusieurs marqueurs ont été réduits."
          : "Réécriture terminée : le style a été modifié, mais aucun score nul ne peut être garanti."
        : "Le texte est resté inchangé : aucune transformation suffisamment sûre n'a été trouvée.",
      config: cfg,
      warning: "Le score indique des indices stylistiques et ne constitue pas une preuve d'origine humaine.",
    };

    onProgress?.({
      iteration: iterations,
      total: passes,
      proba: final.probabilite_IA,
      phase: changed ? "Finalisation" : "Aucune modification sûre trouvée",
      anomalies: anomalies(final),
    });

    return { texteFinal: finalText, rapport };
  },
};
