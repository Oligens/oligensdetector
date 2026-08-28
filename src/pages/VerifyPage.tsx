import { useCallback, useMemo, useRef, useState } from "react";
import { IconCheck, IconDownload, IconFlag, IconInfo, IconRefresh, IconScale, IconSearch, IconShield } from "../components/icons";
import { fmtInt } from "../data";
import type { LocalHit } from "../lib/verify/localCorpus";
import { LOCAL_CORPUS_STATS } from "../lib/verify/localCorpus";
import { exportVerifyReportPdf } from "../lib/verify/reportPdfs";
import {
  runVerification,
  SOURCE_KIND_LABEL,
  type VerifyOverrides,
  type VerifyPhase,
  type VerifyReport,
} from "../lib/verify/verifyEngine";
import type { WebExcerpt } from "../lib/verify/webSearch";
import { useAnalysis } from "../state/AnalysisContext";
import { PageHead, Pill, Reveal, Toggle } from "../ui";

const SAMPLE_VERIFY = `La détection des contenus générés par intelligence artificielle repose sur une analyse stylométrique combinant dix-huit caractéristiques linguistiques dont la burstiness et la richesse lexicale (Bouvier, 2023). Ces travaux confirment que la régularité rythmique des phrases constitue un marqueur discriminant de l'écriture artificielle, comme le montre l'étude DOI 10.1038/s41586-020-2649-2.

Un emprunt textuel ne saurait être qualifié de plagiat lorsque l'auteur a pris soin d'adosser le passage à une référence valide, qu'il s'agisse d'une citation intra-texte, d'une note de bas de page ou d'une entrée bibliographique. La distinction entre citation académique légitime et plagiat avéré repose exclusivement sur la présence ou l'absence d'un ancrage référentiel vérifiable.

Les modèles de langage produisent fréquemment des références inventées combinant des noms d'auteurs plausibles, des années vraisemblables et des titres séduisants mais inexistants. Notre protocole combine une régression logistique sur un échantillon de 312 répondants et une analyse phénoménologique du vécu issue de douze entretiens semi-directifs, sans triangulation déclarée (Harrington, 2031).

[1] Nakamura et Petit (2024). Hallucinations bibliographiques des modèles de langage : typologie et détection. Laboratoire Cognitique.

Bibliographie
Marchand (2021). Le plagiat conditionnel : pour une qualification rigoureuse des emprunts textuels. Revue de Droit du Numérique.`;

const PHASES: Array<{ key: VerifyPhase; label: string }> = [
  { key: "empreinte", label: "Empreinte & signature IA" },
  { key: "refs", label: "Références & hallucinations" },
  { key: "similarites", label: "Similarités hybrides" },
  { key: "qwen", label: "Vérification croisée LLM" },
  { key: "methodologie", label: "Analyse méthodologique" },
];

/* ---------- Hook d'exécution partagé (page /references & scan de corpus) ---------- */

export interface VerifyRunState {
  running: boolean;
  phase: VerifyPhase | null;
  phaseLabel: string;
  report: VerifyReport | null;
  localHits: LocalHit[];
  webExcerpts: WebExcerpt[];
}

export function useVerify() {
  const [state, setState] = useState<VerifyRunState>({
    running: false,
    phase: null,
    phaseLabel: "",
    report: null,
    localHits: [],
    webExcerpts: [],
  });

  const run = useCallback(
    async (text: string, fileName: string, opts: { useWeb: boolean; useQwen: boolean }, overrides?: VerifyOverrides) => {
      setState((s) => ({ ...s, running: true, phase: "empreinte", phaseLabel: "Initialisation…", report: null, localHits: [], webExcerpts: [] }));
      await new Promise((r) => window.setTimeout(r, 60));
      const report = await runVerification(
        text,
        { fileName, useWeb: opts.useWeb, useQwen: opts.useQwen },
        {
          onPhase: (phase, label) => setState((s) => ({ ...s, phase, phaseLabel: label })),
          onLocalHits: (hits) => setState((s) => ({ ...s, localHits: hits })),
          onWebExcerpts: (excerpts) => setState((s) => ({ ...s, webExcerpts: excerpts })),
        },
        overrides
      );
      setState((s) => ({ ...s, running: false, phase: "rapport", report }));
      return report;
    },
    []
  );

  return { state, run };
}

/* ---------- Vue du rapport (5 sections) — réutilisée par le scan de corpus ---------- */

export function VerifyReportView({ report }: { report: VerifyReport }) {
  const p = Math.round(report.ai.probabilite * 1000) / 10;
  const pColor = p >= 50 ? "#ff7a85" : p >= 25 ? "#ff9d5c" : p >= 5 ? "#e8bd55" : "#3ddc97";

  return (
    <div className="space-y-4">
      {/* 1. Score global & signature IA */}
      <section className="glass-soft rounded-xl p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold-400/15 font-mono text-[11px] font-bold text-gold-300">1</span>
          <h3 className="font-display text-[12.5px] font-semibold text-ink-100">Score global & signature IA</h3>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="glass-soft grid h-20 w-20 place-items-center rounded-full border border-gold-400/25">
            <p className="font-display text-[20px] font-bold leading-none" style={{ color: pColor }}>
              {p.toLocaleString("fr-FR")}
              <span className="text-[11px]">%</span>
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] leading-snug text-ink-400">{report.ai.signatureNote}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {report.ai.modeles.slice(0, 4).map((m) => (
                <span key={m.model} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-ink-300">
                  {m.model} · {m.share} %
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Bilan du plagiat conditionnel */}
      <section className="glass-soft rounded-xl p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold-400/15 font-mono text-[11px] font-bold text-gold-300">2</span>
          <h3 className="font-display text-[12.5px] font-semibold text-ink-100">Bilan du plagiat conditionnel</h3>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <div className="rounded-lg border border-white/[0.07] bg-night-900/50 p-3 text-center">
            <p className="font-display text-[18px] font-bold leading-none text-ink-100">{report.similarity.sentencesAnalyzed}</p>
            <p className="label-caps mt-1 text-ink-500">phrases</p>
          </div>
          <div className="rounded-lg border border-jade-400/25 bg-jade-400/[0.05] p-3 text-center">
            <p className="font-display text-[18px] font-bold leading-none text-jade-400">{report.similarity.citationsValides}</p>
            <p className="label-caps mt-1 text-ink-500">citations OK</p>
          </div>
          <div className={`rounded-lg border p-3 text-center ${report.similarity.plagiatsAveres > 0 ? "border-rose-400/30 bg-rose-400/[0.06]" : "border-white/[0.07] bg-night-900/50"}`}>
            <p className={`font-display text-[18px] font-bold leading-none ${report.similarity.plagiatsAveres > 0 ? "text-rose-400" : "text-ink-300"}`}>
              {report.similarity.plagiatsAveres}
            </p>
            <p className="label-caps mt-1 text-ink-500">plagiats avérés</p>
          </div>
        </div>
        {report.similarity.hits.length > 0 && (
          <ul className="mt-3 space-y-2">
            {report.similarity.hits.slice(0, 6).map((h, i) => (
              <li key={i} className={`rounded-lg border-l-2 p-3 ${h.isPlagiarism ? "border-l-rose-400 bg-rose-400/[0.05]" : "border-l-jade-400 bg-jade-400/[0.04]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Pill tone={h.isPlagiarism ? "bad" : "ok"}>
                    {h.isPlagiarism ? "Plagiat avéré — non sourcé" : "Citation légitime"}
                  </Pill>
                  <span className="font-mono text-[10px] text-ink-500">
                    similarité {Math.round(h.similarity * 100)} % · {SOURCE_KIND_LABEL[h.sourceKind]}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11.5px] italic leading-snug text-ink-400">« {h.sentence} »</p>
                <p className="mt-1 text-[10.5px] text-ink-500">
                  Source : {h.sourceLabel}
                  {h.evidence ? <> · ancrage : <span className="font-mono text-gold-300">{h.evidence}</span></> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
        {report.similarity.hits.length === 0 && (
          <p className="mt-3 text-[11.5px] text-ink-500">Aucune similarité significative avec les sources hybrides consultées.</p>
        )}
      </section>

      {/* 3. Audit des références & hallucinations */}
      <section className="glass-soft rounded-xl p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold-400/15 font-mono text-[11px] font-bold text-gold-300">3</span>
          <h3 className="font-display text-[12.5px] font-semibold text-ink-100">Audit des références & hallucinations</h3>
          <Pill tone={report.references.hallucinations > 0 ? "bad" : "ok"} className="ml-auto">
            {report.references.hallucinations} hallucination{report.references.hallucinations > 1 ? "s" : ""}
          </Pill>
        </div>
        <ul className="mt-3 space-y-1.5">
          {report.references.items.slice(0, 8).map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-night-900/40 px-3 py-2">
              <span className="font-mono text-[10px] uppercase text-ink-500">{r.kind}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-200" title={r.raw}>
                {r.raw}
              </span>
              <Pill tone={r.isHallucination ? "bad" : r.status === "verifiee" ? "ok" : "warn"}>
                {r.isHallucination ? "Hallucination" : r.status === "verifiee" ? "Vérifiée" : "Introuvable"}
              </Pill>
            </li>
          ))}
          {report.references.items.length === 0 && (
            <li className="text-[11.5px] text-ink-500">Aucune référence extraite du document.</li>
          )}
        </ul>
        {report.references.structural.anomalies.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-lg border border-ember-400/25 bg-ember-400/[0.05] p-3">
            <p className="label-caps text-ember-400">Anomalies de mise en forme</p>
            {report.references.structural.anomalies.map((a, i) => (
              <p key={i} className="flex items-start gap-2 text-[11.5px] leading-snug text-ink-300">
                <IconInfo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ember-400" /> {a}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* 4. Analyse méthodologique */}
      <section className="glass-soft rounded-xl p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold-400/15 font-mono text-[11px] font-bold text-gold-300">4</span>
          <h3 className="font-display text-[12.5px] font-semibold text-ink-100">Analyse méthodologique</h3>
          <Pill tone={report.methodology.mixingDetected ? "warn" : "ok"} className="ml-auto">
            {report.methodology.mixingDetected ? "Mélange détecté" : "Démarche cohérente"}
          </Pill>
        </div>
        <p className={`mt-2.5 text-[12px] leading-relaxed ${report.methodology.mixingDetected ? "text-ember-400" : "text-ink-300"}`}>
          {report.methodology.detail}
        </p>
        {report.methodology.flags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {report.methodology.flags.map((f) => (
              <span key={f.label} className="rounded-md border border-azure-400/25 bg-azure-400/[0.06] px-2 py-0.5 font-mono text-[10px] text-azure-300">
                {f.label}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 5. Sources hybrides consultées */}
      <section className="glass-soft rounded-xl p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold-400/15 font-mono text-[11px] font-bold text-gold-300">5</span>
          <h3 className="font-display text-[12.5px] font-semibold text-ink-100">Sources hybrides consultées</h3>
        </div>
        <ul className="mt-3 space-y-1.5">
          {report.sources.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-night-900/40 px-3 py-2">
              <Pill tone={s.kind === "institutionnelle" ? "gold" : "info"}>{s.kind === "institutionnelle" ? "Institutionnel" : "Web"}</Pill>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-300" title={s.label}>
                {s.label}
              </span>
              <span className="font-mono text-[10px] text-ink-500">
                {s.consulted} unité{s.consulted > 1 ? "s" : ""} · {s.matched ? "correspondance" : "aucun match"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[10.5px] leading-snug text-ink-500">
          {report.qwenUsed
            ? "Vérification croisée sémantique effectuée par le LLM AgweStream (contexte de référence injecté)."
            : "LLM AgweStream injoignable — vérification limitée aux moteurs lexicaux (base institutionnelle + web)."}
        </p>
      </section>
    </div>
  );
}

/* ---------- Stepper de phases ---------- */

function PhaseStepper({ current, label, localCount, webCount }: { current: VerifyPhase | null; label: string; localCount: number; webCount: number }) {
  const order: VerifyPhase[] = ["empreinte", "refs", "similarites", "qwen", "methodologie"];
  const idx = current ? order.indexOf(current) : -1;
  return (
    <div className="flex flex-1 flex-col rounded-xl border border-gold-400/20 bg-night-900/50 p-5">
      <p className="label-caps text-ink-500">Moteur hybride en cours</p>
      <p className="mt-2 font-mono text-[12px] text-gold-300">{label}</p>
      <ul className="mt-5 space-y-3">
        {PHASES.map((ph, i) => {
          const done = idx > i || current === "rapport";
          const active = idx === i;
          return (
            <li key={ph.key} className="flex items-center gap-3">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-[10.5px] font-bold transition-all duration-500 ${
                done ? "border-jade-400/50 bg-jade-400/15 text-jade-400" : active ? "border-gold-400/70 bg-gold-400/15 text-gold-300 shadow-[0_0_14px_-2px_rgba(232,189,85,0.7)]" : "border-white/10 text-ink-500"
              }`}>
                {done ? <IconCheck className="h-3.5 w-3.5" /> : active ? <span className="live-dot h-2 w-2 rounded-full bg-gold-400" /> : i + 1}
              </span>
              <span className={`text-[12.5px] font-medium ${active ? "text-gold-300" : done ? "text-ink-300" : "text-ink-500"}`}>{ph.label}</span>
              {ph.key === "similarites" && (localCount + webCount > 0) && (
                <span className="ml-auto font-mono text-[10px] text-ink-500">{localCount} base · {webCount} web</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-6">
        <div className="h-1.5 overflow-hidden rounded-full bg-night-700">
          <div className="bar-slide h-full w-[38%] rounded-full bg-gradient-to-r from-transparent via-gold-400 to-transparent" />
        </div>
      </div>
      <p className="mt-auto pt-5 font-mono text-[10px] leading-relaxed text-ink-500">
        Base institutionnelle : {fmtInt(LOCAL_CORPUS_STATS.docs)} documents · {LOCAL_CORPUS_STATS.volume}
        <br />
        CrossRef + Wikipédia + LLM AgweStream (timeout 8 s)
      </p>
    </div>
  );
}

/* ══════════════════════ PAGE /references ══════════════════════ */

export default function VerifyPage() {
  const { toast } = useAnalysis();
  const { state, run } = useVerify();
  const [text, setText] = useState("");
  const [useWeb, setUseWeb] = useState(true);
  const [useQwen, setUseQwen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);

  const launch = useCallback(async () => {
    if (words < 40 || state.running) return;
    await run(text, "Document_analyse.txt", { useWeb, useQwen });
    toast("Vérification terminée", "Rapport hybride généré — plagiat conditionnel, hallucinations et méthodologie.");
  }, [text, words, useWeb, useQwen, state.running, run, toast]);

  const loadFile = async (file: File) => {
    try {
      const { extractTextFromFile } = await import("../lib/detector/textExtractor");
      const extracted = await extractTextFromFile(file);
      if (!extracted.trim()) {
        toast("Fichier vide", "Aucun texte extrait de ce document.");
        return;
      }
      setText(extracted.slice(0, 20000));
    } catch {
      toast("Extraction impossible", "Ce document n'a pas pu être lu (format corrompu ou protégé).");
    }
  };

  return (
    <>
      <PageHead
        kicker="Plagiat conditionnel · hallucinations · cohérence méthodologique"
        title="Vérification intelligente"
        actions={
          state.report ? (
            <button onClick={() => exportVerifyReportPdf(state.report!)} className="btn-gold px-4 py-2 text-[12.5px]">
              <IconDownload className="h-4 w-4" /> Exporter le rapport PDF
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Source */}
        <Reveal>
          <section className="glass flex h-full flex-col rounded-2xl p-5">
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[13px] font-semibold tracking-wide text-ink-100">Document à vérifier</h2>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    setText(SAMPLE_VERIFY);
                  }}
                  className="rounded-md border border-gold-400/30 bg-gold-400/[0.08] px-2 py-1 font-mono text-[10px] text-gold-300 transition-colors hover:bg-gold-400/15"
                >
                  Exemple complet (citations + pièges)
                </button>
                <button onClick={() => fileRef.current?.click()} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-ink-300 transition-colors hover:border-gold-400/40 hover:text-gold-300">
                  Importer PDF / TXT
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.md,.rtf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void loadFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={state.running}
              placeholder="Collez le texte du mémoire, de l'article ou de la copie à vérifier (minimum 40 mots)…"
              className="h-64 w-full flex-1 resize-none rounded-xl border border-white/10 bg-night-900/60 p-3.5 text-[12.5px] leading-relaxed text-ink-200 outline-none transition-colors duration-300 placeholder:text-ink-500 focus:border-gold-400/50 disabled:opacity-60"
            />

            <div className="mt-3 space-y-2 rounded-xl border border-white/[0.07] bg-night-900/40 p-3.5">
              <Toggle on={useWeb} onChange={setUseWeb} label="Interroger le web open-source" hint="Extraits Wikipédia + vérification CrossRef des références" disabled={state.running} />
              <Toggle on={useQwen} onChange={setUseQwen} label="Vérification croisée sémantique (LLM)" hint="AgweStream compare les segments au contexte de référence — repli lexical automatique si injoignable" disabled={state.running} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className={`font-mono text-[11px] ${words === 0 ? "text-ink-500" : words < 40 ? "text-ember-400" : "text-jade-400"}`}>
                {fmtInt(words)} mots {words > 0 && words < 40 && "· min. 40"}
              </span>
              <button onClick={() => void launch()} disabled={words < 40 || state.running} className="btn-gold px-5 py-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-40">
                <IconShield className="h-4 w-4" /> {state.running ? "Vérification…" : "Lancer la vérification hybride"}
              </button>
            </div>

            <p className="mt-3 border-t border-white/[0.06] pt-3 text-[10.5px] leading-relaxed text-ink-500">
              <IconFlag className="mr-1 inline h-3 w-3 text-gold-400" />
              Règle métier : un passage similaire à une source n'est un <span className="font-semibold text-rose-400">plagiat avéré</span> que sans
              référence valide (intra-texte, note ou bibliographie). S'il est sourcé, c'est une{" "}
              <span className="font-semibold text-jade-400">citation légitime</span>.
            </p>
          </section>
        </Reveal>

        {/* Résultats */}
        <Reveal delay={120}>
          <section className="flex h-full flex-col gap-4">
            {state.running ? (
              <PhaseStepper current={state.phase} label={state.phaseLabel} localCount={state.localHits.length} webCount={state.webExcerpts.length} />
            ) : state.report ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[11px] text-ink-500">
                    {state.report.fileName} · {fmtInt(state.report.words)} mots · généré le {state.report.generatedAt}
                  </p>
                  <div className="flex gap-1.5">
                    <Pill tone={state.report.similarity.plagiatsAveres > 0 ? "bad" : "ok"}>
                      {state.report.similarity.plagiatsAveres} plagiat{state.report.similarity.plagiatsAveres > 1 ? "s" : ""} avéré{state.report.similarity.plagiatsAveres > 1 ? "s" : ""}
                    </Pill>
                    <Pill tone={state.report.references.hallucinations > 0 ? "bad" : "ok"}>
                      {state.report.references.hallucinations} hallucination{state.report.references.hallucinations > 1 ? "s" : ""}
                    </Pill>
                  </div>
                </div>
                <VerifyReportView report={state.report} />
              </>
            ) : (
              <div className="glass grid flex-1 place-items-center rounded-2xl border-dashed px-6 py-16 text-center">
                <div>
                  <IconSearch className="floaty mx-auto h-11 w-11 text-gold-400/70" />
                  <p className="mt-4 font-display text-[15px] font-bold text-ink-100">Le rapport hybride s'affichera ici</p>
                  <p className="mx-auto mt-2 max-w-[360px] text-[12.5px] leading-relaxed text-ink-400">
                    Cinq sections structurées : score & signature IA, bilan du plagiat conditionnel, audit des
                    hallucinations bibliographiques, analyse méthodologique et traçabilité des sources.
                  </p>
                  <p className="mt-4 inline-flex items-center gap-2 rounded-lg border border-azure-400/25 bg-azure-400/[0.06] px-3 py-1.5 font-mono text-[10.5px] text-azure-300">
                    <IconRefresh className="h-3.5 w-3.5" /> Base institutionnelle · Wikipédia · CrossRef · AgweStream
                  </p>
                </div>
              </div>
            )}
          </section>
        </Reveal>
      </div>

      <div className="mt-5">
        <p className="text-center font-mono text-[10px] text-ink-500">
          <IconScale className="mr-1 inline h-3 w-3" /> Les verdicts « hallucination » et « plagiat avéré » sont des présomptions techniques — toute sanction
          académique exige une revue humaine contradictoire.
        </p>
      </div>
    </>
  );
}
