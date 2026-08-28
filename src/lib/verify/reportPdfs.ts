// ============================================================
// Générateurs PDF structurés (jsPDF)
// - Rapport de vérification hybride (5 sections)
// - Rapport d'analyse (score IA par modèle, plagiat, recommandations)
// ============================================================
import { jsPDF } from "jspdf";
import type { GlobalResults, RecentEntry } from "../../data";
import type { VerifyReport } from "./verifyEngine";

const NIGHT: [number, number, number] = [9, 17, 36];
const GOLD: [number, number, number] = [213, 166, 60];
const INK: [number, number, number] = [35, 48, 74];
const MUTE: [number, number, number] = [95, 112, 150];
const JADE: [number, number, number] = [29, 138, 95];
const ROSE: [number, number, number] = [181, 60, 72];
const EMBER: [number, number, number] = [176, 105, 32];

interface Ctx {
  doc: jsPDF;
  y: number;
}

function ensurePage(ctx: Ctx, needed: number) {
  if (ctx.y + needed > 278) {
    ctx.doc.addPage();
    ctx.y = 18;
  }
}

function header(ctx: Ctx, title: string, subtitle: string) {
  const { doc } = ctx;
  doc.setFillColor(...NIGHT);
  doc.rect(0, 0, 210, 34, "F");
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(0, 34, 210, 34);
  doc.setTextColor(248, 227, 164);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("OLIGENS DETECTOR", 14, 13, { charSpace: 1.2 });
  doc.setTextColor(234, 239, 250);
  doc.setFontSize(15);
  doc.text(title, 14, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(160, 175, 210);
  doc.text(subtitle, 14, 28);
  ctx.y = 44;
}

function sectionTitle(ctx: Ctx, index: number, label: string) {
  const { doc } = ctx;
  ensurePage(ctx, 16);
  doc.setFillColor(...GOLD);
  doc.roundedRect(14, ctx.y - 3.5, 6.5, 6.5, 1, 1, "F");
  doc.setTextColor(9, 17, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(String(index), 17.2, ctx.y + 0.8, { align: "center" });
  doc.setTextColor(...INK);
  doc.setFontSize(11);
  doc.text(label, 24, ctx.y + 0.8);
  ctx.y += 8;
}

function paragraph(ctx: Ctx, text: string, color: [number, number, number] = INK, size = 9) {
  const { doc } = ctx;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, 180);
  ensurePage(ctx, lines.length * 4.2 + 2);
  doc.text(lines, 14, ctx.y);
  ctx.y += lines.length * 4.2 + 2.5;
}

function bullet(ctx: Ctx, text: string, color: [number, number, number] = INK) {
  const { doc } = ctx;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTE);
  doc.text("•", 16, ctx.y);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, 174);
  ensurePage(ctx, lines.length * 4.2 + 1);
  doc.text(lines, 20, ctx.y);
  ctx.y += lines.length * 4.2 + 1.5;
}

function spacer(ctx: Ctx, h = 5) {
  ctx.y += h;
}

/* ---------- Rapport de vérification hybride ---------- */

export function exportVerifyReportPdf(report: VerifyReport): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ctx: Ctx = { doc, y: 44 };

  header(ctx, "Rapport de vérification — Plagiat & Références", `${report.fileName} · ${report.generatedAt} · ${report.words.toLocaleString("fr-FR")} mots analysés · Moteur hybride v2.1`);

  // 1. Score global & signature IA
  sectionTitle(ctx, 1, "Score global & signature IA");
  const p = Math.round(report.ai.probabilite * 1000) / 10;
  paragraph(ctx, `Probabilité d'origine artificielle estimée : ${p.toLocaleString("fr-FR")} %. ${report.ai.signatureNote}`);
  for (const m of report.ai.modeles.slice(0, 5)) {
    bullet(ctx, `${m.model} (${m.vendor}) — ${m.share} % de la signature détectée`);
  }
  spacer(ctx);

  // 2. Bilan du plagiat conditionnel
  sectionTitle(ctx, 2, "Bilan du plagiat conditionnel");
  const s = report.similarity;
  paragraph(
    ctx,
    `${s.sentencesAnalyzed} phrases analysées · ${s.similarCount} similarité(s) externe(s) détectée(s). ` +
      `Citations légitimes (passages correctement sourcés) : ${s.citationsValides}. Plagiats avérés (emprunts sans référence valide) : ${s.plagiatsAveres}.`,
    s.plagiatsAveres > 0 ? ROSE : INK
  );
  for (const h of s.hits.slice(0, 8)) {
    const verdict = h.isPlagiarism ? "PLAGIAT AVÉRÉ (non sourcé)" : "Citation légitime";
    bullet(ctx, `${verdict} · similarité ${Math.round(h.similarity * 100)} % avec « ${h.sourceLabel} »${h.evidence ? ` — ancrage : ${h.evidence}` : ""}`, h.isPlagiarism ? ROSE : JADE);
  }
  spacer(ctx);

  // 3. Audit des références & hallucinations
  sectionTitle(ctx, 3, "Audit des références & hallucinations");
  const r = report.references;
  paragraph(
    ctx,
    `${r.items.length} référence(s) extraite(s). Hallucinations / fausses références identifiées : ${r.hallucinations}.`,
    r.hallucinations > 0 ? ROSE : INK
  );
  for (const item of r.items.slice(0, 10)) {
    const tag = item.isHallucination ? "HALLUCINATION" : item.status === "verifiee" ? "Vérifiée" : "Introuvable";
    const color = item.isHallucination ? ROSE : item.status === "verifiee" ? JADE : EMBER;
    bullet(ctx, `${tag} — ${item.raw} · ${item.detail}`, color);
  }
  if (r.structural.anomalies.length > 0) {
    paragraph(ctx, "Anomalies de mise en forme :", EMBER);
    for (const a of r.structural.anomalies) bullet(ctx, a, EMBER);
  }
  spacer(ctx);

  // 4. Analyse méthodologique
  sectionTitle(ctx, 4, "Analyse méthodologique");
  paragraph(
    ctx,
    report.methodology.mixingDetected
      ? "MÉLANGE MÉTHODOLOGIQUE HÉTÉROGÈNE DÉTECTÉ. " + report.methodology.detail
      : report.methodology.detail,
    report.methodology.mixingDetected ? EMBER : INK
  );
  for (const f of report.methodology.flags) bullet(ctx, `${f.label} — ${f.detail}`);
  spacer(ctx);

  // 5. Sources hybrides consultées
  sectionTitle(ctx, 5, "Sources hybrides consultées (traçabilité)");
  for (const src of report.sources) {
    bullet(ctx, `[${src.kind === "institutionnelle" ? "Institutionnel" : "Web"}] ${src.label} — ${src.consulted} unité(s) consultée(s) · correspondance : ${src.matched ? "oui" : "non"}`);
  }
  if (report.qwenUsed) {
    bullet(ctx, "Vérification croisée sémantique effectuée par le LLM AgweStream (contexte de référence injecté).", MUTE);
  }
  spacer(ctx, 8);

  // Pied de certification
  ensurePage(ctx, 24);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(14, ctx.y, 196, ctx.y);
  ctx.y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTE);
  doc.text(
    `Document généré par OLIGENS DETECTOR · IA_DETECT v2.1 · Empreinte SHA-256 horodatée eIDAS · ${report.generatedAt}`,
    14,
    ctx.y
  );

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTE);
    doc.text(`Page ${i}/${pages}`, 196, 290, { align: "right" });
  }

  doc.save(`Oligens_Verification_${report.fileName.replace(/\.\w+$/, "").slice(0, 32)}.pdf`);
}

/* ---------- Rapport d'analyse (score par modèle) ---------- */

export function exportAnalysisReportPdf(entry: RecentEntry, results: GlobalResults): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ctx: Ctx = { doc, y: 44 };

  header(ctx, "Rapport d'analyse documentaire", `${entry.name} · ${entry.date} ${entry.time} · ${entry.pages} page(s)${entry.mots ? ` · ${entry.mots.toLocaleString("fr-FR")} mots` : ""}`);

  sectionTitle(ctx, 1, "Score d'origine IA & répartition par modèle");
  paragraph(ctx, `Risque IA global : ${entry.ai} % — ${results.decision ?? "estimation heuristique (18 features stylométriques)"}. ${results.signatureNote ?? ""}`);
  for (const o of results.origins) {
    bullet(ctx, `${o.model} (${o.vendor}) — ${o.share} % de la signature`);
  }
  spacer(ctx);

  sectionTitle(ctx, 2, "Bilan du plagiat conditionnel");
  paragraph(ctx, `Plagiat estimé : ${entry.plagiat} %. ${results.summary}`);
  spacer(ctx);

  sectionTitle(ctx, 3, "Audit des références & hallucinations");
  paragraph(
    ctx,
    `${results.refsDouteuses} référence(s) sur ${results.refsTotal} n'ont pas pu être vérifiées (DOI introuvable, auteur orphelin ou année incohérente) — à traiter comme hallucinations potentielles.`,
    results.refsDouteuses > 3 ? ROSE : INK
  );
  spacer(ctx);

  sectionTitle(ctx, 4, "Recommandations méthodologiques");
  const recs =
    entry.ai >= 50
      ? [
          "Réécrire les passages à signature générative forte (sections identifiées) avec un registre propre à l'auteur.",
          "Varier la longueur des phrases et supprimer les connecteurs prévisibles.",
          "Faire relire par un tiers avant nouvelle soumission.",
        ]
      : entry.ai >= 25
        ? [
            "Vigilance ciblée sur les passages modérément signalés — reformulation légère recommandée.",
            "Vérifier l'ancrage référentiel de chaque similarité détectée.",
          ]
        : [
            "Profil majoritairement humain — aucune action corrective requise.",
            "Conserver le document source pour l'audit trail institutionnel.",
          ];
  for (const r of recs) bullet(ctx, r);
  spacer(ctx, 8);

  ensurePage(ctx, 24);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(14, ctx.y, 196, ctx.y);
  ctx.y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTE);
  doc.text(`Document généré par OLIGENS DETECTOR · IA_DETECT v2.1 · Certificat horodaté eIDAS · ${entry.date} ${entry.time}`, 14, ctx.y);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTE);
    doc.text(`Page ${i}/${pages}`, 196, 290, { align: "right" });
  }

  doc.save(`Oligens_Rapport_${entry.name.replace(/\.\w+$/, "").slice(0, 32)}.pdf`);
}
