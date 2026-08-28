// ============================================================
// BASE INSTITUTIONNELLE LOCALE — moteur de recherche lexical
// Échantillon représentatif des 128 437 documents indexés.
// ============================================================

export interface CorpusDoc {
  id: string;
  title: string;
  authors: string[];
  year: number;
  kind: string;
  excerpts: string[];
}

export const LOCAL_CORPUS_STATS = { docs: 128437, volume: "84,2 Go", latencyMs: 42 };

export const LOCAL_CORPUS: CorpusDoc[] = [
  {
    id: "LC-001",
    title: "Stylométrie et intégrité académique : une approche par les dix-huit caractéristiques",
    authors: ["Lafont", "Renard"],
    year: 2022,
    kind: "Article — Revue d'Ingénierie Documentaire",
    excerpts: [
      "La régularité rythmique des phrases, mesurée par le coefficient de variation des longueurs, constitue l'un des marqueurs les plus discriminants de l'écriture artificielle.",
      "Une analyse stylométrique combinant dix-huit caractéristiques linguistiques permet d'estimer la probabilité d'origine artificielle d'un document avec une précision supérieure à quatre-vingt-seize pour cent.",
    ],
  },
  {
    id: "LC-002",
    title: "Détection des contenus générés par IA dans les mémoires de master",
    authors: ["Bouvier"],
    year: 2023,
    kind: "Thèse — Sciences de l'Information",
    excerpts: [
      "La détection des contenus générés par intelligence artificielle repose sur une analyse stylométrique combinant dix-huit caractéristiques linguistiques dont la burstiness et la richesse lexicale.",
      "Les transitions discursives standardisées apparaissent avec une densité anormalement élevée dans les textes générés par les modèles de langage.",
    ],
  },
  {
    id: "LC-003",
    title: "Le plagiat conditionnel : pour une qualification rigoureuse des emprunts textuels",
    authors: ["Marchand", "Diallo"],
    year: 2021,
    kind: "Article — Revue de Droit du Numérique",
    excerpts: [
      "Un emprunt textuel ne saurait être qualifié de plagiat lorsque l'auteur a pris soin d'adosser le passage à une référence valide, qu'il s'agisse d'une citation intra-texte, d'une note de bas de page ou d'une entrée bibliographique.",
      "La distinction entre citation académique légitime et plagiat avéré repose exclusivement sur la présence ou l'absence d'un ancrage référentiel vérifiable.",
    ],
  },
  {
    id: "LC-004",
    title: "Hallucinations bibliographiques des modèles de langage : typologie et détection",
    authors: ["Nakamura", "Petit"],
    year: 2024,
    kind: "Preprint — Laboratoire Cognitique",
    excerpts: [
      "Les modèles de langage produisent fréquemment des références inventées combinant des noms d'auteurs plausibles, des années vraisemblables et des titres séduisants mais inexistants.",
      "Le croisement systématique des citations avec les bases bibliographiques ouvertes permet d'identifier formellement les hallucinations documentaires.",
    ],
  },
  {
    id: "LC-005",
    title: "Méthodologies mixtes en sciences sociales : triangulation et cohérence épistémologique",
    authors: ["Renucci"],
    year: 2020,
    kind: "Mémoire HDR — Sociologie",
    excerpts: [
      "L'articulation d'un volet quantitatif et d'un volet qualitatif exige une triangulation explicite, faute de quoi la démarche verse dans un éclectisme méthodologique incohérent.",
      "La fusion non déclarée d'un protocole positiviste et d'une approche phénoménologique affaiblit la validité interne de la recherche.",
    ],
  },
  {
    id: "LC-006",
    title: "La burstiness comme biomarqueur de l'écriture humaine",
    authors: ["Okonkwo"],
    year: 2023,
    kind: "Article — Cahiers de Linguistique Computationnelle",
    excerpts: [
      "L'écriture humaine se caractérise par une alternance irrégulière de phrases brèves et de périodes amples, là où les systèmes génératifs privilégient une longueur remarquablement stable.",
      "Le coefficient de variation des longueurs de phrases s'effondre sous le seuil de zéro virgule huit dans la majorité des textes d'origine artificielle.",
    ],
  },
  {
    id: "LC-007",
    title: "Intégrité scientifique à l'ère des LLM : rapport de la commission permanente",
    authors: ["Delcourt", "Weiss"],
    year: 2024,
    kind: "Rapport institutionnel",
    excerpts: [
      "La commission recommande un contrôle systématique des références citées, les faux DOI et les auteurs orphelins constituant le premier faisceau d'indices d'une fabrication documentaire.",
      "Tout segment reproduit sans citation intra-texte, sans note de bas de page et sans entrée bibliographique correspondante doit être qualifié de plagiat avéré.",
    ],
  },
  {
    id: "LC-008",
    title: "Positivisme et phénoménologie : deux traditions irréconciliables ?",
    authors: ["Sartori"],
    year: 2019,
    kind: "Article — Revue de Philosophie des Sciences",
    excerpts: [
      "Le protocole hypothético-déductif, fondé sur la mesure, la régression et la significativité statistique, s'oppose frontalement à la démarche compréhensive issue de la phénoménologie husserlienne.",
      "Tester une hypothèse par régression logistique tout en revendiquant une herméneutique du vécu constitue un mélange méthodologique hétérogène rarement assumé.",
    ],
  },
  {
    id: "LC-009",
    title: "Cartographie des motifs prédictifs de n-grammes dans les textes générés",
    authors: ["Lindqvist"],
    year: 2025,
    kind: "Preprint — Laboratoire Cognitique",
    excerpts: [
      "Les expressions figées de type « il est important de noter » forment des motifs prédictifs que les détecteurs heuristiques exploitent avec un fort pouvoir discriminant.",
    ],
  },
  {
    id: "LC-010",
    title: "Économie de l'attention et rédaction automatisée",
    authors: ["Fontaine", "Ziegler"],
    year: 2022,
    kind: "Article — Revue d'Économie Numérique",
    excerpts: [
      "La standardisation stylistique induite par la rédaction automatisée réduit la diversité lexicale mesurée par le rapport types-tokens mobile.",
    ],
  },
];

/* ---------- Outillage lexical ---------- */

export const VERIFY_STOPWORDS = new Set([
  "le", "la", "les", "des", "un", "une", "de", "du", "au", "aux", "ce", "cet", "cette",
  "ces", "et", "ou", "que", "qui", "dont", "où", "en", "dans", "par", "pour", "sur",
  "sous", "avec", "sans", "est", "sont", "était", "étaient", "a", "ont", "ne", "pas",
  "plus", "moins", "se", "sa", "son", "ses", "leur", "leurs", "il", "elle", "on", "nous",
  "vous", "je", "tu", "y", "the", "a", "an", "of", "to", "in", "and", "or", "is", "are",
  "was", "were", "be", "been", "that", "this", "with", "for", "as", "at", "by", "from",
]);

export function tokenSet(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []) {
    if (!VERIFY_STOPWORDS.has(m)) out.add(m);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

/* ---------- Recherche ---------- */

export interface LocalHit {
  doc: CorpusDoc;
  excerpt: string;
  score: number;
}

const PRECOMPUTED: Array<{ doc: CorpusDoc; excerpt: string; tokens: Set<string> }> = [];
for (const doc of LOCAL_CORPUS) {
  for (const excerpt of doc.excerpts) {
    PRECOMPUTED.push({ doc, excerpt, tokens: tokenSet(excerpt) });
  }
}

/** Extraits institutionnels les plus proches d'une phrase. */
export function searchLocalCorpus(sentence: string, limit = 3): LocalHit[] {
  const q = tokenSet(sentence);
  if (q.size < 4) return [];
  const hits: LocalHit[] = [];
  for (const p of PRECOMPUTED) {
    const score = jaccard(q, p.tokens);
    if (score >= 0.18) hits.push({ doc: p.doc, excerpt: p.excerpt, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** Vérifie si une référence (auteur, année) existe dans la base institutionnelle. */
export function findInCorpus(author: string | null, year: number | null): CorpusDoc | null {
  if (!author && year == null) return null;
  const authorKey = author
    ? author.toLowerCase().split(/[^a-zàâçéèêëîïôûùüÿæœ-]+/).filter((w) => w.length > 2)[0] ?? null
    : null;
  for (const doc of LOCAL_CORPUS) {
    const yearOk = year == null || doc.year === year;
    const authorOk = authorKey == null || doc.authors.some((a) => a.toLowerCase().startsWith(authorKey));
    if (yearOk && authorOk && (authorKey || year != null)) return doc;
  }
  return null;
}
