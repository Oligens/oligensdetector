const REPLACEMENTS: Array<[RegExp, string[]]> = [
  [/\bpremièrement\b/gi, ["d'abord", "pour commencer"]],
  [/\bdeuxièmement\b/gi, ["ensuite", "puis"]],
  [/\btroisièmement\b/gi, ["enfin", "pour finir"]],
  [/\bd'une part\b/gi, ["d'un côté"]],
  [/\bd'autre part\b/gi, ["de l'autre côté"]],
  [/\bil est important de noter que\b/gi, ["on remarque que", "il faut retenir que"]],
  [/\bil convient de souligner que\b/gi, ["on peut souligner que", "un point ressort :"]],
  [/\bil est essentiel de comprendre\b/gi, ["il faut comprendre", "le point clé est"]],
  [/\ben conclusion\b/gi, ["pour finir", "au final"]],
  [/\bpour conclure\b/gi, ["pour finir", "en résumé"]],
  [/\ben définitive\b/gi, ["finalement", "au bout du compte"]],
  [/\bdans le cadre de\b/gi, ["dans", "pour"]],
  [/\bau niveau de\b/gi, ["pour", "concernant"]],
  [/\ben ce qui concerne\b/gi, ["concernant", "pour"]],
  [/\bpar conséquent\b/gi, ["donc", "de ce fait"]],
  [/\bnotamment\b/gi, ["en particulier", "surtout"]],
  [/\bcependant\b/gi, ["mais", "pourtant"]],
  [/\bnéanmoins\b/gi, ["pourtant", "cependant"]],
  [/\bpar ailleurs\b/gi, ["de plus", "d'ailleurs"]],
];

function stablePick(options: string[], seed: number) {
  return options[Math.abs(seed) % options.length];
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}

function sentenceParts(text: string) {
  return text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

/** Conservative first pass inspired by the supplied IA-pattern catalogue.
 * It never inserts invented facts, author signatures or emotional content.
 * The goal is to reduce mechanical templates before the iterative detector pass.
 */
export function preprocessForHumanization(text: string, aggressive = false): string {
  let out = text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!out) return "";

  for (const [pattern, options] of REPLACEMENTS) {
    out = out.replace(pattern, (match, ...args) => {
      const offset = Number(args.at(-2) ?? 0);
      return stablePick(options, hash(`${match}:${offset}`));
    });
  }

  // Remove consecutive lexical duplicates without touching intentional punctuation.
  out = out.replace(/\b([\p{L}\p{N}][\p{L}\p{N}'’-]*)\s+\1\b/giu, "$1");

  const sentences = sentenceParts(out);
  if (sentences.length > 2) {
    const result: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
      let sentence = sentences[i];
      const firstWord = sentence.split(/\s+/)[0]?.toLowerCase().replace(/[,;:]/g, "");
      const previous = result[result.length - 1]?.split(/\s+/)[0]?.toLowerCase().replace(/[,;:]/g, "");
      if (firstWord && previous && firstWord === previous && /^(cependant|pourtant|néanmoins|par ailleurs|en outre|donc|ainsi|ensuite|enfin)$/i.test(firstWord)) {
        sentence = sentence.replace(/^[^\s]+[,;:]?\s*/i, "");
      }
      result.push(sentence);
    }
    out = result.join(" ");
  }

  if (aggressive) {
    out = out.replace(/\b(très|vraiment|absolument|extrêmement)\s+(très|vraiment|absolument|extrêmement)\b/gi, "$1");
  }

  return out.replace(/\s+([,.;!?…])/g, "$1").replace(/([,;])\s*([.!?])/g, "$2").replace(/\s{2,}/g, " ").trim();
}
