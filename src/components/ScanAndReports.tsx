import { useEffect, useMemo, useRef, useState } from "react";
import type { GlobalResults, RecentEntry } from "../data";
import { flaggedPassages, fmtInt, reportIncludes, scanStageAt, scanStages } from "../data";
import { exportAnalysisReportPdf } from "../lib/verify/reportPdfs";
import type { AnalysisPayload, ScanPhase } from "../state/AnalysisContext";
import { MeterBar, Pill, Reveal, SectionTitle } from "../ui";
import { IconCheck, IconClose, IconCloudUp, IconDownload, IconFile, IconFlag, IconInfo, IconLock, IconReport, IconScan } from "./icons";

/* ================= NOUVEAU SCAN ================= */

const formats = ["PDF", "DOCX", "DOC", "TXT", "MD", "RTF"];
const ACCEPTED_EXT = ["pdf", "docx", "doc", "txt", "md", "rtf"];

export function UploadCard({
  phase,
  progress,
  fileName,
  onAnalyze,
  onReset,
  openTick,
}: {
  phase: ScanPhase;
  progress: number;
  fileName: string | null;
  onAnalyze: (payload: AnalysisPayload) => void;
  onReset: () => void;
  openTick: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState<"fichier" | "texte">("fichier");
  const [textValue, setTextValue] = useState("");
  const [extracting, setExtracting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (openTick > 0) inputRef.current?.click();
  }, [openTick]);

  const stage = scanStageAt(progress);
  const wordCount = useMemo(() => (textValue.trim() ? textValue.trim().split(/\s+/).length : 0), [textValue]);

  const startPasted = () => {
    if (wordCount < 30) return;
    const stamp = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
    onAnalyze({ name: `Texte_colle_${stamp}.txt`, text: textValue, sizeKo: Math.max(1, Math.round(textValue.length / 1024)) });
  };

  const handleFile = async (file: File) => {
    if (busyRef.current) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXT.includes(ext)) {
      setError(`Format « .${ext} » non pris en charge. Formats acceptés : ${formats.join(", ")}.`);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Fichier trop volumineux (25 Mo max).");
      return;
    }
    setError(null);
    busyRef.current = true;
    setExtracting(`Lecture de ${file.name}…`);
    try {
      const { extractTextFromFile } = await import("../lib/detector/textExtractor");
      const text = await extractTextFromFile(file, (p, total) => setExtracting(`Extraction du PDF — page ${p}/${total}…`));
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      if (words < 30) {
        setError(`Texte extrait trop court (${words} mots). Minimum requis : 30 mots.`);
        setExtracting(null);
        return;
      }
      setExtracting(null);
      onAnalyze({ name: file.name, text, sizeKo: Math.max(1, Math.round(file.size / 1024)) });
    } catch {
      setExtracting(null);
      setError("Extraction du texte impossible (document corrompu ou protégé). Essayez de coller le contenu directement.");
    } finally {
      busyRef.current = false;
    }
  };

  const idle = phase === "idle";

  return (
    <section className="glass card-hover relative overflow-hidden rounded-2xl p-5">
      {phase === "running" && (
        <div className="scanline pointer-events-none absolute inset-x-4 z-10 h-px bg-gradient-to-r from-transparent via-gold-300 to-transparent shadow-[0_0_18px_2px_rgba(232,189,85,0.55)]" />
      )}

      <SectionTitle
        icon={<IconScan className="h-4 w-4" />}
        title="Nouvelle Analyse"
        right={
          <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${phase === "running" ? "border-gold-400/40 bg-gold-400/10 text-gold-300" : "border-jade-400/25 bg-jade-400/5 text-jade-400"}`}>
            {phase === "running" ? "MOTEUR V2.1…" : "PRÊT"}
          </span>
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.md,.rtf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {!idle ? (
        <div className="glass-soft rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-gold-400/25 bg-gold-400/10 text-gold-300">
              <IconFile className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink-100" title={fileName ?? ""}>{fileName}</p>
              <p className="font-mono text-[11px] text-gold-300">
                {phase === "done" ? "Analyse terminée ✓" : `${Math.round(progress)} % — ${scanStages[stage]}`}
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-night-700">
            <div className={`h-full rounded-full transition-[width] duration-200 ease-out ${phase === "done" ? "bg-jade-400" : "shimmer-bar"}`} style={{ width: `${progress}%` }} />
          </div>
          <ul className="mt-4 space-y-1.5">
            {scanStages.map((s, i) => {
              const done = phase === "done" || i < stage;
              const current = phase === "running" && i === stage;
              return (
                <li key={s} className="flex items-center gap-2.5 text-[12px]">
                  <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[9px] transition-colors duration-300 ${done ? "border-jade-400/50 bg-jade-400/15 text-jade-400" : current ? "border-gold-400/60 bg-gold-400/15 text-gold-300" : "border-white/10 text-ink-500"}`}>
                    {done ? <IconCheck className="h-2.5 w-2.5" /> : current ? <span className="live-dot h-1.5 w-1.5 rounded-full bg-gold-400" /> : i + 1}
                  </span>
                  <span className={done ? "text-ink-300" : current ? "font-medium text-gold-300" : "text-ink-500"}>{s}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t border-white/[0.06] pt-2.5 font-mono text-[10px] leading-relaxed text-ink-500">
            IA_DETECT v2.1 · Voie 3 — heuristique de repli
            <br />
            18 features stylométriques · Web Worker &gt; 10 000 mots
          </p>
          {phase === "done" && (
            <button onClick={onReset} className="btn-ghost mt-3 w-full px-3 py-2 text-[12.5px]">
              <IconScan className="h-4 w-4" /> Analyser un autre document
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3.5 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-night-900/60 p-1">
            {(
              [
                { key: "fichier", label: "Importer un fichier" },
                { key: "texte", label: "Coller un texte" },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                onClick={() => setTab(m.key)}
                className={`rounded-md px-2 py-1.5 text-[12px] font-semibold transition-all duration-300 ${
                  tab === m.key ? "bg-gold-400/15 text-gold-300 shadow-[inset_0_0_0_1px_rgba(232,189,85,0.35)]" : "text-ink-400 hover:text-ink-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {tab === "fichier" ? (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFile(f);
                }}
                className={`relative grid place-items-center rounded-xl border border-dashed px-4 py-7 text-center transition-all duration-300 ${
                  dragOver ? "scale-[1.015] border-gold-400/70 bg-gold-400/[0.07]" : "border-ink-500/30 bg-night-800/40 hover:border-gold-400/40 hover:bg-night-800/70"
                }`}
              >
                <IconCloudUp className={`floaty h-10 w-10 ${dragOver ? "text-gold-300" : "text-gold-400/80"}`} />
                <p className="mt-2.5 text-[13.5px] font-semibold text-ink-100">
                  Glissez votre document <span className="text-gold-300">ici</span>
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-400">Extraction du texte puis analyse heuristique réelle</p>
                <button onClick={() => inputRef.current?.click()} className="btn-gold mt-3.5 px-5 py-2 text-[13px]">
                  <IconFile className="h-4 w-4" /> Choisir un fichier
                </button>
              </div>
              <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                {formats.map((f) => (
                  <span key={f} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] font-medium text-ink-300 transition-colors hover:border-gold-400/40 hover:text-gold-300">
                    {f}
                  </span>
                ))}
                <span className="ml-auto font-mono text-[10px] text-ink-500">25 Mo max</span>
              </div>
            </>
          ) : (
            <>
              <textarea
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="Collez ici le contenu du document à analyser… Le moteur calcule les 18 features stylométriques, la probabilité IA, la signature du modèle potentiel et les 5 facteurs explicatifs."
                className="h-36 w-full resize-y rounded-xl border border-white/10 bg-night-900/60 p-3.5 text-[12.5px] leading-relaxed text-ink-200 outline-none transition-colors duration-300 placeholder:text-ink-500 focus:border-gold-400/50"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className={`font-mono text-[11px] ${wordCount === 0 ? "text-ink-500" : wordCount < 30 ? "text-ember-400" : "text-jade-400"}`}>
                  {fmtInt(wordCount)} mots
                  {wordCount > 0 && wordCount < 30 && " · min. 30"}
                  {wordCount > 10000 && " · Web Worker"}
                </span>
                <button onClick={startPasted} disabled={wordCount < 30} className="btn-gold px-4 py-2 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-40">
                  <IconScan className="h-4 w-4" /> Lancer l'analyse
                </button>
              </div>
            </>
          )}

          {extracting && (
            <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-azure-400/25 bg-azure-400/[0.06] px-3 py-2.5 text-[12px] text-azure-300">
              <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-azure-400" />
              {extracting}
            </div>
          )}
          {error && (
            <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2.5 text-[12px] leading-snug text-rose-400">{error}</div>
          )}
        </>
      )}
    </section>
  );
}

/* ================= RAPPORTS ================= */

export function ReportsCard({ onExample }: { onExample: () => void }) {
  return (
    <Reveal delay={200}>
      <section className="glass card-hover rounded-2xl p-5">
        <SectionTitle
          icon={<IconReport className="h-4 w-4" />}
          title="Rapports Générés"
          right={<span className="rounded-md border border-gold-400/25 bg-gold-400/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-gold-300">PDF structurés</span>}
        />
        <p className="text-[12px] leading-relaxed text-ink-400">
          Chaque analyse produit un rapport PDF opposable : score d'origine IA par modèle, bilan du plagiat conditionnel,
          audit des hallucinations et recommandations méthodologiques.
        </p>
        <ul className="mt-4 space-y-2.5">
          {reportIncludes.map((r) => (
            <li key={r} className="flex items-start gap-2.5 text-[12.5px] text-ink-300">
              <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-jade-400/40 bg-jade-400/10 text-jade-400">
                <IconCheck className="h-2.5 w-2.5" />
              </span>
              {r}
            </li>
          ))}
        </ul>
        <button onClick={onExample} className="btn-gold mt-5 w-full px-4 py-2.5 text-[13px]">
          <IconReport className="h-4 w-4" /> Voir un exemple de rapport
        </button>
      </section>
    </Reveal>
  );
}

export function ReportModal({
  entry,
  results,
  onClose,
  onDownload,
}: {
  entry: RecentEntry;
  results: GlobalResults;
  onClose: () => void;
  onDownload: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const rows = [
    { label: "IA Générative", value: entry.ai, color: "#e8bd55" },
    { label: "Plagiat", value: entry.plagiat, color: "#ff7a85" },
    { label: "Références douteuses", value: results.refs, color: "#ff9d5c" },
    { label: "Contenu humanisé", value: Math.max(0, 100 - entry.ai - entry.plagiat - results.refs), color: "#5b8def" },
  ];
  const hasFactors = results.topFactors && results.topFactors.length > 0;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto p-4" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-night-950/70 backdrop-blur-sm" onClick={onClose} aria-label="Fermer" />
      <div className="glass toast-in relative my-6 w-full max-w-2xl rounded-2xl border-gold-400/20 p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-ink-400 transition-colors hover:border-rose-400/40 hover:text-rose-400"
          aria-label="Fermer le rapport"
        >
          <IconClose className="h-4 w-4" />
        </button>

        <p className="label-caps text-gold-400">Rapport d'analyse · #OLG-2026-{String(entry.id.length * 731 + entry.pages * 17).slice(0, 4)}</p>
        <h2 className="mt-1.5 font-display text-lg font-bold text-ink-100">{entry.name}</h2>
        <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-ink-500">
          {entry.date} · {entry.time} · {entry.pages} pages
          {entry.sizeKo ? ` · ${fmtInt(entry.sizeKo)} Ko` : ""}
          {entry.mots ? ` · ${fmtInt(entry.mots)} mots` : ""}
          {results.engine ? (
            <>
              <br />
              IA_DETECT v2.1 (Voie 3) · {results.engine.mode === "worker" ? "Web Worker dédié" : "exécution directe"} · {fmtInt(results.engine.durationMs)} ms
            </>
          ) : null}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="glass-soft grid place-items-center rounded-xl px-8 py-5">
            <p className="font-display text-4xl font-bold text-gold-300 gold-text-glow">{entry.ai}%</p>
            <p className="mt-1 text-[10.5px] uppercase tracking-[0.14em] text-ink-400">risque IA global</p>
          </div>
          <div className="glass-soft space-y-2.5 rounded-xl p-4">
            {rows.map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex justify-between text-[11.5px]">
                  <span className="text-ink-300">{r.label}</span>
                  <span className="font-mono font-semibold text-ink-100">{r.value} %</span>
                </div>
                <MeterBar value={r.value} height={5} color={`linear-gradient(90deg, ${r.color}88, ${r.color})`} />
              </div>
            ))}
          </div>
        </div>

        {results.decision && (
          <p className={`mt-4 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold ${entry.ai >= 50 ? "border-rose-400/25 bg-rose-400/[0.06] text-rose-400" : entry.ai >= 25 ? "border-ember-400/25 bg-ember-400/[0.06] text-ember-400" : "border-jade-400/25 bg-jade-400/[0.06] text-jade-400"}`}>
            {results.decision}
          </p>
        )}
        {results.signatureNote && <p className="mt-2 text-[11.5px] font-medium text-gold-400/90">{results.signatureNote}</p>}

        {hasFactors ? (
          <>
            <h3 className="label-caps mt-6 flex items-center gap-2 text-ink-400">
              <IconFlag className="h-3.5 w-3.5 text-gold-400" /> Facteurs explicatifs · Z-Scores
            </h3>
            <div className="mt-2.5 space-y-2.5">
              {results.topFactors!.map((f) => {
                const positive = f.z_score >= 0;
                return (
                  <div key={f.nom} className="glass-soft rounded-xl p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] font-semibold text-ink-200">{f.nom}</p>
                      <Pill tone={positive ? "warn" : "info"}>
                        z {positive ? "+" : "−"}{Math.abs(f.z_score).toFixed(2)} · contrib {f.contribution >= 0 ? "+" : "−"}{Math.abs(f.contribution).toFixed(3)}
                      </Pill>
                    </div>
                    <div className="mt-2">
                      <MeterBar
                        value={Math.min(100, (Math.abs(f.z_score) / 4) * 100)}
                        height={5}
                        color={positive ? "linear-gradient(90deg,#8a651d,#e8bd55,#f2d37f)" : "linear-gradient(90deg,#2b4fa6,#5b8def,#8fb0f5)"}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h3 className="label-caps mt-6 flex items-center gap-2 text-ink-400">
              <IconFlag className="h-3.5 w-3.5 text-gold-400" /> Passages signalés
            </h3>
            <div className="mt-2.5 space-y-2.5">
              {flaggedPassages.map((p) => (
                <div key={p.section} className="glass-soft rounded-xl border-l-2 border-l-gold-400/60 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-ink-200">{p.section}</p>
                    <Pill tone={p.confidence > 70 ? "warn" : "info"}>confiance {p.confidence} %</Pill>
                  </div>
                  <p className="mt-1.5 text-[12px] italic leading-relaxed text-ink-400">{p.text}</p>
                  <p className="mt-1.5 text-[11px] font-medium text-ember-400">→ {p.verdict}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-jade-400/20 bg-jade-400/[0.05] p-3.5">
          <IconLock className="mt-0.5 h-4 w-4 shrink-0 text-jade-400" />
          <div>
            <p className="text-[12px] font-semibold text-jade-400">Certificat d'authenticité horodaté</p>
            <p className="mt-0.5 font-mono text-[10.5px] leading-relaxed text-ink-400">
              Empreinte SHA-256 : 9f3a 77c2 0b14 e8d5 41aa 90cd 33fe 7b21 c21d
              <br />
              Horodatage qualifié eIDAS · {entry.date} {entry.time} UTC
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5">
          <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-[12.5px] font-medium text-ink-300 transition-colors hover:border-white/25 hover:text-ink-100">
            Fermer
          </button>
          <button onClick={() => exportAnalysisReportPdf(entry, results)} className="btn-ghost px-4 py-2 text-[12.5px]">
            <IconDownload className="h-4 w-4" /> Aperçu PDF
          </button>
          <button onClick={onDownload} className="btn-gold px-4 py-2 text-[12.5px]">
            <IconDownload className="h-4 w-4" /> Télécharger le PDF
          </button>
        </div>
        <span className="sr-only">
          <IconInfo className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}
