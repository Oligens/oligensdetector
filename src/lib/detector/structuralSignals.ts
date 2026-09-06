// Structural signals adapted from the supplied heuristic proposal.
// They complement the existing 18 stylometric features and are deliberately
// density-aware so one isolated phrase does not dominate the score.

export interface StructuralSignal {
  name: string;
  count: number;
  weight: number;
  contribution: number;
}

export interface StructuralSignalResult {
  score: number;
  signals: StructuralSignal[];
}

const RULES: Array<{ name: string; regex: RegExp; weight: number }> = [
  { name: "énumération_héritée", regex: /\b(premièrement|deuxièmement|troisièmement|d'une part|d'autre part)\b/gi, weight: 0.75 },
  { name: "formule_de_transition", regex: /\b(il est important de noter que|il convient de souligner que|notons que|on peut constater que|il faut remarquer que)\b/gi, weight: 0.9 },
  { name: "conclusion_forte", regex: /\b(en conclusion|pour conclure|en définitive|en résumé|pour résumer|finalement)\b/gi, weight: 0.8 },
  { name: "structure_miroir", regex: /\bnon seulement\b[\s\S]{0,180}\bmais aussi\b/gi, weight: 0.65 },
  { name: "pronom_indéfini_surutilisé", regex: /\b(on|nous)\b[^.!?\n]{0,100}\b(peut|doit|faut|s'agit)\b/gi, weight: 0.55 },
  { name: "phrase_zombie", regex: /\b(il y a|c'est|il s'agit de)\b/gi, weight: 0.4 },
  { name: "adverbe_pléonastique", regex: /\b(très|vraiment|absolument|totalement|extrêmement|particulièrement)\b/gi, weight: 0.3 },
  { name: "formule_administrative", regex: /\b(dans le cadre de|au niveau de|en ce qui concerne|relatif à)\b/gi, weight: 0.65 },
  { name: "pseudoscience", regex: /\b(significativement|notablement|il a été démontré que|les données suggèrent que)\b/gi, weight: 0.55 },
  { name: "hallucination_typique", regex: /\b(certains experts estiment|il est universellement reconnu que|on sait depuis longtemps que)\b/gi, weight: 0.9 },
  { name: "neutralité_excessive", regex: /\b(peut-être|probablement|en quelque sorte|pour ainsi dire|en quelque manière)\b/gi, weight: 0.35 },
];

export function computeStructuralSignals(text: string): StructuralSignalResult {
  const clean = text.trim();
  const wordCount = clean.match(/[\p{L}\p{N}'’-]+/gu)?.length ?? 0;
  if (!clean || wordCount === 0) return { score: 0, signals: [] };

  const densityFactor = Math.min(1, 220 / Math.max(40, wordCount));
  const signals = RULES.map((rule) => {
    const count = clean.match(rule.regex)?.length ?? 0;
    const expected = Math.max(1, wordCount / 90);
    const density = Math.min(1, count / expected);
    const contribution = Math.min(1, density * rule.weight * (0.65 + 0.35 * densityFactor));
    return { name: rule.name, count, weight: rule.weight, contribution };
  }).filter((s) => s.count > 0);

  const score = Math.max(0, Math.min(1, signals.reduce((sum, s) => sum + s.contribution, 0) / 3.4));
  return { score, signals };
}

// Corrected n-gram originality: the denominator is the total number of
// trigrams, not min(total, 1). This avoids collapsing the metric to ~100%.
export function computeCorrectedOriginality(text: string): number {
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  if (tokens.length < 10) return 0.5;
  const total = tokens.length - 2;
  const unique = new Set<string>();
  for (let i = 0; i < total; i++) unique.add(tokens.slice(i, i + 3).join(" "));
  return Math.max(0, Math.min(1, unique.size / total));
}
