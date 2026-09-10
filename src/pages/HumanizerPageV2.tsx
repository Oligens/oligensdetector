import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { IconCheck, IconDownload, IconScan, IconWand } from "../components/icons";
import { fmtInt } from "../data";
import { analyzeText } from "../lib/detector/analysisRunner";
import { humanizeHybrid, type HybridFlow } from "../lib/humanizer/qwenClient";
import { warmUpHumanizer, type HumanizerProgress, type HumanizerReport } from "../lib/humanizer/humanizerRunner";
import { useAnalysis } from "../state/AnalysisContextV2";
import { PageHead, Pill, Reveal } from "../ui";

const SAMPLE_TEXT = "Les outils numériques transforment rapidement les habitudes de travail. Il est important de noter que cette évolution apporte des gains de temps, mais elle demande aussi de nouvelles méthodes. En conclusion, une utilisation réfléchie des technologies reste nécessaire pour conserver un travail clair, personnel et vérifiable.";

type HumanizerNavigationState = { source?: { text?: string; analysisId?: string; aiScore?: number; plagiarismScore?: number; confidence?: string; engine?: unknown } };
function words(text: string) { return text.trim() ? text.trim().split(/\s+/).length : 0; }
function pct(value: number) { return `${Math.round(value * 1000) / 10}`; }

function ProgressPanel({ progress }: { progress: HumanizerProgress | null }) {
  return <div className="glass-soft flex min-h-[280px] flex-col rounded-xl p-5">
    <div className="flex items-center justify-between gap-3"><p className="font-display text-[13px] font-semibold text-ink-100">Moteur local en cours</p>{progress && <span className="font-mono text-[11px] text-gold-300">{progress.iteration}/{progress.total}</span>}</div>
    <div className="mt-5 h-2 overflow-hidden rounded-full bg-night-700"><div className="shimmer-bar h-full rounded-full transition-[width] duration-300" style={{ width: progress ? `${Math.min(100, progress.iteration / Math.max(1, progress.total) * 100)}%` : "8%" }} /></div>
    <p className="mt-4 font-mono text-[11.5px] leading-relaxed text-gold-300">{progress?.phase ?? "Préparation de l'analyse stylistique…"}</p>
    {progress && <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg border border-white/10 bg-night-900/50 p-3"><p className="font-mono text-lg font-bold text-rose-400">{pct(progress.proba)} %</p><p className="label-caps mt-1 text-ink-500">Proba IA live</p></div><div className="rounded-lg border border-white/10 bg-night-900/50 p-3"><p className="font-mono text-lg font-bold text-gold-300">{progress.anomalies.length}</p><p className="label-caps mt-1 text-ink-500">Signaux ciblés</p></div></div>}
    <p className="mt-auto pt-6 text-[10.5px] leading-relaxed text-ink-500">Le moteur travaille localement dans un Web Worker quand le navigateur le permet, avec repli automatique sur le thread principal.</p>
  </div>;
}

export default function HumanizerPageV2() {
  const location = useLocation();
  const { lastScan, startScan, toast, saveHumanizerReport } = useAnalysis();
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [report, setReport] = useState<HumanizerReport | null>(null);
  const [running, setRunning] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [initialProba, setInitialProba] = useState<number | null>(null);
  const [canonicalAfter, setCanonicalAfter] = useState<number | null>(null);
  const [progress, setProgress] = useState<HumanizerProgress | null>(null);
  const [flow, setFlow] = useState<HybridFlow>("local");
  const [mode, setMode] = useState<"standard" | "ultra">("standard");
  const [intensity, setIntensity] = useState(0.78);
  const [iterations, setIterations] = useState(8);

  useEffect(() => {
    warmUpHumanizer();
    const state = location.state as HumanizerNavigationState | null;
    const source = state?.source;
    if (source?.text) {
      setInput(source.text);
      setInitialProba(typeof source.aiScore === "number" ? source.aiScore / 100 : null);
      setCanonicalAfter(null);
    }
  }, []);

  const inputWords = useMemo(() => words(input), [input]);
  const outputWords = useMemo(() => words(output), [output]);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    setOutput("");
    setReport(null);
    setInitialProba(null);
    setCanonicalAfter(null);
    setProgress(null);
  }, []);

  const clear = useCallback(() => { handleInputChange(""); }, [handleInputChange]);
  const loadSample = useCallback(() => { handleInputChange(SAMPLE_TEXT); }, [handleInputChange]);

  const loadLastScan = useCallback(() => {
    if (!lastScan?.text) { toast("Aucun texte source", "Lancez d'abord une analyse ou collez directement votre texte."); return; }
    handleInputChange(lastScan.text);
    setInitialProba(lastScan.result.ia / 100);
  }, [handleInputChange, lastScan, toast]);

  const evaluate = useCallback(async () => {
    const text = input.trim();
    if (words(text) < 30 || evaluating || running) return;
    setEvaluating(true);
    try {
      const result = await analyzeText(text, { language: "auto" });
      setInitialProba(result.probabilite_IA);
      toast("Évaluation terminée", `Probabilité Oligens estimée : ${pct(result.probabilite_IA)} %.`);
    } catch (error) {
      toast("Évaluation impossible", error instanceof Error ? error.message : "Le détecteur n'a pas pu analyser ce texte.");
    } finally { setEvaluating(false); }
  }, [evaluating, input, running, toast]);

  const humanize = useCallback(async () => {
    const text = input.trim();
    if (words(text) < 30 || running) return;
    setRunning(true); setOutput(""); setReport(null); setProgress(null); setCanonicalAfter(null);
    try {
      // The humanizer may use a local or remote transformation engine, but its
      // displayed score is NEVER taken from that engine. The canonical Oligens
      // detector is the single source of truth for before/after measurements.
      const outcome = await humanizeHybrid(text, {
        seuilCible: 0.05,
        iterationsMax: iterations,
        intensite: intensity,
        modeAggressif: mode === "ultra",
        langue: "mixte",
      }, {
        onPhase: () => undefined,
        onLocalProgress: setProgress,
        onFlowResolved: setFlow,
      });
      setOutput(outcome.text);
      setReport(outcome.report);
      saveHumanizerReport(outcome.report);

      const before = initialProba ?? outcome.report.proba_initiale;
      setInitialProba(before);

      // Re-run the exact same detector used by /api/analyses/create for the
      // transformed text. This prevents the old 1.9% vs 72% inconsistency.
      const after = await analyzeText(outcome.text, { language: "auto" });
      setCanonicalAfter(after.probabilite_IA);
      toast("Humanisation terminée", `Score Oligens : ${pct(before)} % → ${pct(after.probabilite_IA)} %.`);
    } catch (error) {
      toast("Erreur d'humanisation", error instanceof Error ? error.message : "Le moteur n'a pas pu terminer la transformation.");
    } finally { setRunning(false); }
  }, [initialProba, input, intensity, iterations, mode, running, saveHumanizerReport, toast]);

  const copy = async () => {
    if (!output) return;
    try { await navigator.clipboard.writeText(output); toast("Texte copié", `${fmtInt(outputWords)} mots.`); }
    catch { toast("Copie impossible", "Le navigateur bloque actuellement le presse-papiers."); }
  };
  const download = () => {
    if (!output) return;
    const url = URL.createObjectURL(new Blob([output], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "texte_humanise.txt"; a.click(); URL.revokeObjectURL(url);
  };
  const reanalyze = () => {
    if (!output) return;
    startScan({ name: "Texte_humanise.txt", text: output, sizeKo: Math.max(1, Math.round(output.length / 1024)) }, { redirectTo: "/analyses" });
  };

  const beforeDisplay = initialProba;
  const afterDisplay = canonicalAfter ?? (output && report ? report.proba_finale : null);

  return <>
    <PageHead kicker="Réécriture stylistique — moteur local Oligens" title="Humaniseur IA" actions={<div className="flex gap-2"><Pill tone="gold">Oligens Natural Engine</Pill><Pill tone="info">{flow === "local" ? "Traitement local" : flow}</Pill></div>} />

    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Reveal><section className="glass flex h-full flex-col rounded-2xl p-5">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-[13px] font-semibold text-ink-100">Texte source</h2><div className="flex gap-1.5">{lastScan?.text && <button onClick={loadLastScan} disabled={running} className="btn-ghost px-2.5 py-1 text-[10.5px]">Dernier scan</button>}<button onClick={loadSample} disabled={running} className="btn-ghost px-2.5 py-1 text-[10.5px]">Exemple</button>{input && <button onClick={clear} disabled={running} className="btn-ghost px-2.5 py-1 text-[10.5px]">Vider</button>}</div></div>
        <textarea value={input} onChange={(e) => handleInputChange(e.target.value)} disabled={running} placeholder="Collez ou écrivez votre propre texte ici. Ce champ est libre par défaut : aucun exemple n'est imposé." className="min-h-[320px] w-full flex-1 resize-y rounded-xl border border-white/10 bg-night-900/60 p-4 text-[13px] leading-relaxed text-ink-200 outline-none transition-colors placeholder:text-ink-500 focus:border-gold-400/50 disabled:opacity-60" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className={`font-mono text-[11px] ${inputWords < 30 ? "text-ink-500" : "text-jade-400"}`}>{fmtInt(inputWords)} mots{inputWords > 0 && inputWords < 30 ? " · min. 30 pour analyser" : ""}</span><button onClick={() => void evaluate()} disabled={inputWords < 30 || evaluating || running} className="btn-ghost px-3 py-1.5 text-[11.5px] disabled:opacity-40">{evaluating ? "Évaluation…" : "Évaluer"}</button></div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><div><label className="label-caps text-ink-500">Mode</label><select value={mode} disabled={running} onChange={(e) => setMode(e.target.value as "standard" | "ultra")} className="mt-1.5 w-full rounded-lg border border-white/10 bg-night-900/60 px-3 py-2 text-[12px] text-ink-200 outline-none"><option value="standard">Standard — préservation du sens</option><option value="ultra">Intensif — variations renforcées</option></select></div><div><label className="label-caps text-ink-500">Itérations</label><input type="number" min={3} max={16} value={iterations} disabled={running} onChange={(e) => setIterations(Math.max(3, Math.min(16, Number(e.target.value) || 8)))} className="mt-1.5 w-full rounded-lg border border-white/10 bg-night-900/60 px-3 py-2 text-[12px] text-ink-200 outline-none" /></div></div>
        <label className="mt-4 block"><span className="label-caps text-ink-500">Intensité <span className="font-mono text-gold-300">{intensity.toFixed(2)}</span></span><input type="range" min={0.5} max={1} step={0.05} value={intensity} disabled={running} onChange={(e) => setIntensity(Number(e.target.value))} className="mt-2 w-full" style={{ accentColor: "#e8bd55" }} /></label>
        <button onClick={() => void humanize()} disabled={inputWords < 30 || running} className="mt-5 w-full rounded-xl bg-gradient-to-r from-gold-200 via-gold-400 to-azure-400 px-5 py-4 font-display text-[13px] font-bold tracking-wide text-night-900 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40">{running ? "HUMANISATION EN COURS…" : "HUMANISER MON TEXTE"}</button>
        <p className="mt-2 text-[10.5px] leading-relaxed text-ink-500">Le score Avant/Après affiché à droite provient toujours du détecteur Oligens canonique, jamais d'un score interne différent du moteur d'analyse.</p>
      </section></Reveal>

      <Reveal delay={100}><section className="glass flex h-full flex-col rounded-2xl p-5">
        <div className="mb-3.5 flex items-center justify-between gap-2"><h2 className="font-display text-[13px] font-semibold text-ink-100">Résultat</h2>{canonicalAfter !== null && <Pill tone={canonicalAfter <= 0.05 ? "ok" : "warn"}>IA Oligens · {pct(canonicalAfter)} %</Pill>}</div>
        {running ? <ProgressPanel progress={progress} /> : output ? <div className="flex flex-1 flex-col">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div className="glass-soft rounded-xl p-3 text-center"><p className="font-display text-xl font-bold text-rose-400">{beforeDisplay === null ? "—" : `${pct(beforeDisplay)}%`}</p><p className="label-caps mt-1 text-ink-500">Oligens · Avant</p></div>
            <div className="glass-soft rounded-xl p-3 text-center"><p className="font-display text-xl font-bold text-jade-400">{afterDisplay === null ? "—" : `${pct(afterDisplay)}%`}</p><p className="label-caps mt-1 text-ink-500">Oligens · Après</p></div>
          </div>
          <div className="mb-3 rounded-lg border border-gold-400/15 bg-gold-400/[0.04] px-3 py-2 text-[10.5px] leading-relaxed text-ink-400">Une seule source de vérité : <span className="font-semibold text-gold-300">Oligens ML / analysePipeline</span>. Le moteur de réécriture ne détermine pas le score final.</div>
          <textarea value={output} onChange={(e) => setOutput(e.target.value)} className="min-h-[320px] flex-1 resize-y rounded-xl border border-jade-400/25 bg-night-900/60 p-4 text-[13px] leading-relaxed text-ink-200 outline-none focus:border-jade-400/50" />
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void copy()} className="btn-gold px-3.5 py-2 text-[12px]"><IconCheck className="h-3.5 w-3.5" /> Copier</button><button onClick={download} className="btn-ghost px-3.5 py-2 text-[12px]"><IconDownload className="h-3.5 w-3.5" /> TXT</button><button onClick={reanalyze} className="btn-ghost px-3.5 py-2 text-[12px]"><IconScan className="h-3.5 w-3.5" /> Ré-analyser</button></div>
        </div> : <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-night-900/30 p-8 text-center"><IconWand className="h-12 w-12 text-gold-400/70"/><h3 className="mt-4 font-display text-[15px] font-bold text-ink-100">Prêt à travailler</h3><p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-ink-400">Collez votre texte à gauche. Vous pouvez le laisser vide, l'effacer ou le remplacer à tout moment sans déclencher de navigation.</p></div>}
      </section></Reveal>
    </div>
  </>;
}
