import { useEffect, useState, type ReactNode } from "react";
import type { GlobalResults, RecentEntry } from "../data";
import { fmtInt, statusOf } from "../data";
import { MeterBar, Pill, prefersReducedMotion, Reveal, SectionTitle, Sparkline, useCountUp, type Tone } from "../ui";
import { IconArrow, IconChart, IconEye, IconFile, IconHistory, IconInfo, IconReport, IconScan, IconWand } from "./icons";

/* ---------- Donut animé ---------- */

interface Segment {
  key: string;
  label: string;
  color: string;
  value: number;
}

function Donut({ segments, center }: { segments: Segment[]; center: number }) {
  const [mounted, setMounted] = useState(prefersReducedMotion());
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const r = 62;
  const C = 2 * Math.PI * r;
  const gap = 4;
  let acc = 0;
  const animated = useCountUp(center, 1300);
  return (
    <div className="relative h-[188px] w-[188px] shrink-0">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(28,47,85,0.55)" strokeWidth="15" />
        {segments.map((s) => {
          const len = (s.value / 100) * C;
          const drawn = mounted ? Math.max(len - gap, 0.001) : 0.001;
          const offset = acc;
          acc += len;
          return (
            <circle
              key={s.key}
              cx="80" cy="80" r={r} fill="none" stroke={s.color} strokeWidth="15" strokeLinecap="round"
              className="donut-seg" strokeDasharray={`${drawn} ${C - drawn}`} strokeDashoffset={-offset}
              style={{ filter: `drop-shadow(0 0 6px ${s.color}55)` }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="font-display text-[34px] font-bold leading-none text-gold-300 gold-text-glow">
            {animated}
            <span className="text-lg">%</span>
          </p>
          <p className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-400">de risque IA</p>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-ink-300">{children}</span>;
}

const riskTone = (v: number) =>
  v < 25 ? { label: "Profil humain", tone: "ok" as const } : v < 50 ? { label: "Vigilance requise", tone: "warn" as const } : { label: "Risque élevé", tone: "bad" as const };

/* ---------- Résultat global ---------- */

export function GlobalResult({ results }: { results: GlobalResults }) {
  const verdict = riskTone(results.ia);
  const segments: Segment[] = [
    { key: "ia", label: "IA Générative", color: "#e8bd55", value: results.ia },
    { key: "plagiat", label: "Plagiat", color: "#ff7a85", value: results.plagiat },
    { key: "refs", label: "Références douteuses", color: "#ff9d5c", value: results.refs },
    { key: "human", label: "Contenu humanisé", color: "#5b8def", value: results.human },
  ];

  return (
    <Reveal>
      <section className="glass card-hover relative overflow-hidden rounded-2xl p-5">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gold-500/[0.07] blur-3xl" />
        <SectionTitle
          icon={<IconChart className="h-4 w-4" />}
          title="Résultat Global"
          right={<span className="max-w-[46%] truncate rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10.5px] text-ink-300" title={results.fileName}>{results.fileName}</span>}
        />
        {results.engine && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <Chip>IA_DETECT v2.1 · Voie 3</Chip>
            <Chip>{results.engine.mode === "worker" ? "Web Worker dédié" : "Exécution directe"} · {fmtInt(results.engine.durationMs)} ms</Chip>
            <Chip>{fmtInt(results.engine.words)} mots</Chip>
            {results.language && <Chip>langue : {results.language}</Chip>}
            {results.confidence && (
              <Pill tone={results.confidence === "Élevée" ? "ok" : results.confidence === "Moyenne" ? "warn" : "bad"}>
                confiance {results.confidence.toLowerCase()}
              </Pill>
            )}
            {results.confidenceInterval && <Chip>IC 95 % : {results.confidenceInterval[0]} – {results.confidenceInterval[1]} %</Chip>}
          </div>
        )}
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <Donut segments={segments} center={results.ia} />
          <div className="w-full flex-1 space-y-2.5">
            {segments.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}66` }} />
                <span className="flex-1 text-[12.5px] font-medium text-ink-300">{s.label}</span>
                <span className="font-mono text-[12.5px] font-semibold text-ink-100">{s.value} %</span>
              </div>
            ))}
            <div className="pt-1.5">
              <Pill tone={verdict.tone}>{verdict.label}</Pill>
            </div>
          </div>
        </div>
        <div className="mt-5 flex gap-3 rounded-xl border border-gold-400/15 bg-gold-400/[0.05] p-3.5">
          <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
          <p className="text-[12.5px] leading-relaxed text-ink-300">
            {results.decision && <span className="font-semibold text-gold-300">{results.decision} </span>}
            {results.summary}
          </p>
        </div>
      </section>
    </Reveal>
  );
}

/* ---------- Origine de l'IA ---------- */

export function OriginCard({ results }: { results: GlobalResults }) {
  return (
    <Reveal delay={100}>
      <section className="glass card-hover rounded-2xl p-5">
        <SectionTitle icon={<IconInfo className="h-4 w-4" />} title="Origine de l'IA Détectée" right={<span className="font-mono text-[10px] text-ink-500">top 5 modèles</span>} />
        <div className="space-y-3.5">
          {results.origins.map((o, i) => (
            <div key={o.model}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-ink-200">
                  {o.model}
                  <span className="ml-2 text-[10.5px] font-normal text-ink-500">{o.vendor}</span>
                </p>
                <span className="font-mono text-[12px] font-semibold text-gold-300">{o.share} %</span>
              </div>
              <MeterBar
                value={o.share}
                height={i === 0 ? 7 : 5}
                color={i === 0 ? "linear-gradient(90deg,#b08427,#e8bd55,#f8e3a4)" : "linear-gradient(90deg,#2b4fa6,#5b8def)"}
              />
            </div>
          ))}
        </div>
        {results.signatureNote && <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11.5px] font-medium leading-snug text-gold-400/90">{results.signatureNote}</p>}
        <p className="mt-2 text-[11px] leading-snug text-ink-500">
          Répartition conditionnelle, calculée sur les segments classés IA (<span className="font-mono text-gold-400">{results.ia} %</span> du document).
        </p>
        {results.topFactors && results.topFactors.length > 0 && (
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <p className="label-caps mb-3 text-ink-400">Facteurs explicatifs · top 5 Z-Scores</p>
            <div className="space-y-2.5">
              {results.topFactors.map((f) => {
                const positive = f.z_score >= 0;
                return (
                  <div key={f.nom}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11.5px] text-ink-300">{f.nom}</span>
                      <span className={`font-mono text-[11px] font-semibold ${positive ? "text-gold-300" : "text-azure-300"}`}>
                        z {positive ? "+" : "−"}{Math.abs(f.z_score).toFixed(2)}
                      </span>
                    </div>
                    <MeterBar
                      value={Math.min(100, (Math.abs(f.z_score) / 4) * 100)}
                      height={4}
                      color={positive ? "linear-gradient(90deg,#8a651d,#e8bd55,#f2d37f)" : "linear-gradient(90deg,#2b4fa6,#5b8def,#8fb0f5)"}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </Reveal>
  );
}

/* ---------- Fiches d'analyse ---------- */

const fmtDelta = (current: number, prev: number, invert = false) => {
  const d = current - prev;
  return {
    label: `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} pts`,
    good: invert ? d >= 0 : d <= 0,
  };
};

export function AnalysisGrid({ results }: { results: GlobalResults }) {
  const m = results.metrics;
  const iaTone: Tone = results.ia < 25 ? "ok" : results.ia < 50 ? "warn" : "bad";
  const plagTone: Tone = results.plagiat < 8 ? "ok" : results.plagiat < 15 ? "warn" : "bad";
  const refTone: Tone = results.refsTotal === 0 ? "info" : results.refsDouteuses <= 2 ? "ok" : results.refsDouteuses <= 4 ? "warn" : "bad";

  const iaTrend = [26, 24, 27, 22, 20, 23, results.ia + 4, results.ia];
  const plagTrend = [4, 6, 5, 7, 6, 8, results.plagiat + 2, results.plagiat];
  const refTrend = [6, 5, 5, 4, 4, 3, results.refsDouteuses + 1, results.refsDouteuses];
  const humTrend = [70, 72, 71, 74, 76, 75, 78, results.human];

  const dIa = fmtDelta(results.ia, iaTrend[iaTrend.length - 2]);
  const dPlag = fmtDelta(results.plagiat, plagTrend[plagTrend.length - 2]);
  const dRef = fmtDelta(results.refsDouteuses, refTrend[refTrend.length - 2]);
  const dHum = fmtDelta(results.human, humTrend[humTrend.length - 2], true);

  const cards = [
    {
      id: "ia", icon: <IconScan className="h-[18px] w-[18px]" />, title: "Détection IA", desc: "Régression logistique · 18 features",
      metric: String(results.ia), unit: "%",
      sub: m ? `précision ±${m.precision.toLocaleString("fr-FR")} pts · confiance ${(results.confidence ?? "—").toLowerCase()}` : "probabilité d'origine IA",
      tone: iaTone, pill: iaTone === "ok" ? "Faible" : iaTone === "warn" ? "Modéré" : "Élevé",
      delta: dIa.label, deltaGood: dIa.good, trend: iaTrend, color: "#e8bd55",
    },
    {
      id: "plagiat", icon: <IconFile className="h-[18px] w-[18px]" />, title: "Plagiat", desc: "Duplication interne & n-grammes",
      metric: String(results.plagiat), unit: "%",
      sub: m ? `originalité n-grammes ${Math.round(m.originalite * 100)} % · entropie ${m.charEntropy.toLocaleString("fr-FR")}` : `${results.passages} passage${results.passages > 1 ? "s" : ""} signalé${results.passages > 1 ? "s" : ""}`,
      tone: plagTone, pill: plagTone === "ok" ? "Mineur" : plagTone === "warn" ? "Modéré" : "Sévère",
      delta: dPlag.label, deltaGood: dPlag.good, trend: plagTrend, color: "#ff7a85",
    },
    {
      id: "refs", icon: <IconReport className="h-[18px] w-[18px]" />, title: "Références", desc: "Audit citations, DOI & URL",
      metric: results.refsTotal > 0 ? `${results.refsDouteuses}/${results.refsTotal}` : "0",
      sub: results.refsTotal > 0
        ? `${results.refsTotal - results.refsDouteuses} source${results.refsTotal - results.refsDouteuses > 1 ? "s" : ""} vérifiée${results.refsTotal - results.refsDouteuses > 1 ? "s" : ""}`
        : "aucune citation détectée",
      tone: refTone,
      pill: results.refsTotal === 0 ? "Aucune réf." : `Fiabilité ${Math.round(((results.refsTotal - results.refsDouteuses) / results.refsTotal) * 100)} %`,
      delta: dRef.label, deltaGood: dRef.good, trend: refTrend, color: "#ff9d5c",
    },
    {
      id: "hum", icon: <IconWand className="h-[18px] w-[18px]" />, title: "Humaniseur IA", desc: "Rythme & marqueurs discursifs",
      metric: String(results.human), unit: "/100",
      sub: m ? `burstiness ${m.burstiness.toLocaleString("fr-FR")} · transitions ${m.transitionDensity.toLocaleString("fr-FR")} ‰` : "aucune réécriture détectée",
      tone: "gold" as Tone, pill: "Authentique",
      delta: dHum.label, deltaGood: dHum.good, trend: humTrend, color: "#5b8def",
    },
  ];

  return (
    <Reveal delay={140}>
      <section className="glass rounded-2xl p-5">
        <SectionTitle icon={<IconReport className="h-4 w-4" />} title="Analyses Spécifiques" right={<span className="font-mono text-[10px] text-ink-500">fenêtre : 8 dernières analyses</span>} />
        <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2">
          {cards.map((c, i) => (
            <article key={c.id} className="glass-soft card-hover group relative overflow-hidden rounded-xl p-4" style={{ transitionDelay: `${i * 40}ms` }}>
              <div className="flex items-start justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-gold-400/25 bg-gold-400/10 text-gold-300 transition-transform duration-300 group-hover:scale-110">{c.icon}</span>
                <span className={`rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-semibold ${c.deltaGood ? "bg-jade-400/10 text-jade-400" : "bg-ember-400/10 text-ember-400"}`}>{c.delta}</span>
              </div>
              <h3 className="mt-3 text-[13.5px] font-semibold text-ink-100">{c.title}</h3>
              <p className="text-[11px] leading-snug text-ink-500">{c.desc}</p>
              <div className="mt-2.5 flex items-end justify-between gap-2">
                <div>
                  <p className="font-display text-[22px] font-bold leading-none text-ink-100">
                    {c.metric}
                    {c.unit && <span className="ml-0.5 text-[13px] font-semibold text-gold-400">{c.unit}</span>}
                  </p>
                  <p className="mt-1 text-[10.5px] text-ink-400">{c.sub}</p>
                </div>
                <Sparkline points={c.trend} color={c.color} className="h-9 w-[86px]" />
              </div>
              <div className="mt-3">
                <Pill tone={c.tone}>{c.pill}</Pill>
              </div>
            </article>
          ))}
        </div>
      </section>
    </Reveal>
  );
}

/* ---------- Dernières analyses ---------- */

const kindBadge: Record<RecentEntry["kind"], { label: string; cls: string }> = {
  pdf: { label: "PDF", cls: "border-rose-400/35 bg-rose-400/10 text-rose-400" },
  docx: { label: "DOC", cls: "border-azure-400/35 bg-azure-400/10 text-azure-300" },
  txt: { label: "TXT", cls: "border-ink-400/30 bg-white/5 text-ink-300" },
};

const aiTone = (v: number): Tone => (v < 25 ? "ok" : v < 50 ? "warn" : "bad");
const plagTone = (v: number): Tone => (v < 8 ? "ok" : v < 15 ? "warn" : "bad");

export function RecentList({
  entries,
  onReport,
  onHistory,
}: {
  entries: RecentEntry[];
  onReport: (e: RecentEntry) => void;
  onHistory: () => void;
}) {
  return (
    <Reveal delay={80}>
      <section className="glass card-hover rounded-2xl p-5">
        <SectionTitle
          icon={<IconHistory className="h-4 w-4" />}
          title="Dernières Analyses"
          right={
            <button onClick={onHistory} className="group inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-gold-400 transition-colors hover:text-gold-200">
              Historique complet
              <IconArrow className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          }
        />
        <ul className="divide-y divide-white/[0.05]">
          {entries.map((e) => {
            const badge = kindBadge[e.kind];
            const st = statusOf(e.ai);
            return (
              <li key={e.id} className={`group flex items-center gap-3.5 rounded-lg px-2 py-3 transition-colors duration-300 hover:bg-white/[0.035] ${e.fresh ? "row-flash" : ""}`}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border font-mono text-[9.5px] font-bold ${badge.cls}`}>{badge.label}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink-100" title={e.name}>
                    {e.name}
                    {e.fresh && <span className="ml-2 rounded bg-gold-400/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-gold-300">NOUVEAU</span>}
                  </p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-ink-500">
                    {e.date} · {e.time} · {e.pages} p.
                    {e.mots !== undefined && <> · {fmtInt(e.mots)} mots</>}
                    {e.sizeKo !== undefined && <> · {fmtInt(e.sizeKo)} Ko</>}
                  </p>
                </div>
                <div className="hidden flex-col items-end gap-1 sm:flex">
                  <Pill tone={aiTone(e.ai)}>IA {e.ai} %</Pill>
                  <Pill tone={plagTone(e.plagiat)}>Plagiat {e.plagiat} %</Pill>
                </div>
                <button onClick={() => onReport(e)} className="btn-ghost shrink-0 px-3 py-1.5 text-[11.5px]">
                  <IconEye className="h-3.5 w-3.5" /> Rapport
                </button>
                <span className="sr-only">{st}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </Reveal>
  );
}
