import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IconDownload, IconEye, IconFile, IconHistory, IconLock, IconReport, IconSearch } from "../components/icons";
import { archiveEntries, fmtInt, seedReports, type RecentEntry } from "../data";
import { exportAnalysisReportPdf } from "../lib/verify/reportPdfs";
import { useAnalysis } from "../state/AnalysisContext";
import { PageHead, Pill, Reveal, type Tone } from "../ui";

const aiTone = (v: number): Tone => (v < 25 ? "ok" : v < 50 ? "warn" : "bad");

const kindDot: Record<RecentEntry["kind"], string> = {
  pdf: "bg-rose-400",
  docx: "bg-azure-400",
  txt: "bg-ink-400",
};

/* ================= HISTORIQUE — journal chronologique + recherche ================= */

export function HistoryPage() {
  const { entries, openReport } = useAnalysis();
  const [query, setQuery] = useState("");

  const all = useMemo(() => [...entries, ...archiveEntries.filter((a) => !entries.some((e) => e.id === a.id))], [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((e) => e.name.toLowerCase().includes(q) || e.date.toLowerCase().includes(q));
  }, [all, query]);

  const groups = useMemo(() => {
    const map = new Map<string, RecentEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <>
      <PageHead
        kicker="Journal chronologique des documents scannés"
        title="Historique"
        actions={
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher par nom, date…"
              className="w-64 rounded-lg border border-white/10 bg-night-900/60 py-2 pl-9 pr-3.5 text-[12.5px] text-ink-200 outline-none transition-colors placeholder:text-ink-500 focus:border-gold-400/50"
            />
          </div>
        }
      />

      <p className="mb-5 font-mono text-[11px] text-ink-500">
        {fmtInt(filtered.length)} document{filtered.length > 1 ? "s" : ""} · {groups.length} journée{groups.length > 1 ? "s" : ""}
        {query && <> · filtre « {query} »</>}
      </p>

      {groups.length === 0 && (
        <Reveal>
          <div className="glass grid place-items-center rounded-2xl border-dashed px-6 py-16 text-center">
            <IconHistory className="h-10 w-10 text-ink-500" />
            <p className="mt-3 text-[13px] text-ink-400">Aucun document ne correspond à « {query} ».</p>
          </div>
        </Reveal>
      )}

      <div className="space-y-6">
        {groups.map(([date, list], gi) => (
          <Reveal key={date} delay={gi * 60}>
            <section>
              <div className="mb-3 flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-gold-400/25 bg-gold-400/10 text-gold-300">
                  <IconHistory className="h-4 w-4" />
                </span>
                <h2 className="font-display text-[13px] font-semibold tracking-wide text-ink-100">{date}</h2>
                <span className="h-px flex-1 bg-gradient-to-r from-gold-400/30 to-transparent" />
              </div>
              <div className="relative ml-4 space-y-2.5 border-l border-white/10 pl-6">
                {list.map((e) => (
                  <article key={e.id} className="glass-soft card-hover relative rounded-xl p-4">
                    <span className={`absolute -left-[31px] top-5 h-2.5 w-2.5 rounded-full ${kindDot[e.kind]} shadow-[0_0_10px_rgba(232,189,85,0.35)]`} />
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink-100" title={e.name}>
                          {e.name}
                          {e.fresh && <span className="ml-2 rounded bg-gold-400/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-gold-300">SESSION</span>}
                        </p>
                        <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">
                          {e.time} · {e.pages} page{e.pages > 1 ? "s" : ""}
                          {e.mots !== undefined && <> · {fmtInt(e.mots)} mots</>}
                          {e.sizeKo !== undefined && <> · {fmtInt(e.sizeKo)} Ko</>}
                        </p>
                      </div>
                      <Pill tone={aiTone(e.ai)}>IA {e.ai} %</Pill>
                      <Pill tone={e.plagiat < 8 ? "ok" : "warn"}>Plagiat {e.plagiat} %</Pill>
                      <button onClick={() => openReport(e)} className="btn-ghost px-3 py-1.5 text-[11.5px]">
                        <IconEye className="h-3.5 w-3.5" /> Rapport
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </Reveal>
        ))}
      </div>
    </>
  );
}

/* ================= RAPPORTS — centre de téléchargement ================= */

export function ReportsPage() {
  const { reports, reportsCount, results, openReport, toast } = useAnalysis();
  const [filter, setFilter] = useState("");

  const all = useMemo(() => [...reports, ...seedReports], [reports]);
  const filtered = all.filter((r) => r.entry.name.toLowerCase().includes(filter.toLowerCase()));

  const download = (entry: RecentEntry) => {
    exportAnalysisReportPdf(entry, entry.name === results?.fileName && results ? results : { fileName: entry.name, ia: entry.ai, plagiat: entry.plagiat, refs: 6, human: Math.max(0, 100 - entry.ai - entry.plagiat - 6), refsTotal: 18, refsDouteuses: 3, passages: 2, summary: "Rapport généré depuis le centre de téléchargement.", origins: [] });
    toast("Téléchargement lancé", `Oligens_Rapport_${entry.name.replace(/\.\w+$/, "").slice(0, 24)}.pdf — signé et horodaté.`);
  };

  return (
    <>
      <PageHead
        kicker="Centre de téléchargement & d'archivage"
        title="Rapports certifiés"
        actions={
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-gold-400/30 bg-gold-400/10 px-3 py-1.5 font-mono text-[12px] font-bold text-gold-300">
              {reportsCount} rapports
            </span>
            <Link to="/scan/new" className="btn-gold px-4 py-2 text-[12.5px]">
              + Nouvelle analyse
            </Link>
          </div>
        }
      />

      <Reveal>
        <div className="glass mb-5 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-4">
            <IconLock className="h-8 w-8 shrink-0 text-jade-400" />
            <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-300">
              Chaque rapport PDF est <span className="font-semibold text-ink-100">signé SHA-256</span> et{" "}
              <span className="font-semibold text-ink-100">horodaté eIDAS</span> : score d'origine IA par modèle, bilan du
              plagiat conditionnel, audit des hallucinations et recommandations méthodologiques. Conservation : 90 jours
              glissants (configurable dans Paramètres).
            </p>
            <div className="flex gap-1.5">
              {["PDF", "JSON", "CSV"].map((f) => (
                <span key={f} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-ink-300">{f}</span>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <section className="glass rounded-2xl p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrer par nom de document…"
                className="w-full max-w-xs rounded-lg border border-white/10 bg-night-900/60 py-2 pl-9 pr-3.5 text-[12.5px] text-ink-200 outline-none transition-colors placeholder:text-ink-500 focus:border-gold-400/50"
              />
            </div>
            <span className="ml-auto font-mono text-[11px] text-ink-500">
              {filtered.length} / {all.length} rapports
            </span>
          </div>

          <ul className="divide-y divide-white/[0.05]">
            {filtered.map((r) => (
              <li key={r.id} className="group flex items-center gap-3.5 rounded-lg px-2 py-3.5 transition-colors duration-300 hover:bg-white/[0.035]">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-gold-400/25 bg-gold-400/[0.08] text-gold-300">
                  <IconReport className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink-100" title={r.entry.name}>
                    Rapport_{r.entry.name.replace(/\.\w+$/, "")}.pdf
                  </p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">
                    {r.createdAt} · {r.entry.pages} p. analysées · IA {r.entry.ai} % · hash <span className="text-jade-400">{r.hash}</span>
                  </p>
                </div>
                <Pill tone="ok">Certifié</Pill>
                <button onClick={() => openReport(r.entry)} className="btn-ghost shrink-0 px-3 py-1.5 text-[11.5px]">
                  <IconEye className="h-3.5 w-3.5" /> Aperçu
                </button>
                <button
                  onClick={() => download(r.entry)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-jade-400/30 text-jade-400 transition-colors hover:bg-jade-400/10"
                  aria-label="Télécharger le rapport PDF"
                >
                  <IconDownload className="h-4 w-4" />
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="flex flex-col items-center gap-2 py-12 text-center">
                <IconFile className="h-8 w-8 text-ink-500" />
                <p className="text-[13px] text-ink-500">Aucun rapport ne correspond à « {filter} ».</p>
              </li>
            )}
          </ul>
        </section>
      </Reveal>
    </>
  );
}
