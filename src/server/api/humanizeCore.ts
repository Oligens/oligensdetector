const MAX_TEXT_LENGTH = 100_000;

type HumanizeOptions = { intensity?: unknown; language?: unknown; mode?: unknown };

const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bil est important de noter que\b/gi, "on peut retenir que"],
  [/\bil est important de noter\b/gi, "on peut retenir"],
  [/\bil convient de souligner que\b/gi, "on peut souligner que"],
  [/\bil convient de souligner\b/gi, "on peut souligner"],
  [/\ben outre\b/gi, "de plus"],
  [/\bpar conséquent\b/gi, "ainsi"],
  [/\ben résumé\b/gi, "pour résumer"],
  [/\ben conclusion\b/gi, "pour finir"],
  [/\bdans le paysage actuel\b/gi, "dans le contexte actuel"],
  [/\bde surcroît\b/gi, "en plus"],
  [/\bainsi donc\b/gi, "donc"],
  [/\bcependant\b/gi, "mais"],
  [/\bnéanmoins\b/gi, "malgré tout"],
  [/\bpar ailleurs\b/gi, "d'un autre côté"],
];

const COMMON_REPLACEMENTS_FR: Array<[RegExp, string]> = [
  [/\bpermet de\b/gi, "sert à"],
  [/\bpermettent de\b/gi, "servent à"],
  [/\bconstitue\b/gi, "forme"],
  [/\bconstituent\b/gi, "forment"],
  [/\butiliser\b/gi, "employer"],
  [/\butilise\b/gi, "emploie"],
  [/\butilisent\b/gi, "emploient"],
  [/\bnotamment\b/gi, "en particulier"],
  [/\bégalement\b/gi, "aussi"],
  [/\bnécessaire\b/gi, "indispensable"],
  [/\bnécessaires\b/gi, "indispensables"],
  [/\bimportant\b/gi, "majeur"],
  [/\bimportante\b/gi, "majeure"],
  [/\bimportants\b/gi, "majeurs"],
  [/\bimportantes\b/gi, "majeures"],
];

const COMMON_REPLACEMENTS_EN: Array<[RegExp, string]> = [
  [/\bit is important to note that\b/gi, "it is worth noting that"],
  [/\bin addition\b/gi, "also"],
  [/\bmoreover\b/gi, "besides"],
  [/\btherefore\b/gi, "so"],
  [/\bhowever\b/gi, "but"],
  [/\butilize\b/gi, "use"],
  [/\bdemonstrate\b/gi, "show"],
  [/\bnumerous\b/gi, "many"],
  [/\bsignificant\b/gi, "notable"],
];

function clampIntensity(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0.78;
  return Math.max(0.5, Math.min(1, parsed));
}

function dominantLanguage(text: string, requested: unknown): "fr" | "en" {
  if (requested === "fr" || requested === "en") return requested;
  const lower = text.toLowerCase();
  const fr = (lower.match(/\b(le|la|les|des|une|est|sont|que|qui|dans|pour|avec|sur|ce|cette|et|du|au|mais|nous|par|en)\b/g) ?? []).length;
  const en = (lower.match(/\b(the|and|of|to|is|in|that|for|with|are|was|on|as|at|by|this|it|from|or)\b/g) ?? []).length;
  return fr >= en ? "fr" : "en";
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/\s+([,.;!?…])/g, "$1").replace(/([.!?…])\s*([.!?…])+/g, "$1").trim();
}

function preserveCase(original: string, replacement: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

function replaceWithCase(text: string, pattern: RegExp, replacement: string): string {
  return text.replace(pattern, (match) => preserveCase(match, replacement));
}

function sentenceParts(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
}

function varySentenceStarts(sentences: string[], intensity: number, language: "fr" | "en"): number {
  if (sentences.length < 3 || intensity < 0.55) return 0;
  const connectors = language === "fr" ? ["De fait,", "Dans les faits,", "Sur ce point,", "Concrètement,", "À ce stade,"] : ["In practice,", "In fact,", "On this point,", "More concretely,", "At this stage,"];
  let changed = 0;
  const target = Math.max(2, Math.floor(sentences.length * Math.min(0.16, intensity * 0.2)));
  for (let i = 1; i < sentences.length && changed < target; i++) {
    const sentence = sentences[i];
    if (!sentence || /^([#-]|\d+[.)])/.test(sentence)) continue;
    if (/^(De fait|Dans les faits|Sur ce point|Concrètement|À ce stade|In practice|In fact|On this point|More concretely|At this stage),/i.test(sentence)) continue;
    if ((i + 1) % 4 === 0) {
      const first = sentence.charAt(0).toLowerCase();
      if (first) { sentences[i] = `${connectors[changed % connectors.length]} ${first}${sentence.slice(1)}`; changed++; }
    }
  }
  return changed;
}

function splitSelectedLongSentences(sentences: string[], intensity: number): number {
  if (intensity < 0.7) return 0;
  let changed = 0;
  for (let i = 0; i < sentences.length && changed < 3; i++) {
    const s = sentences[i], words = s.split(/\s+/);
    if (words.length < 30) continue;
    const match = s.match(/,\s+(mais|et|car|donc|pourtant|toutefois|qui|ce qui)\s+/i);
    if (!match || match.index == null) continue;
    const before = s.slice(0, match.index).trim(), after = s.slice(match.index + match[0].length).trim();
    if (before.split(/\s+/).length < 8 || after.split(/\s+/).length < 6) continue;
    const connector = match[1].toLowerCase(), next = connector === "et" ? "Et" : connector.charAt(0).toUpperCase() + connector.slice(1);
    sentences[i] = `${before}. ${next} ${after.charAt(0).toLowerCase()}${after.slice(1)}`;
    changed++;
  }
  return changed;
}


function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}

function applyBurstiness(sentences: string[], intensity: number): number {
  if (sentences.length < 3 || intensity < 0.68) return 0;
  let changes = 0;
  for (let i = 0; i < sentences.length && changes < 4; i++) {
    const sentence = sentences[i];
    if (wordsOf(sentence).length < 28) continue;
    const match = sentence.match(/,\s+(mais|et|car|donc|pourtant|toutefois|qui|ce qui|but|and|because|so|yet|which)\s+/i);
    if (!match || match.index == null) continue;
    const left = sentence.slice(0, match.index).trim();
    const right = sentence.slice(match.index + match[0].length).trim();
    if (wordsOf(left).length < 9 || wordsOf(right).length < 7) continue;
    const connector = match[1].toLowerCase();
    const start = connector === "et" ? "Et" : connector === "mais" ? "Mais" : connector === "and" ? "And" : connector === "but" ? "But" : connector.charAt(0).toUpperCase() + connector.slice(1);
    sentences.splice(i, 1, left + ".", start + " " + right.charAt(0).toLowerCase() + right.slice(1));
    changes++;
    i++;
  }
  for (let i = 1; i < sentences.length && changes < 6; i++) {
    if (wordsOf(sentences[i]).length <= 5 && wordsOf(sentences[i - 1]).length >= 12) {
      sentences[i - 1] = sentences[i - 1].replace(/[.!?…]$/, "") + ". " + sentences[i];
      sentences.splice(i, 1);
      changes++;
    }
  }
  return changes;
}

function applyLexicalVariation(text: string, intensity: number, language: "fr" | "en"): [string, number] {
  const dict: Record<string, string[]> = language === "fr"
    ? {
        important: ["majeur", "central", "clé"],
        importante: ["majeure", "centrale", "clé"],
        importants: ["majeurs", "centraux", "clés"],
        importantes: ["majeures", "centrales", "clés"],
        utiliser: ["employer", "mobiliser", "recourir à"],
        utilise: ["emploie", "mobilise", "exploite"],
        utilisent: ["emploient", "mobilisent", "exploitent"],
        permet: ["sert à", "donne la possibilité de"],
        permettent: ["servent à", "donnent la possibilité de"],
        démontrer: ["montrer", "établir", "mettre en évidence"],
        obtenir: ["avoir", "recevoir", "atteindre"],
        nombreux: ["plusieurs", "beaucoup de", "divers"],
        nécessaire: ["indispensable", "utile", "requis"],
        nécessaires: ["indispensables", "utiles", "requises"],
        problème: ["difficulté", "question", "point de tension"],
        problèmes: ["difficultés", "questions", "points de tension"],
        solution: ["réponse", "piste", "issue"],
        solutions: ["réponses", "pistes", "issues"],
      }
    : {
        important: ["key", "central", "major"],
        utilize: ["use", "employ"],
        demonstrate: ["show", "establish", "highlight"],
        obtain: ["get", "gain", "achieve"],
        numerous: ["many", "several", "various"],
        necessary: ["needed", "essential", "required"],
        problem: ["issue", "difficulty", "challenge"],
        solution: ["answer", "approach", "way forward"],
      };

  let result = text;
  let changes = 0;
  const max = Math.max(1, Math.floor(wordsOf(text).length * Math.min(0.12, intensity * 0.16)));

  for (const [word, variants] of Object.entries(dict)) {
    if (changes >= max) break;
    const re = new RegExp("\\b" + word + "\\b", "gi");
    const before = result;
    if (!re.test(result)) continue;
    re.lastIndex = 0;
    result = result.replace(re, (match) => preserveCase(match, variants[changes % variants.length]));
    if (result !== before) changes++;
  }
  return [result, changes];
}

function applyStylisticRelief(sentences: string[], intensity: number, language: "fr" | "en"): number {
  if (sentences.length < 5 || intensity < 0.72) return 0;
  const connectors = language === "fr"
    ? ["En pratique,", "Sur ce point,", "Dans les faits,", "Concrètement,", "À ce stade,"]
    : ["In practice,", "On this point,", "In fact,", "More concretely,", "At this stage,"];
  let changes = 0;
  const target = Math.min(3, Math.max(1, Math.floor(sentences.length / 7)));
  for (let i = 2; i < sentences.length && changes < target; i++) {
    if ((i + 1) % 5 !== 0) continue;
    const s = sentences[i];
    if (/^(En pratique|Sur ce point|Dans les faits|Concrètement|À ce stade|In practice|On this point|In fact|More concretely|At this stage),/i.test(s)) continue;
    const first = s.charAt(0).toLowerCase();
    if (!first) continue;
    sentences[i] = connectors[changes % connectors.length] + " " + first + s.slice(1);
    changes++;
  }
  return changes;
}

function varyParagraphs(text: string, intensity: number): [string, number] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length !== 1 || intensity < 0.72) return [text, 0];
  const sentences = sentenceParts(paragraphs[0]);
  if (sentences.length < 6) return [text, 0];
  const cut = Math.max(3, Math.round(sentences.length / 2));
  return [sentences.slice(0, cut).join(" ") + "\n\n" + sentences.slice(cut).join(" "), 1];
}

const SUMMARY_STOP_FR = new Set(["le","la","les","un","une","des","de","du","au","aux","et","ou","mais","que","qui","ce","cette","ces","en","pour","par","sur","avec","dans","est","sont","a","à","on","se","sa","son","ses","leur","leurs","ne","pas","plus"]);
const SUMMARY_STOP_EN = new Set(["the","a","an","and","or","but","so","that","which","this","these","of","to","in","for","by","with","on","is","are","was","were","it","its","their","not","more"]);

function shortenText(text: string, language: "fr" | "en", targetRatio = 0.62): [string, number] {
  const sentences = sentenceParts(text);
  if (sentences.length < 4) return [text, 0];
  const stop = language === "fr" ? SUMMARY_STOP_FR : SUMMARY_STOP_EN;
  const frequencies = new Map<string, number>();
  for (const sentence of sentences) {
    for (const word of wordsOf(sentence)) {
      if (!stop.has(word) && word.length > 3) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
    }
  }
  const scored = sentences.map((sentence, index) => {
    const unique = new Set(wordsOf(sentence));
    let score = 0;
    for (const word of unique) if (!stop.has(word)) score += 1 + Math.min(2, frequencies.get(word) ?? 0) * 0.25;
    if (/\b(19\d{2}|20\d{2}|%|\$|€|\d+)\b/.test(sentence)) score += 2;
    if (/\b(principal|objectif|résultat|cause|effet|enjeu|clé|important|essential|main|objective|result|cause|effect|key)\b/i.test(sentence)) score += 1.5;
    if (index === 0 || index === sentences.length - 1) score += 1;
    return { index, score };
  });
  const keepCount = Math.max(2, Math.min(sentences.length - 1, Math.round(sentences.length * targetRatio)));
  const keep = new Set(scored.sort((a, b) => b.score - a.score).slice(0, keepCount).map((x) => x.index));
  return [sentences.filter((_, index) => keep.has(index)).join(" "), sentences.length - keep.size];
}

function summaryMode(mode: unknown): boolean {
  const value = String(mode ?? "").toLowerCase();
  return ["resume", "résumé", "summary", "summarize", "shorten", "compact", "concis"].some((x) => value.includes(x));
}


export function humanizeLocal(text: string, options: HumanizeOptions = {}): HumanizeResult {
  const original = normalize(text);
  const intensity = clampIntensity(options.intensity);
  const language = dominantLanguage(original, options.language);

  if (summaryMode(options.mode)) {
    const shortened = shortenText(original, language, 0.62);
    const lexical = applyLexicalVariation(shortened[0], Math.min(1, intensity * 0.7), language);
    const result = normalize(lexical[0]);
    return {
      text: result,
      changed: result !== original,
      changes: shortened[1] + lexical[1],
      intensity,
      language,
      mode: "summary",
      originalLength: original.length,
      finalLength: result.length,
    };
  }

  let result = original;
  let changes = 0;
  const replacements = language === "fr" ? PHRASE_REPLACEMENTS : COMMON_REPLACEMENTS_EN;

  for (const [pattern, replacement] of replacements) {
    const next = replaceWithCase(result, pattern, replacement);
    if (next !== result) changes++;
    result = next;
  }

  const lexical = applyLexicalVariation(result, intensity, language);
  result = lexical[0];
  changes += lexical[1];

  const sentences = sentenceParts(result);
  changes += applyBurstiness(sentences, intensity);
  changes += applyStylisticRelief(sentences, intensity, language);
  result = normalize(sentences.join(" "));

  const paragraphs = varyParagraphs(result, intensity);
  result = paragraphs[0];
  changes += paragraphs[1];

  if (result === original && sentences.length >= 3) {
    const midpoint = Math.max(1, Math.floor(sentences.length / 2));
    result = sentences.slice(0, midpoint).join(" ") + "\n\n" + sentences.slice(midpoint).join(" ");
    changes = 1;
  }

  result = normalize(result);
  return {
    text: result,
    changed: result !== original,
    changes,
    intensity,
    language,
    mode: "humanize",
    originalLength: original.length,
    finalLength: result.length,
  };
}

export { MAX_TEXT_LENGTH };
