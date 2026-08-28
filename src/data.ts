export type FileKind = "pdf" | "docx" | "txt";

export interface RecentEntry {
  id: string;
  name: string;
  kind: FileKind;
  date: string;
  time: string;
  pages: number;
  ai: number;
  plagiat: number;
  fresh?: boolean;
  sizeKo?: number;
  mots?: number;
}

export interface OriginRow {
  model: string;
  vendor: string;
  share: number;
}

export interface GlobalResults {
  fileName: string;
  ia: number;
  plagiat: number;
  refs: number;
  human: number;
  refsTotal: number;
  refsDouteuses: number;
  passages: number;
  summary: string;
  origins: OriginRow[];
  confidence?: "Faible" | "Moyenne" | "Élevée";
  confidenceInterval?: [number, number];
  decision?: string;
  engine?: { mode: "direct" | "worker"; durationMs: number; words: number };
  language?: "fr" | "en" | "mixte";
  signatureNote?: string;
  topFactors?: Array<{ nom: string; z_score: number; contribution: number }>;
  metrics?: {
    precision: number;
    transitionDensity: number;
    burstiness: number;
    mattr: number;
    originalite: number;
    charEntropy: number;
  };
}

export interface ReportItem {
  id: string;
  entry: RecentEntry;
  hash: string;
  createdAt: string;
}

export const recentEntries: RecentEntry[] = [
  { id: "e1", name: "Memoire_M2_Lafont_DroitNumerique.docx", kind: "docx", date: "13 févr. 2026", time: "09:42", pages: 86, ai: 18, plagiat: 6 },
  { id: "e2", name: "Rapport_Stage_ENSAI_2026.pdf", kind: "pdf", date: "12 févr. 2026", time: "17:15", pages: 42, ai: 41, plagiat: 12 },
  { id: "e3", name: "These_Chap3_Methodologie.docx", kind: "docx", date: "12 févr. 2026", time: "11:03", pages: 64, ai: 9, plagiat: 3 },
  { id: "e4", name: "Article_Revue_Pasteur_v4.pdf", kind: "pdf", date: "11 févr. 2026", time: "16:48", pages: 28, ai: 67, plagiat: 21 },
  { id: "e5", name: "Lettre_Motivation_Concours_Agreg.txt", kind: "txt", date: "10 févr. 2026", time: "08:27", pages: 3, ai: 4, plagiat: 0 },
];

export const baselineResults: GlobalResults = {
  fileName: "Memoire_M2_Lafont_DroitNumerique.docx",
  ia: 18,
  plagiat: 6,
  refs: 4,
  human: 72,
  refsTotal: 24,
  refsDouteuses: 3,
  passages: 7,
  summary:
    "Profil d'écriture majoritairement humain. Sur 86 pages analysées, 7 passages présentent une signature générative faible à modérée, concentrés en sections 4.2 et 6.1. Deux similarités textuelles mineures avec la base institutionnelle. 3 références sur 24 n'ont pas pu être vérifiées (DOI introuvable).",
  origins: [
    { model: "GPT-4o", vendor: "OpenAI", share: 42 },
    { model: "Gemini 1.5 Pro", vendor: "Google", share: 27 },
    { model: "Claude 3.5 Sonnet", vendor: "Anthropic", share: 14 },
    { model: "Llama 3.1 70B", vendor: "Meta", share: 9 },
    { model: "Mistral Large 2", vendor: "Mistral AI", share: 8 },
  ],
};

export const scanStages = [
  "Extraction du texte & OCR",
  "Empreinte vectorielle du document",
  "Détection IA générative (18 features)",
  "Vérification anti-plagiat (web + base)",
  "Contrôle des références & DOI",
  "Génération du rapport signé",
];

export const scanStageAt = (p: number) => (p < 12 ? 0 : p < 28 ? 1 : p < 46 ? 2 : p < 66 ? 3 : p < 86 ? 4 : 5);

export const reportIncludes = [
  "Score global & ventilation par catégorie de risque",
  "Bilan du plagiat conditionnel (citations vs plagiats avérés)",
  "Audit des hallucinations bibliographiques (CrossRef + base interne)",
  "Empreinte des modèles d'IA détectés (GPT, Gemini, Claude…)",
  "Certificat d'authenticité horodaté & hash SHA-256",
];

export const flaggedPassages = [
  {
    section: "Section 4.2 — État de l'art",
    confidence: 78,
    text: "« Il convient de souligner que la transformation numérique des administrations publiques s'inscrit dans un continuum de réformes structurelles… »",
    verdict: "Signature générative modérée — reformulation recommandée",
  },
  {
    section: "Section 6.1 — Discussion",
    confidence: 64,
    text: "« En définitive, les résultats obtenus corroborent les hypothèses initiales tout en ouvrant des perspectives de recherche inédites… »",
    verdict: "Similarité 82 % avec Corpus_2024_Memoire_Benali (base interne)",
  },
];

export const notifications = [
  { id: "n1", title: "Analyse terminée", body: "Rapport_Stage_ENSAI_2026.pdf — 41 % de risque IA détecté.", when: "il y a 2 min", tone: "warn" as const },
  { id: "n2", title: "Base synchronisée", body: "+1 240 documents indexés depuis la bibliothèque numérique.", when: "il y a 1 h", tone: "ok" as const },
  { id: "n3", title: "Nouveau modèle détectable", body: "Gemini 2.0 Flash ajouté au moteur de détection v2.1.", when: "il y a 3 h", tone: "info" as const },
];

export function statusOf(ai: number): "faible" | "modere" | "eleve" {
  if (ai >= 50) return "eleve";
  if (ai >= 25) return "modere";
  return "faible";
}

export function generateResults(fileName: string): GlobalResults {
  let seed = 0;
  for (const c of fileName) seed = (seed * 31 + c.charCodeAt(0)) % 9973;
  const rnd = (n: number) => ((seed = (seed * 137 + 71) % 9973) / 9973) * n;

  const ia = Math.round(6 + rnd(52));
  const plagiat = Math.round(1 + rnd(18));
  const refs = Math.round(2 + rnd(7));
  const human = Math.max(0, 100 - Math.min(100, ia + plagiat + refs));
  const refsTotal = 12 + Math.round(rnd(26));
  const refsDouteuses = Math.min(refsTotal - 2, Math.round(rnd(5)));
  const passages = Math.max(1, Math.round((ia / 100) * (18 + rnd(14))));

  const base = [42, 27, 14, 9, 8];
  const jittered = base.map((v) => Math.max(3, v + Math.round(rnd(11) - 5)));
  const sum = jittered.reduce((a, b) => a + b, 0);
  const models = ["GPT-4o", "Gemini 1.5 Pro", "Claude 3.5 Sonnet", "Llama 3.1 70B", "Mistral Large 2"];
  const vendors = ["OpenAI", "Google", "Anthropic", "Meta", "Mistral AI"];
  const origins: OriginRow[] = models.map((model, i) => ({
    model,
    vendor: vendors[i],
    share: Math.round((jittered[i] / sum) * 100),
  }));

  const pages = 8 + Math.round(rnd(90));
  const verdict =
    ia < 25 ? "Profil d'écriture majoritairement humain" : ia < 50 ? "Signaux génératifs modérés à surveiller" : "Forte probabilité de contenu généré par IA";

  const summary = `${verdict}. Sur ${pages} pages analysées, ${passages} passage${passages > 1 ? "s" : ""} présente${passages > 1 ? "nt" : ""} une signature générative, ${
    plagiat > 8 ? "plusieurs similarités textuelles confirmées" : "quelques similarités textuelles mineures"
  } avec les corpus de référence, et ${refsDouteuses} référence${refsDouteuses > 1 ? "s" : ""} sur ${refsTotal} n'${refsDouteuses > 1 ? "ont" : "a"} pas pu être vérifiée${refsDouteuses > 1 ? "s" : ""} (DOI introuvable).`;

  return { fileName, ia, plagiat, refs, human, refsTotal, refsDouteuses, passages, summary, origins };
}

export function fmtInt(n: number): string {
  return n.toLocaleString("fr-FR");
}

/* ---------- Archives, rapports seed, statistiques ---------- */

export const archiveEntries: RecentEntry[] = [
  { id: "a1", name: "Dossier_HDR_Marchand_Sociologie.pdf", kind: "pdf", date: "08 févr. 2026", time: "14:12", pages: 132, ai: 29, plagiat: 8 },
  { id: "a2", name: "Copie_Examen_Partiel_Eco_M1.docx", kind: "docx", date: "07 févr. 2026", time: "10:55", pages: 6, ai: 74, plagiat: 31 },
  { id: "a3", name: "Manuscrit_These_Bouvier_Ch4.docx", kind: "docx", date: "05 févr. 2026", time: "18:30", pages: 58, ai: 12, plagiat: 4 },
  { id: "a4", name: "Proceedings_Colloque_IHM_2026.pdf", kind: "pdf", date: "03 févr. 2026", time: "09:08", pages: 96, ai: 38, plagiat: 14 },
  { id: "a5", name: "Note_Synthese_Conseil_Scientifique.txt", kind: "txt", date: "01 févr. 2026", time: "16:44", pages: 4, ai: 5, plagiat: 1 },
  { id: "a6", name: "Memoire_L3_Droit_Fiscal_Renucci.docx", kind: "docx", date: "29 janv. 2026", time: "11:21", pages: 71, ai: 52, plagiat: 19 },
  { id: "a7", name: "Preprint_Laboratoire_Cognitique.pdf", kind: "pdf", date: "26 janv. 2026", time: "15:02", pages: 22, ai: 21, plagiat: 7 },
  { id: "a8", name: "Lettre_Recommandation_Prof_Klein.txt", kind: "txt", date: "22 janv. 2026", time: "08:47", pages: 2, ai: 8, plagiat: 0 },
];

export const seedReports: ReportItem[] = [
  {
    id: "r1",
    entry: { id: "a2", name: "Copie_Examen_Partiel_Eco_M1.docx", kind: "docx", date: "07 févr. 2026", time: "10:55", pages: 6, ai: 74, plagiat: 31, mots: 2140, sizeKo: 88 },
    hash: "7c21 b9e4 55d0 8a3f 6e1c",
    createdAt: "07 févr. 2026 · 11:02",
  },
  {
    id: "r2",
    entry: { id: "a6", name: "Memoire_L3_Droit_Fiscal_Renucci.docx", kind: "docx", date: "29 janv. 2026", time: "11:21", pages: 71, ai: 52, plagiat: 19, mots: 24800, sizeKo: 1240 },
    hash: "1e9f 44ac d023 77b1 90ee",
    createdAt: "29 janv. 2026 · 11:34",
  },
  {
    id: "r3",
    entry: { id: "e4", name: "Article_Revue_Pasteur_v4.pdf", kind: "pdf", date: "11 févr. 2026", time: "16:48", pages: 28, ai: 67, plagiat: 21, mots: 9800, sizeKo: 2050 },
    hash: "b340 91fd 27ce 4a88 5d12",
    createdAt: "11 févr. 2026 · 16:55",
  },
];

export const monthlyAiRate = [
  { m: "Mars", v: 22 }, { m: "Avr.", v: 25 }, { m: "Mai", v: 24 }, { m: "Juin", v: 31 },
  { m: "Juil.", v: 29 }, { m: "Août", v: 26 }, { m: "Sept.", v: 33 }, { m: "Oct.", v: 38 },
  { m: "Nov.", v: 41 }, { m: "Déc.", v: 36 }, { m: "Janv.", v: 44 }, { m: "Févr.", v: 47 },
];

export const facultyDistribution = [
  { name: "Droit & Science politique", v: 34 },
  { name: "Sciences & Ingénierie", v: 27 },
  { name: "Lettres & Philosophie", v: 18 },
  { name: "Économie & Gestion", v: 13 },
  { name: "Médecine & Santé", v: 8 },
];
