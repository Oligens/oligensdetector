// ============================================================
// MOTEUR DE VÉRIFICATION HYBRIDE — Plagiat conditionnel & références
//
// Règle métier stricte : un passage similaire à une source externe
// n'est un PLAGIAT AVÉRÉ que s'il ne comporte AUCUNE référence valide
// (citation intra-texte, note de bas de page ou entrée bibliographique).
// S'il est sourcé → citation académique légitime.
//
// Pipeline : empreinte IA (18 features) → extraction & audit des
// références (CrossRef + base institutionnelle) → similarités locales
// et web (Wikipédia) → vérification croisée sémantique Qwen →
// analyse méthodologique → rapport en 5 sections.
// ============================================================
import { runFullAnalysis, sentencize, type FullAnalysisResult } from "../detector/heuristicEngine";
import {
  findInCorpus,
  jaccard,
  LOCAL_CORPUS,
  searchLocalCorpus,
  tokenSet,
  type LocalHit,
} from "./localCorpus";
import { verifyViaCrossref, searchWebExcerpts, type CrossrefOutcome, type WebExcerpt } from "./webSearch";
import { verifyViaQwenVerify, type QwenVerifyJudgment } from "./qwenVerify";

export type SourceKind = "institutionnelle" | "web";

export interface SimilarityHit {
  sentence: string;
  similarity: number;
  sourceKind: SourceKind;
  sourceLabel: string;
  sourceRef: string | null;
  documented: boolean;
  evidence?: string;
  isPlagiarism: boolean;
}

export type RefStatus = "verifiee" | "introuvable" | "invalide";

export interface RefItem {
  raw: string;
  author: string | null;
  year: number | null;
  kind: "in-text" | "footnote" | "bibliography" | "doi" | "url";
  status: RefStatus;
  isHallucination: boolean;
  doi?: string;
  detail: string;
}

export interface MethodFlag {
  label: string;
  detail: string;
}

export interface MethodologyAssessment {
  coherent: boolean;
  mixingDetected: boolean;
  flags: MethodFlag[];
  detail: string;
}

export interface StructuralAudit {
  footnotesDetected: number;
  bibliographyDetected: boolean;
  anomalies: string[];
}

export interface SimilaritySummary {
  sentencesAnalyzed: number;
  similarCount: number;
  citationsValides: number;
  plagiatsAveres: number;
  hits: SimilarityHit[];
}

export interface SourceTrace {
  kind: SourceKind;
  label: string;
  consulted: number;
  matched: boolean;
}

export interface VerifyReport {
  fileName: string;
  generatedAt: string;
  words: number;
  ai: { probabilite: number; signatureNote: string; modeles: FullAnalysisResult["signature"]["modeles"]; topFactors: FullAnalysisResult["rapport_detaille"] };
  similarity: SimilaritySummary;
  references: { items: RefItem[]; hallucinations: number; structural: StructuralAudit };
  methodology: MethodologyAssessment;
  sources: SourceTrace[];
  qwenUsed: boolean;
  localCorpusDocs: number;
  webReachable: boolean;
}

export type VerifyPhase =
  | "empreinte"
  | "refs"
  | "similarites"
  | "qwen"
  | "methodologie"
  | "rapport";

export interface VerifyCallbacks {
  onPhase?: (phase: VerifyPhase, label: string) => void;
  onLocalHits?: (hits: LocalHit[]) => void;
  onWebExcerpts?: (excerpts: WebExcerpt[]) => void;
  onQwen?: (judgment: QwenVerifyJudgment | null) => void;
}

export interface VerifyOptions {
  fileName?: string;
  useWeb?: boolean;
  useQwen?: boolean;
}

export interface VerifyOverrides {
  /** Base de comparaison locale ciblée (scan de corpus) — remplace la base globale. */
  localBase?: LocalHit[];
  localBaseLabel?: string;
}

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  institutionnelle: "Base institutionnelle",
  web: "Web open-source",
};

const SIMILARITY_THRESHOLD = 0.32;
const PARAPHRASE_THRESHOLD = 0.22;

/* ---------- Extraction des références ---------- */

interface ExtractedRefs {
  items: RefItem[];
  footnoteCount: number;
  hasBibliography: boolean;
}

function extractReferences(text: string): ExtractedRefs {
  const items: RefItem[] = [];
  const seen = new Set<string>();

  // Citations intra-texte (Auteur, 2021)
  const inTextRe = /\(\s*([A-ZÀ-ÖØ-Þ][\w'’-]*(?:\s*(?:et al\.|&|et)\s*[A-ZÀ-ÖØ-Þ]?[\w'’-]*)?)\s*,\s*(\d{4})[a-z]?\s*\)/g;
  for (const m of text.matchAll(inTextRe)) {
    const key = `intext:${m[1].toLowerCase()}:${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ raw: m[0], author: m[1], year: Number(m[2]), kind: "in-text", status: "introuvable", isHallucination: false, detail: "" });
  }

  // Notes de bas de page
  const footnoteRe = /(?:^|\s)\[(\d{1,3})\]\s+([^\n\[]{20,180})/g;
  let footnoteCount = 0;
  for (const m of text.matchAll(footnoteRe)) {
    footnoteCount++;
    const yearMatch = m[2].match(/(19|20)\d{2}/);
    const authorMatch = m[2].match(/^([A-ZÀ-ÖØ-Þ][\w'’-]+)/);
    const key = `fn:${m[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      raw: m[0].trim(),
      author: authorMatch?.[1] ?? null,
      year: yearMatch ? Number(yearMatch[0]) : null,
      kind: "footnote",
      status: "introuvable",
      isHallucination: false,
      detail: "",
    });
  }

  // Section bibliographique
  const hasBibliography = /\n\s*(bibliographie|références(?:\s+bibliographiques)?|works?\s+cited|references)\s*[\n:]/i.test(text);
  if (hasBibliography) {
    const start = text.search(/\n\s*(bibliographie|références(?:\s+bibliographiques)?|works?\s+cited|references)\s*[\n:]/i);
    const section = text.slice(start);
    const entryRe = /([A-ZÀ-ÖØ-Þ][\w'’-]+)\s*(?:\((\d{4})\)|,?\s*(19|20)\d{2})/g;
    let count = 0;
    for (const m of section.matchAll(entryRe)) {
      count++;
      if (count > 12) break;
      const year = m[2] ? Number(m[2]) : m[3] ? Number(m[0].match(/(19|20)\d{2}/)?.[0] ?? "") : null;
      const key = `bib:${m[1].toLowerCase()}:${year ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ raw: m[0], author: m[1], year, kind: "bibliography", status: "introuvable", isHallucination: false, detail: "" });
    }
  }

  // DOI & URL
  for (const m of text.matchAll(/\b(10\.\d{4,9}\/[^\s)\].,]+)/g)) {
    const key = `doi:${m[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ raw: `DOI ${m[1]}`, author: null, year: null, kind: "doi", status: "introuvable", isHallucination: false, detail: "" });
  }
  for (const m of text.matchAll(/(https?:\/\/[^\s)]+)/g)) {
    const key = `url:${m[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ raw: m[1], author: null, year: null, kind: "url", status: "introuvable", isHallucination: false, detail: "" });
  }

  return { items, footnoteCount, hasBibliography };
}

/* ---------- Anomalies structurelles ---------- */

function buildStructuralAudit(extracted: ExtractedRefs, hasInlineCitations: boolean): StructuralAudit {
  const anomalies: string[] = [];
  if (extracted.footnoteCount === 0) {
    anomalies.push("Aucune note de bas de page détectée dans le document.");
  }
  if (!extracted.hasBibliography) {
    anomalies.push("Aucune section « Bibliographie / Références » structurée en fin de document.");
  }
  if (hasInlineCitations && !extracted.hasBibliography && extracted.footnoteCount === 0) {
    anomalies.push("Citations intra-texte présentes mais sans correspondance bibliographique ni note — ancrage référentiel incomplet.");
  }
  return { footnotesDetected: extracted.footnoteCount, bibliographyDetected: extracted.hasBibliography, anomalies };
}

/* ---------- Détection du mélange méthodologique ---------- */

const QUANTI_MARKERS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(régression|corrélation|significativit[ée]|p\s*[<>]\s*0[,.]0\d|écart[- ]type|moyenne|questionnaire|échantillon de \d|analyse statistique|mod[èe]le lin[éee]aire|hypoth[èe]se\s+h\d?)\b/gi, label: "Positivisme quantitatif" },
];
const QUALI_MARKERS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(ph[ée]nom[ée]nologie|herm[ée]neutique|entretien semi-directif|analyse th[ée]matique|v[ée]cu|intersubjectivit[ée]|compréhensive|ethnographie|observatoire participante?)\b/gi, label: "Phénoménologie qualitative" },
];
const MIXING_MARKERS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(triangulation|m[ée]thodes mixtes|mixed methods|approche mixte|compl[ée]mentarit[ée] (des|quantitative))\b/gi, label: "Triangulation déclarée" },
];

function analyzeMethodology(text: string, qwen: QwenVerifyJudgment | null): MethodologyAssessment {
  const flags: MethodFlag[] = [];
  const hasQuanti = QUANTI_MARKERS.some((m) => m.re.test(text));
  const hasQuali = QUALI_MARKERS.some((m) => m.re.test(text));
  const hasTriangulation = MIXING_MARKERS.some((m) => m.re.test(text));

  const mixingDetected = (hasQuanti && hasQuali && !hasTriangulation) || (qwen?.methodology.incoherent_mix ?? false);

  if (hasQuanti) flags.push({ label: "Positivisme quantitatif", detail: "Marqueurs détectés : mesures, tests statistiques, hypothèses." });
  if (hasQuali) flags.push({ label: "Phénoménologie qualitative", detail: "Marqueurs détectés : vécu, entretiens, herméneutique." });
  if (hasTriangulation) flags.push({ label: "Triangulation déclarée", detail: "L'auteur assume explicitement l'articulation des approches." });

  let detail: string;
  if (mixingDetected) {
    detail =
      qwen?.methodology.detail ||
      "Le document combine des marqueurs quantitatifs (régression, significativité) et qualitatifs (phénoménologie, vécu) sans triangulation déclarée : mélange méthodologique hétérogène à faire justifier par l'auteur.";
  } else if (hasQuanti || hasQuali) {
    detail = "Démarche méthodologique cohérente — une seule tradition épistémologique dominante est identifiable.";
  } else {
    detail = "Aucun marqueur méthodologique fort détecté — le document ne permet pas de caractériser la démarche.";
  }

  return { coherent: !mixingDetected, mixingDetected, flags, detail };
}

/* ---------- Orchestrateur principal ---------- */

export async function runVerification(
  text: string,
  opts: VerifyOptions = {},
  cb: VerifyCallbacks = {},
  overrides: VerifyOverrides = {}
): Promise<VerifyReport> {
  const fileName = opts.fileName ?? "Document.pdf";

  // 1. Empreinte & signature IA
  cb.onPhase?.("empreinte", "Empreinte stylométrique & signature IA (18 features)…");
  const full = runFullAnalysis(text);

  // 2. Références + audit croisé (CrossRef + base institutionnelle)
  cb.onPhase?.("refs", "Extraction des références & croisement CrossRef / base interne…");
  const extracted = extractReferences(text);
  const items: RefItem[] = [];
  for (const ref of extracted.items) {
    const item: RefItem = { ...ref };
    if (ref.kind === "doi") {
      item.status = "verifiee";
      item.detail = "Structure DOI valide — résoluble via Crossref.";
      item.doi = ref.raw.replace(/^DOI\s*/, "");
    } else if (ref.kind === "url") {
      item.status = "verifiee";
      item.detail = "Lien web présent — vérification de contenu non effectuée.";
    } else {
      const yearNow = new Date().getFullYear();
      const localDoc = findInCorpus(ref.author, ref.year);
      if (ref.year != null && ref.year > yearNow) {
        item.status = "invalide";
        item.isHallucination = true;
        item.detail = `Année ${ref.year} dans le futur — référence inventée.`;
      } else if (localDoc) {
        item.status = "verifiee";
        item.detail = `Présente dans la base institutionnelle — ${localDoc.title} (${localDoc.year}).`;
      } else {
        const cross: CrossrefOutcome = await verifyViaCrossref(ref.author, ref.year, null);
        if (cross.found) {
          item.status = "verifiee";
          item.detail = `Vérifiée via CrossRef${cross.doi ? ` — DOI ${cross.doi}` : ""}.`;
          item.doi = cross.doi;
        } else if (cross.reachable) {
          item.status = "introuvable";
          item.isHallucination = true;
          item.detail = "Introuvable dans CrossRef ET dans la base institutionnelle — hallucination probable.";
        } else {
          item.status = "introuvable";
          item.detail = "CrossRef injoignable — vérification limitée à la base institutionnelle.";
        }
      }
    }
    items.push(item);
  }

  const hasInlineCitations = items.some((r) => r.kind === "in-text" || r.kind === "footnote");
  const structural = buildStructuralAudit(extracted, hasInlineCitations);
  const hallucinations = items.filter((r) => r.isHallucination).length;

  // 3. Similarités — base institutionnelle (globale ou corpus ciblé) + web
  cb.onPhase?.("similarites", "Recherche de similarités — base institutionnelle & web…");
  const sentences = sentencize(text).filter((s) => s.split(/\s+/).length >= 10).slice(0, 60);

  const localHitsBySentence: Map<string, LocalHit[]> = new Map();
  if (overrides.localBase) {
    for (const s of sentences) {
      const q = tokenSet(s);
      const hits = overrides.localBase
        .map((h) => ({ ...h, score: jaccard(q, tokenSet(h.excerpt)) }))
        .filter((h) => h.score >= 0.15)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);
      if (hits.length) localHitsBySentence.set(s, hits);
    }
  } else {
    for (const s of sentences) {
      const hits = searchLocalCorpus(s, 2);
      if (hits.length) localHitsBySentence.set(s, hits);
    }
  }
  cb.onLocalHits?.(Array.from(localHitsBySentence.values()).flat().slice(0, 12));

  let webExcerpts: WebExcerpt[] = [];
  let webReachable = false;
  if (opts.useWeb !== false) {
    const query = sentences.slice(0, 3).join(" ").slice(0, 140);
    const web = await searchWebExcerpts(query);
    webReachable = web.reachable;
    webExcerpts = web.excerpts;
    cb.onWebExcerpts?.(webExcerpts);
  }

  // RÈGLE MÉTIER : similarité + absence de référence valide = plagiat avéré.
  const similarSentences = sentences.filter((s) => {
    const hits = localHitsBySentence.get(s) ?? [];
    return hits.some((h) => h.score >= SIMILARITY_THRESHOLD);
  });

  const hitResults: SimilarityHit[] = [];
  for (const s of similarSentences) {
    const best = (localHitsBySentence.get(s) ?? []).sort((a, b) => b.score - a.score)[0];
    if (!best) continue;
    const evidenceMatch = items.find(
      (r) =>
        (r.kind === "in-text" || r.kind === "footnote" || r.kind === "bibliography") &&
        r.author &&
        s.toLowerCase().includes(r.author.toLowerCase().split(" ")[0].toLowerCase())
    );
    const documented = Boolean(evidenceMatch) && evidenceMatch!.status !== "invalide";
    hitResults.push({
      sentence: s,
      similarity: best.score,
      sourceKind: "institutionnelle",
      sourceLabel: overrides.localBaseLabel ?? best.doc.title,
      sourceRef: best.doc.title,
      documented,
      evidence: evidenceMatch?.raw,
      isPlagiarism: !documented,
    });
  }

  // Similarités web (paraphrase)
  if (webExcerpts.length > 0) {
    const webSentenceSets = webExcerpts.flatMap((w) => w.sentences.map((ws) => ({ ws, tokens: tokenSet(ws), w })));
    for (const s of sentences) {
      const q = tokenSet(s);
      let best: { score: number; ws: string; w: WebExcerpt } | null = null;
      for (const cand of webSentenceSets) {
        const score = jaccard(q, cand.tokens);
        if (score >= PARAPHRASE_THRESHOLD && (!best || score > best.score)) {
          best = { score, ws: cand.ws, w: cand.w };
        }
      }
      if (best && best.score < SIMILARITY_THRESHOLD + 0.05) {
        const evidenceMatch = items.find((r) => r.author && s.toLowerCase().includes(r.author.toLowerCase().split(" ")[0].toLowerCase()));
        const documented = Boolean(evidenceMatch);
        hitResults.push({
          sentence: s,
          similarity: best.score,
          sourceKind: "web",
          sourceLabel: best.w.title,
          sourceRef: best.w.url,
          documented,
          evidence: evidenceMatch?.raw,
          isPlagiarism: !documented,
        });
      }
    }
  }

  hitResults.sort((a, b) => b.similarity - a.similarity);
  const citationsValides = hitResults.filter((h) => !h.isPlagiarism).length;
  const plagiatsAveres = hitResults.filter((h) => h.isPlagiarism).length;

  // 4. Vérification croisée sémantique Qwen (contexte injecté)
  let qwenJudgment: QwenVerifyJudgment | null = null;
  if (opts.useQwen !== false) {
    cb.onPhase?.("qwen", "Vérification croisée sémantique — LLM AgweStream…");
    const referenceContext = [
      ...Array.from(localHitsBySentence.values()).flat().slice(0, 8).map((h) => `[Base institutionnelle — ${h.doc.title}] ${h.excerpt}`),
      ...webExcerpts.flatMap((w) => w.sentences.slice(0, 4).map((s) => `[Web — ${w.title}] ${s}`)),
    ].join("\n");
    if (referenceContext.length > 40 && sentences.length > 0) {
      qwenJudgment = await verifyViaQwenVerify({ segments: sentences.slice(0, 14), referenceContext });
      cb.onQwen?.(qwenJudgment);
      if (qwenJudgment) {
        for (const seg of qwenJudgment.segments) {
          if (seg.paraphrase_probable && seg.index < sentences.length) {
            const target = sentences[seg.index];
            const existing = hitResults.find((h) => h.sentence === target);
            if (existing) {
              existing.similarity = Math.max(existing.similarity, PARAPHRASE_THRESHOLD);
              existing.documented = existing.documented && !seg.paraphrase_probable ? false : existing.documented;
            }
          }
        }
      }
    }
  }

  // 5. Analyse méthodologique
  cb.onPhase?.("methodologie", "Analyse méthodologique — cohérence épistémologique…");
  const methodology = analyzeMethodology(text, qwenJudgment);

  // 6. Traçabilité des sources
  cb.onPhase?.("rapport", "Structuration du rapport en 5 sections…");
  const sources: SourceTrace[] = [
    {
      kind: "institutionnelle",
      label: overrides.localBaseLabel ?? `Base institutionnelle (${LOCAL_CORPUS.length} extraits indexés échantillonnés)`,
      consulted: sentences.length,
      matched: localHitsBySentence.size > 0,
    },
    {
      kind: "web",
      label: webReachable ? `Web open-source — ${webExcerpts.map((w) => w.title).join(", ") || "Wikipédia"}` : "Web open-source (injoignable depuis ce navigateur)",
      consulted: webExcerpts.flatMap((w) => w.sentences).length,
      matched: webExcerpts.length > 0,
    },
  ];

  return {
    fileName,
    generatedAt: new Date().toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    words: full.statistiques.mots,
    ai: {
      probabilite: full.probabilite_IA,
      signatureNote: full.signature.note,
      modeles: full.signature.modeles,
      topFactors: full.rapport_detaille,
    },
    similarity: {
      sentencesAnalyzed: sentences.length,
      similarCount: hitResults.length,
      citationsValides,
      plagiatsAveres,
      hits: hitResults.slice(0, 12),
    },
    references: { items, hallucinations, structural },
    methodology,
    sources,
    qwenUsed: qwenJudgment !== null,
    localCorpusDocs: overrides.localBase ? overrides.localBase.length : LOCAL_CORPUS.length,
    webReachable,
  };
}
