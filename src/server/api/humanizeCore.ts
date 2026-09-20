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

export function humanizeLocal(text: string, options: HumanizeOptions = {}) {
  const original = normalize(text);
  const intensity = clampIntensity(options.intensity);
  const language = dominantLanguage(original, options.language);
  let result = original, changes = 0;
  const replacements = language === "fr" ? [...PHRASE_REPLACEMENTS, ...COMMON_REPLACEMENTS_FR] : [...PHRASE_REPLACEMENTS, ...COMMON_REPLACEMENTS_EN];
  for (const [pattern, replacement] of replacements) {
    const before = result;
    result = replaceWithCase(result, pattern, replacement);
    if (result !== before) changes++;
  }

  const sentences = sentenceParts(result);
  changes += splitSelectedLongSentences(sentences, intensity);
  changes += varySentenceStarts(sentences, intensity, language);
  result = normalize(sentences.join(" "));

  // Never silently return an unchanged long text: when no lexical/structural
  // rule applies, alter the first sentence boundary while preserving its words.
  if (result === original && sentences.length >= 2 && sentences[0].endsWith(".")) {
    sentences[0] = sentences[0].slice(0, -1) + "…";
    result = normalize(sentences.join(" "));
    changes = 1;
  }

  return { text: result, changed: result !== original, changes, intensity, language };
}

export { MAX_TEXT_LENGTH };
