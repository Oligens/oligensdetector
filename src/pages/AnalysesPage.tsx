import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconArrow, IconChevron, IconEye, IconWand } from "../components/icons";
import { archiveEntries, fmtInt, type RecentEntry } from "../data";
import { useAnalysis } from "../state/AnalysisContext";
import { Kpi, MeterBar, PageHead, Pill, Reveal, type Tone } from "../ui";

const PAGE_SIZE = 8;

const aiTone = (v: number): Tone => (v < 25 ? "ok" : v < 50 ? "warn" : "bad");
const plagTone = (v: number): Tone => (v < 8 ? "ok" : v < 15 ? "warn" : "bad");

const kindBadge: Record<RecentEntry["kind"], { label: string; cls: string }> = {
  pdf: { label: "PDF", cls: "border-rose-400/35 bg-rose-400/10 text-rose-400" },
  docx: { label: "DOC", cls: "border-azure-400/35 bg-azure-400/10 text-azure-300" },
  txt: { label: "TXT", cls: "border-ink-400/30 bg-white/5 text-ink-300" },
};

type TypeFilter = "tous" | "pdf" | "docx" | "txt";
type RiskFilter = "tous" | "faible" | "modere" | "eleve";
type SortKey = "date" | "ia-desc" | "ia-asc" | "plagiat-desc";

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-all duration-300 ${
        active
          ? "border-gold-400/60 bg-gold-400/15 text-gold-300 shadow-[0_0_18px_-6px_rgba(213,166,60,0.6)]"
          : "border-white/10 text-ink-400 hover:border-white/25 hover:text-ink-200"
      }`}
    >
      {children}
    </button>
  );
}

export default function AnalysesPage() {
  const { analysesCount, reportsCount, results, lastScan, entries, openReport, addReportFromEntry, toast } = useAnalysis();
  const navigate = useNavigate();
  const [type, setType] = useState<TypeFilter>("tous");
  const [risk, setRisk] = useState<RiskFilter>("tous");
  const [sort, setSort] = useState<SortKey>("date");
  const [page, setPage] = useState(1);

  const all = useMemo(() => [...entries, ...archiveEntries.filter((a) => !entries.some((e) => e.id === a.id))], [entries]);

  const filtered = useMemo(() => {
    const list = all.filter((e) => {
      if (type !== "tous" && e.kind !== type) return false;
      if (risk === "faible" && e.ai >= 25) return false;
      if (risk === "modere" && (e.ai < 25 || e.ai >= 50)) return false;
      if (risk === "eleve" && e.ai < 50) return false;
      return true;
    });
    const sorted = [...list];
    if (sort === "ia-desc") sorted.sort((a, b) => b.ai - a.ai);
    else if (sort === "ia-asc") sorted.sort((a, b) => a.ai - b.ai);
    else if (sort === "plagiat-desc") sorted.sort((a, b) => b.plagiat - a.plagiat);
    // « date » : l'ordre d'insertion est déjà chronologique inverse
    return sorted;
  }, [all, type, risk, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const display = lastScan?.result ?? results;

  const changeFilter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <PageHead
        kicker="Vue détaillée des analyses"
        title="Analyses"
        actions={
          <Link to="/scan/new" className="btn-gold px-4 py-2 text-[12.5px]">
            + Lancer un scan
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Analyses effectuées" value={fmtInt(analysesCount)} accent sub="depuis septembre 2025" />
        <Kpi label="Rapports certifiés" value={String(reportsCount)} sub="signés SHA-256 · eIDAS" />
        <Kpi label="Précision moteur" value="96,4" unit="%" sub="étalonnage corpus mixte" />
        <Kpi label="Temps moyen" value="1,24" unit="s" sub="8 450 mots / seconde" />
      </div>

      {display && (
        <Reveal>
          <section className="glass card-hover mt-5 rounded-2xl p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-[13px] font-semibold tracking-wide text-ink-100">
                Dernière analyse · <span className="text-gold-300">{display.fileName}</span>
              </h2>
              {lastScan && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => navigate("/humanizer")} className="btn-ghost px-3 py-1.5 text-[12px]">
                    <IconWand className="h-3.5 w-3.5" /> Envoyer à l'Humaniseur
                  </button>
                  <button
                    onClick={() => {
                      addReportFromEntry(lastScan.entry);
                      toast("Rapport généré", "Compteur incrémenté — rapport visible dans le centre de rapports.");
                      navigate("/reports");
                    }}
                    className="btn-gold px-3 py-1.5 text-[12px]"
                  >
                    Générer le rapport
                  </button>
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto]">
              <div className="glass-soft grid place-items-center rounded-xl px-7 py-4">
                <p className="font-display text-[38px] font-bold leading-none text-gold-300 gold-text-glow">
                  {display.ia}
                  <span className="text-lg">%</span>
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-ink-400">risque IA</p>
              </div>
              <div className="space-y-2">
                {[
                  { label: "IA Générative", v: display.ia, c: "#e8bd55" },
                  { label: "Plagiat", v: display.plagiat, c: "#ff7a85" },
                  { label: "Références douteuses", v: display.refs, c: "#ff9d5c" },
                  { label: "Contenu humanisé", v: display.human, c: "#5b8def" },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="mb-0.5 flex justify-between text-[11px]">
                      <span className="text-ink-300">{r.label}</span>
                      <span className="font-mono text-ink-100">{r.v} %</span>
                    </div>
                    <MeterBar value={r.v} height={4} color={`linear-gradient(90deg, ${r.c}88, ${r.c})`} />
                  </div>
                ))}
              </div>
              <div className="lg:max-w-[240px]">
                <p className="label-caps mb-2 text-ink-500">Facteurs dominants</p>
                <div className="space-y-1.5">
                  {(display.topFactors ?? []).slice(0, 3).map((f) => (
                    <p key={f.nom} className="truncate text-[11.5px] text-ink-300">
                      <span className={`font-mono font-semibold ${f.z_score >= 0 ? "text-gold-300" : "text-azure-300"}`}>
                        {f.z_score >= 0 ? "+" : "−"}{Math.abs(f.z_score).toFixed(2)}
                      </span>{" "}
                      {f.nom}
                    </p>
                  ))}
                </div>
                {display.signatureNote && <p className="mt-2 text-[10.5px] leading-snug text-ink-500">{display.signatureNote}</p>}
              </div>
            </div>
          </section>
        </Reveal>
      )}

      <Reveal delay={100}>
        <section className="glass mt-5 rounded-2xl p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="label-caps mr-1 text-ink-500">Type</span>
            {(["tous", "pdf", "docx", "txt"] as TypeFilter[]).map((t) => (
              <FilterChip key={t} active={type === t} onClick={() => changeFilter(() => setType(t))}>
                {t === "tous" ? "Tous" : t.toUpperCase()}
              </FilterChip>
            ))}
            <span className="label-caps mx-1 text-ink-500">Risque IA</span>
            {(["tous", "faible", "modere", "eleve"] as RiskFilter[]).map((r) => (
              <FilterChip key={r} active={risk === r} onClick={() => changeFilter(() => setRisk(r))}>
                {r === "tous" ? "Tous" : r === "faible" ? "Faible" : r === "modere" ? "Modéré" : "Élevé"}
              </FilterChip>
            ))}
            <span className="ml-auto font-mono text-[11px] text-ink-500">
              {fmtInt(filtered.length)} résultat{filtered.length > 1 ? "s" : ""}
            </span>
          </div>

          {/* Tri */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="label-caps mr-1 text-ink-500">Trier par</span>
            {(
              [
                { key: "date", label: "Date ↓" },
                { key: "ia-desc", label: "Score IA ↓" },
                { key: "ia-asc", label: "Score IA ↑" },
                { key: "plagiat-desc", label: "Plagiat ↓" },
              ] as Array<{ key: SortKey; label: string }>
            ).map((s) => (
              <FilterChip key={s.key} active={sort === s.key} onClick={() => changeFilter(() => setSort(s.key))}>
                {s.label}
              </FilterChip>
            ))}
          </div>

          <ul className="divide-y divide-white/[0.05]">
            {pageItems.map((e) => {
              const badge = kindBadge[e.kind];
              return (
                <li key={e.id} className="group flex items-center gap-3.5 rounded-lg px-2 py-3 transition-colors duration-300 hover:bg-white/[0.035]">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border font-mono text-[9.5px] font-bold ${badge.cls}`}>{badge.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink-100" title={e.name}>
                      {e.name}
                      {e.fresh && <span className="ml-2 rounded bg-gold-400/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-gold-300">SESSION</span>}
                    </p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">
                      {e.date} · {e.time} · {e.pages} p.
                      {e.mots !== undefined && <> · {fmtInt(e.mots)} mots</>}
                    </p>
                  </div>
                  <div className="hidden flex-col items-end gap-1 sm:flex">
                    <Pill tone={aiTone(e.ai)}>IA {e.ai} %</Pill>
                    <Pill tone={plagTone(e.plagiat)}>Plagiat {e.plagiat} %</Pill>
                  </div>
                  <button onClick={() => openReport(e)} className="btn-ghost shrink-0 px-3 py-1.5 text-[11.5px]">
                    <IconEye className="h-3.5 w-3.5" /> Rapport
                  </button>
                </li>
              );
            })}
            {pageItems.length === 0 && (
              <li className="py-10 text-center text-[13px] text-ink-500">Aucun document ne correspond à ces filtres.</li>
            )}
          </ul>

          {/* Pagination */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="btn-ghost px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <IconChevron className="h-3.5 w-3.5 rotate-90" /> Précédent
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`grid h-8 w-8 place-items-center rounded-lg border font-mono text-[11px] font-semibold transition-all duration-300 ${
                    n === safePage
                      ? "border-gold-400/60 bg-gold-400/15 text-gold-300 shadow-[0_0_14px_-4px_rgba(232,189,85,0.7)]"
                      : "border-white/10 text-ink-400 hover:border-white/25 hover:text-ink-200"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="btn-ghost px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-35"
            >
              Suivant <IconChevron className="h-3.5 w-3.5 -rotate-90" />
            </button>
          </div>

          <div className="mt-3">
            <Link to="/history" className="group inline-flex items-center gap-1.5 text-[12px] font-semibold text-gold-400 transition-colors hover:text-gold-200">
              Journal chronologique complet
              <IconArrow className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        </section>
      </Reveal>
    </>
  );
}
