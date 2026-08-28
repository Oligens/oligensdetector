import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconCheck, IconDownload, IconRefresh, IconScan, IconWand } from "../components/icons";
import { fmtInt } from "../data";
import { analyzeText } from "../lib/detector/analysisRunner";
import type { HumanizerProgress, HumanizerReport } from "../lib/humanizer/humanizerUltimate";
import { warmUpHumanizer } from "../lib/humanizer/humanizerRunner";
import { humanizeHybrid, HYBRID_API_TIMEOUT_MS, QWEN_CONFIG, type HybridFlow } from "../lib/humanizer/qwenClient";
import { useAnalysis } from "../state/AnalysisContext";
import { PageHead, Pill, Reveal, Sparkline } from "../ui";

const AI_STYLE_SAMPLE = `Il est important de noter que la rédaction assistée par intelligence artificielle transforme en profondeur les pratiques académiques contemporaines. En effet, les modèles de langage produisent des textes dont la régularité stylistique trahit souvent l'origine artificielle. Il convient de souligner que cette uniformité se mesure notamment par la burstiness, c'est-à-dire la variation des longueurs de phrases au fil du document. Par ailleurs, les transitions discursives standardisées constituent un marqueur fortement discriminant pour les moteurs de détection. De plus, la densité d'expressions figées augmente sensiblement la prévisibilité statistique du texte. Dans le paysage actuel, il est essentiel de comprendre ces signaux faibles pour évaluer sérieusement l'authenticité d'un document soumis à une commission d'intégrité. Cependant, aucune méthode heuristique n'est parfaitement infaillible et des faux positifs demeurent possibles. Par conséquent, une interprétation prudente et contextualisée reste recommandée en toutes circonstances. En conclusion, la combinaison de dix-huit caractéristiques stylométriques offre une estimation robuste de la probabilité d'origine artificielle d'un écrit.`;

const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

const probaColor = (p: number) => (p >= 50 ? "#ff7a85" : p >= 25 ? "#ff9d5c" : p >= 5 ? "#e8bd55" : "#3ddc97");

function Gauge({ value, caption }: { value: number; caption: string }) {
  const r = 42;
  const C = 2 * Math.PI * r;
  const color = probaColor(value);
  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(28,47,85,0.6)" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" className="donut-seg" strokeDasharray={`${(value / 100) * C} ${C}`} style={{ filter: `drop-shadow(0 0 7px ${color}66)` }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="font-display text-[22px] font-bold leading-none" style={{ color }}>
            {value}
            <span className="text-[13px]">%</span>
          </p>
          <p className="mt-1 text-[8px] font-medium uppercase tracking-[0.16em] text-ink-500">{caption}</p>
        </div>
      </div>
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Console de connexion (phase API) ── */
function StepDots({ active }: { active: number }) {
  const labels = ["Connexion", "Réécriture", "Analyse IA"];
  return (
    <div className="flex items-center gap-2">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-2">
          <span className={`grid h-7 w-7 place-items-center rounded-full border font-mono text-[10px] font-bold transition-all duration-500 ${
            i < active ? "border-jade-400/50 bg-jade-400/15 text-jade-400" : i === active ? "border-gold-400/70 bg-gold-400/15 text-gold-300 shadow-[0_0_14px_-2px_rgba(232,189,85,0.7)]" : "border-white/10 text-ink-500"
          }`}>
            {i < active ? <IconCheck className="h-3 w-3" /> : i + 1}
          </span>
          <span className={`text-[10.5px] font-medium ${i === active ? "text-gold-300" : "text-ink-500"}`}>{l}</span>
          {i < labels.length - 1 && <span className={`h-px w-5 ${i < active ? "bg-jade-400/50" : "bg-white/10"}`} />}
        </div>
      ))}
    </div>
  );
}

function ConnectingPanel({ phaseLabel, step, fallbackNote }: { phaseLabel: string; step: number; fallbackNote: string | null }) {
  return (
    <div className="flex flex-1 flex-col rounded-xl border border-gold-400/20 bg-night-900/50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StepDots active={step} />
        <span className="inline-flex items-center gap-1.5 rounded-md border border-azure-400/30 bg-azure-400/[0.07] px-2 py-0.5 font-mono text-[10px] text-azure-300">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-azure-400" />
          moteur hybride · {QWEN_CONFIG.model}
        </span>
      </div>
      {fallbackNote && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-ember-400/30 bg-ember-400/[0.07] px-3 py-2.5">
          <IconRefresh className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ember-400" />
          <p className="text-[11.5px] leading-snug text-ember-400">{fallbackNote}</p>
        </div>
      )}
      <div className="mt-8 grid place-items-center">
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-gold-400 border-r-gold-400/40 [animation-duration:1.1s]" />
          <div className="absolute inset-2.5 animate-spin rounded-full border-2 border-transparent border-b-azure-400 border-l-azure-400/40 [animation-direction:reverse] [animation-duration:1.7s]" />
          <div className="absolute inset-0 grid place-items-center">
            <IconWand className="h-7 w-7 text-gold-300 gold-text-glow" />
          </div>
        </div>
        <p className="mt-5 max-w-[340px] text-center font-mono text-[12px] leading-relaxed text-gold-300">{phaseLabel}</p>
      </div>
      <div className="mt-8">
        <div className="h-1.5 overflow-hidden rounded-full bg-night-700">
          <div className="bar-slide h-full w-[38%] rounded-full bg-gradient-to-r from-transparent via-gold-400 to-transparent" />
        </div>
      </div>
      <p className="mt-auto pt-6 text-center font-mono text-[10px] leading-relaxed text-ink-500">
        Le score final est recalculé par le détecteur heuristique IA_DETECT v2.1
        <br />
        Timeout API {HYBRID_API_TIMEOUT_MS / 1000} s — bascule locale automatique si injoignable
      </p>
    </div>
  );
}

/* ── Flux temps réel SSE ── */
function LiveStreamPanel({ text, words }: { text: string; words: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <div className="flex flex-1 flex-col rounded-xl border border-gold-400/25 bg-night-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="live-dot h-2 w-2 rounded-full bg-gold-400" />
          <p className="text-[12.5px] font-semibold text-ink-100">Réécriture stylistique en cours…</p>
        </div>
        <span className="rounded-md border border-gold-400/30 bg-gold-400/[0.08] px-2 py-0.5 font-mono text-[10.5px] text-gold-300">
          {fmtInt(words)} mots · flux SSE
        </span>
      </div>
      <div ref={ref} className="min-h-[280px] flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-4 font-body text-[13px] leading-relaxed text-ink-200">
        {text}
        <span className="stream-caret" />
      </div>
      <p className="border-t border-white/[0.06] px-5 py-2.5 font-mono text-[10px] text-ink-500">
        {QWEN_CONFIG.model} répond en direct — analyse heuristique dès la fin du flux.
      </p>
    </div>
  );
}

/* ── Console du repli local (passes chunked) ── */
function LocalProgressPanel({ progress, phaseLabel, fallbackNote }: { progress: HumanizerProgress | null; phaseLabel: string; fallbackNote: string | null }) {
  return (
    <div className="flex flex-1 flex-col rounded-xl border border-gold-400/20 bg-night-900/50 p-5">
      {fallbackNote && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-ember-400/30 bg-ember-400/[0.07] px-3 py-2.5">
          <IconRefresh className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ember-400" />
          <p className="text-[11.5px] leading-snug text-ember-400">{fallbackNote}</p>
        </div>
      )}
      {progress ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-display text-[30px] font-bold leading-none text-gold-300 gold-text-glow">
                {progress.iteration}
                <span className="text-[16px] text-ink-400">/{progress.total}</span>
              </p>
              <p className="label-caps mt-1.5 text-ink-500">Passé en cours</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[22px] font-bold leading-none" style={{ color: probaColor(progress.proba * 100) }}>
                {(progress.proba * 100).toFixed(1)} %
              </p>
              <p className="label-caps mt-1.5 text-ink-500">Proba IA live</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-2.5 overflow-hidden rounded-full bg-night-700">
              <div className="shimmer-bar h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${Math.min(100, (progress.iteration / progress.total) * 100)}%` }} />
            </div>
          </div>
          <div className="mt-3.5 flex items-center gap-2.5">
            <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-gold-400" />
            <p className="truncate font-mono text-[11.5px] text-gold-300">{progress.phase}</p>
          </div>
          {progress.anomalies.length > 0 && (
            <div className="mt-4 border-t border-white/[0.06] pt-3.5">
              <p className="label-caps mb-2 text-ink-500">Anomalies ciblées à cette passe</p>
              <div className="space-y-1.5">
                {progress.anomalies.map((a) => (
                  <div key={a.nom} className="flex items-center justify-between gap-3 text-[11.5px]">
                    <span className="truncate text-ink-300">{a.nom}</span>
                    <span className="font-mono text-gold-300">+{a.contribution.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="font-mono text-[12px] text-gold-300">{phaseLabel}</p>
      )}
      <p className="mt-auto pt-4 font-mono text-[10px] leading-relaxed text-ink-500">
        Moteur local ULTIMATE · exécution par lots (rAF + 10 ms) · circuit breaker 8 s
      </p>
    </div>
  );
}

/* ── Panneau source (mémoïsé) ── */
interface SourcePanelProps {
  input: string;
  inWords: number;
  running: boolean;
  evaluating: boolean;
  initProba: number | null;
  mode: "standard" | "ultra";
  intensity: number;
  maxIter: number;
  hasLastScan: boolean;
  lastScanName: string;
  onInput: (v: string) => void;
  onMode: (m: "standard" | "ultra") => void;
  onIntensity: (v: number) => void;
  onMaxIter: (v: number) => void;
  onLoadSample: () => void;
  onLoadLastScan: () => void;
  onClear: () => void;
  onEvaluate: () => void;
  onHumanize: () => void;
}

const SourcePanel = memo(function SourcePanel(p: SourcePanelProps) {
  const sliderStyle = { accentColor: "#e8bd55" };
  return (
    <section className="glass flex h-full flex-col rounded-2xl p-5">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[13px] font-semibold tracking-wide text-ink-100">Texte source</h2>
        <div className="flex flex-wrap gap-1.5">
          {p.hasLastScan && (
            <button onClick={p.onLoadLastScan} className="max-w-[180px] truncate rounded-md border border-gold-400/30 bg-gold-400/[0.08] px-2 py-1 font-mono text-[10px] text-gold-300 transition-colors hover:bg-gold-400/15" title={p.lastScanName}>
              Dernier scan · {p.lastScanName}
            </button>
          )}
          <button onClick={p.onLoadSample} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-ink-300 transition-colors hover:border-gold-400/40 hover:text-gold-300">
            Exemple IA
          </button>
          {p.input && (
            <button onClick={p.onClear} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-ink-400 transition-colors hover:border-rose-400/40 hover:text-rose-400">
              Vider
            </button>
          )}
        </div>
      </div>

      <textarea
        value={p.input}
        onChange={(e) => p.onInput(e.target.value)}
        disabled={p.running}
        placeholder="Collez ici le texte à humaniser (minimum 100 mots pour un avant/après fiable)…"
        className="h-52 w-full flex-1 resize-none rounded-xl border border-white/10 bg-night-900/60 p-3.5 text-[12.5px] leading-relaxed text-ink-200 outline-none transition-colors duration-300 placeholder:text-ink-500 focus:border-gold-400/50 disabled:opacity-60"
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`font-mono text-[11px] ${p.inWords === 0 ? "text-ink-500" : p.inWords < 100 ? "text-ember-400" : "text-jade-400"}`}>
          {fmtInt(p.inWords)} mots {p.inWords > 0 && p.inWords < 100 && "· min. 100"}
        </span>
        <button onClick={p.onEvaluate} disabled={p.inWords < 100 || p.evaluating || p.running} className="btn-ghost px-3 py-1.5 text-[11.5px] disabled:opacity-40">
          {p.evaluating ? "Évaluation…" : "Évaluer la probabilité IA"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-5 rounded-xl border border-white/[0.07] bg-night-900/40 p-4">
        {p.initProba !== null ? (
          <Gauge value={p.initProba} caption="IA initiale" />
        ) : (
          <div className="grid h-[104px] w-[104px] place-items-center rounded-full border border-dashed border-ink-500/30 text-center">
            <p className="px-3 text-[10px] leading-snug text-ink-500">
              Probabilité initiale
              <br />
              mesurée au lancement
            </p>
          </div>
        )}
        <div className="space-y-4">
          <div>
            <p className="label-caps mb-1.5 text-ink-500">Mode (repli local)</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-night-900/60 p-1">
              {(
                [
                  { key: "standard", label: "Standard" },
                  { key: "ultra", label: "Ultra-Agressif" },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  onClick={() => p.onMode(m.key)}
                  disabled={p.running}
                  className={`rounded-md px-2 py-1.5 text-[12px] font-semibold transition-all duration-300 ${
                    p.mode === m.key
                      ? m.key === "ultra"
                        ? "bg-rose-400/15 text-rose-400 shadow-[inset_0_0_0_1px_rgba(255,122,133,0.4)]"
                        : "bg-gold-400/15 text-gold-300 shadow-[inset_0_0_0_1px_rgba(232,189,85,0.4)]"
                      : "text-ink-400 hover:text-ink-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[12px] font-medium text-ink-300">Intensité</span>
              <span className="font-mono text-[12px] font-semibold text-gold-300">{p.intensity.toFixed(2)}</span>
            </div>
            <input type="range" min={0.5} max={1} step={0.05} value={p.intensity} disabled={p.running} onChange={(e) => p.onIntensity(Number(e.target.value))} className="w-full" style={sliderStyle} />
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[12px] font-medium text-ink-300">Itérations max</span>
              <span className="font-mono text-[12px] font-semibold text-gold-300">{p.maxIter} passes</span>
            </div>
            <input type="range" min={4} max={16} step={1} value={p.maxIter} disabled={p.running} onChange={(e) => p.onMaxIter(Number(e.target.value))} className="w-full" style={sliderStyle} />
          </div>
        </div>
      </div>

      <button
        onClick={p.onHumanize}
        disabled={p.inWords < 100 || p.running}
        className="group relative mt-4 w-full overflow-hidden rounded-xl px-5 py-4 text-center transition-transform duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        style={{
          background: "linear-gradient(115deg,#f8e3a4 0%,#e8bd55 38%,#d5a63c 62%,#5b8def 140%)",
          boxShadow: "0 0 36px -8px rgba(213,166,60,0.75), 0 0 70px -22px rgba(91,141,239,0.6), inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      >
        <span className="font-display text-[13px] font-bold tracking-[0.06em] text-night-900">
          {p.running ? "RÉÉCRITURE EN COURS…" : "HUMANISER LE TEXTE (MOTEUR HYBRIDE)"}
        </span>
        <span className="mt-0.5 block font-mono text-[10px] font-medium text-night-800/80">
          {p.running
            ? "moteur hybride en action — API puis repli local…"
            : `${QWEN_CONFIG.model} (timeout ${HYBRID_API_TIMEOUT_MS / 1000} s) → repli local ULTIMATE automatique`}
        </span>
      </button>
    </section>
  );
});

/* ══════════════════════ PAGE /humanizer ══════════════════════ */

export default function HumanizerPage() {
  const { lastScan, startScan, toast, addReportFromEntry, saveHumanizerReport } = useAnalysis();
  const navigate = useNavigate();

  const [input, setInput] = useState("");
  const [initProba, setInitProba] = useState<number | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [mode, setMode] = useState<"standard" | "ultra">("ultra");
  const [intensity, setIntensity] = useState(0.95);
  const [maxIter, setMaxIter] = useState(12);

  const [running, setRunning] = useState(false);
  const [flow, setFlow] = useState<HybridFlow>("api");
  const [phaseLabel, setPhaseLabel] = useState("Connexion au LLM AgweStream…");
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [localProgress, setLocalProgress] = useState<HumanizerProgress | null>(null);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [apiDuration, setApiDuration] = useState<number | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [report, setReport] = useState<HumanizerReport | null>(null);

  const inWords = useMemo(() => countWords(input), [input]);
  const outWords = useMemo(() => (output ? countWords(output) : 0), [output]);

  useEffect(() => {
    warmUpHumanizer();
  }, []);

  const lastScanRef = useRef(lastScan);
  useEffect(() => {
    lastScanRef.current = lastScan;
  }, [lastScan]);
  const lastScanAt = lastScan?.at;
  useEffect(() => {
    if (lastScan && output === null) {
      setInput(lastScan.text);
      setInitProba(lastScan.result.ia);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastScanAt]);

  const onInput = useCallback((v: string) => setInput(v), []);
  const onMode = useCallback((m: "standard" | "ultra") => setMode(m), []);
  const onIntensity = useCallback((v: number) => setIntensity(v), []);
  const onMaxIter = useCallback((v: number) => setMaxIter(v), []);
  const onLoadSample = useCallback(() => {
    setInput(AI_STYLE_SAMPLE);
    setInitProba(null);
    setOutput(null);
    setReport(null);
    setFallbackNote(null);
  }, []);
  const onLoadLastScan = useCallback(() => {
    const ls = lastScanRef.current;
    if (!ls) return;
    setInput(ls.text);
    setInitProba(ls.result.ia);
    setOutput(null);
    setReport(null);
    setFallbackNote(null);
  }, []);
  const onClear = useCallback(() => {
    setInput("");
    setInitProba(null);
    setOutput(null);
    setReport(null);
    setFallbackNote(null);
  }, []);

  const onEvaluate = useCallback(async () => {
    const text = input;
    if (countWords(text) < 100 || evaluating) return;
    setEvaluating(true);
    try {
      const r = await analyzeText(text);
      setInitProba(Math.round(r.probabilite_IA * 100));
    } catch {
      toast("Erreur d'évaluation", "Le détecteur n'a pas pu évaluer ce texte.");
    } finally {
      setEvaluating(false);
    }
  }, [input, evaluating, toast]);

  /**
   * Un seul clic : le moteur hybride tente l'API AgweStream (4 s) puis bascule
   * silencieusement sur le moteur local chunked si l'endpoint est injoignable.
   */
  const handleHumanize = useCallback(async () => {
    const text = input;
    if (!text || countWords(text) < 100 || running) return;

    setRunning(true);
    setFlow("api");
    setOutput(null);
    setReport(null);
    setStreaming(false);
    setLiveText("");
    setLocalProgress(null);
    setFallbackNote(null);
    setApiDuration(null);
    setPhaseLabel("Initialisation du moteur hybride…");

    try {
      await new Promise((r) => window.setTimeout(r, 60));
      const outcome = await humanizeHybrid(
        text,
        { seuilCible: 0.05, iterationsMax: maxIter, intensite: intensity, modeAggressif: mode === "ultra", langue: "mixte" },
        {
          onPhase: setPhaseLabel,
          onApiDelta: (acc) => {
            setStreaming(true);
            setLiveText(acc);
          },
          onFallback: (reason) => {
            setFallbackNote(`Mode hybride : bascule sur le moteur de secours local (${reason}).`);
            toast("Mode hybride", "Bascule sur le moteur de secours local.");
          },
          onLocalProgress: setLocalProgress,
          onFlowResolved: setFlow,
        }
      );

      setStreaming(false);
      setOutput(outcome.text);
      setReport(outcome.report);
      setApiDuration(outcome.apiDurationMs ?? null);
      setInitProba(Math.round(outcome.report.proba_initiale * 100));
      saveHumanizerReport(outcome.report);

      const finalPct = Math.round(outcome.report.proba_finale * 1000) / 10;
      toast(
        outcome.flow === "api"
          ? finalPct < 5 ? "Neutralisation réussie" : "Humanisation terminée"
          : "Humanisation terminée (repli local)",
        `Probabilité IA → ${finalPct.toLocaleString("fr-FR")} % · ${outcome.flow === "api" ? `${QWEN_CONFIG.model} · ${fmtInt(outcome.apiDurationMs ?? 0)} ms` : `${outcome.report.iterations_realisees} passes locales`}.`
      );
    } catch (err) {
      console.error("Erreur lors de l'humanisation hybride :", err);
      toast("Erreur d'humanisation", err instanceof Error ? err.message : "Échec inattendu du moteur hybride.");
    } finally {
      setRunning(false);
      setStreaming(false);
    }
  }, [input, running, maxIter, intensity, mode, saveHumanizerReport, toast]);

  const baseName = (lastScan?.name ?? "texte").replace(/\.\w+$/, "");

  const copyText = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      toast("Texte copié", `${fmtInt(outWords)} mots dans le presse-papiers.`);
    } catch {
      toast("Copie impossible", "Votre navigateur bloque l'accès au presse-papiers.");
    }
  };

  const downloadTxt = () => {
    if (!output) return;
    triggerDownload(new Blob([output], { type: "text/plain;charset=utf-8" }), `${baseName}_humanise.txt`);
    toast("TXT téléchargé", `${baseName}_humanise.txt — ${fmtInt(outWords)} mots.`);
  };

  const downloadDocx = async () => {
    if (!output) return;
    try {
      const { Document, Packer, Paragraph, HeadingLevel } = await import("docx");
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({ text: "Oligens Detector — Texte humanisé (moteur hybride)", heading: HeadingLevel.HEADING_1 }),
              new Paragraph({
                text: `Probabilité IA finale : ${Math.round((report?.proba_finale ?? 0) * 100)} % · ${report?.viaApi ? `modèle ${report.model ?? "AgweStream"} · DashScope` : `${report?.iterations_realisees ?? 0} passes locales`}`,
              }),
              ...output.split(/\n+/).filter(Boolean).map((p) => new Paragraph(p)),
            ],
          },
        ],
      });
      triggerDownload(await Packer.toBlob(doc), `${baseName}_humanise.docx`);
      toast("DOCX téléchargé", `${baseName}_humanise.docx — document Word natif.`);
    } catch {
      toast("Erreur DOCX", "La génération du document Word a échoué.");
    }
  };

  const reanalyze = () => {
    if (!output) return;
    startScan({ name: `Humanise_${baseName}.txt`, text: output, sizeKo: Math.max(1, Math.round(output.length / 1024)) });
    toast("Ré-analyse lancée", "Le texte humanisé repasse dans le détecteur heuristique — redirection vers Analyses.");
    navigate("/analyses");
  };

  const certify = () => {
    if (!report || !output) return;
    const now = new Date();
    addReportFromEntry({
      id: `h${Date.now()}`,
      name: `Humanisation_${baseName}.txt`,
      kind: "txt",
      date: now.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }),
      time: now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      pages: Math.max(1, Math.round(outWords / 300)),
      ai: Math.round(report.proba_finale * 100),
      plagiat: 0,
      mots: outWords,
      sizeKo: Math.max(1, Math.round(output.length / 1024)),
    });
    toast("Rapport certifié", "Le rapport d'humanisation a été injecté au centre de rapports (compteur +1).");
    navigate("/reports");
  };

  const finalPct = report ? Math.round(report.proba_finale * 1000) / 10 : null;
  const targetReached = report ? report.proba_finale < 0.05 : false;
  const step = flow === "local" ? 1 : /Évaluation|Connexion|Initialisation/.test(phaseLabel) ? 0 : /Réécriture|réécriture/.test(phaseLabel) ? 1 : 2;

  return (
    <>
      <PageHead
        kicker="Réécriture stylistique — moteur hybride intelligent"
        title="Humaniseur IA"
        actions={
          <div className="flex items-center gap-2">
            <Pill tone="info">{QWEN_CONFIG.model} · DashScope</Pill>
            <Pill tone="gold">repli local ULTIMATE</Pill>
          </div>
        }
      />

      {!input && !output ? (
        <Reveal>
          <div className="glass grid place-items-center rounded-2xl border-dashed px-6 py-16 text-center">
            <IconWand className="floaty h-12 w-12 text-gold-400/80" />
            <h2 className="mt-4 font-display text-lg font-bold text-ink-100">Moteur hybride : LLM AgweStream + repli local</h2>
            <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-ink-400">
              Le texte est d'abord envoyé au modèle Qwen (endpoint DashScope, timeout {HYBRID_API_TIMEOUT_MS / 1000} s). Si
              l'endpoint est injoignable — réseau, CORS ou clé — la bascule sur le moteur local ULTIMATE est immédiate et
              invisible. Le texte réécrit apparaît en flux temps réel, puis le détecteur recalcule la probabilité IA.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {lastScan && (
                <button onClick={onLoadLastScan} className="btn-gold px-4 py-2.5 text-[13px]">
                  <IconScan className="h-4 w-4" /> Charger le dernier scan — {lastScan.name}
                </button>
              )}
              <button onClick={onLoadSample} className="btn-ghost px-4 py-2.5 text-[13px]">
                <IconWand className="h-4 w-4" /> Texte d'exemple typique d'IA
              </button>
            </div>
          </div>
        </Reveal>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Reveal>
            <SourcePanel
              input={input}
              inWords={inWords}
              running={running}
              evaluating={evaluating}
              initProba={initProba}
              mode={mode}
              intensity={intensity}
              maxIter={maxIter}
              hasLastScan={!!lastScan}
              lastScanName={lastScan?.name ?? ""}
              onInput={onInput}
              onMode={onMode}
              onIntensity={onIntensity}
              onMaxIter={onMaxIter}
              onLoadSample={onLoadSample}
              onLoadLastScan={onLoadLastScan}
              onClear={onClear}
              onEvaluate={() => void onEvaluate()}
              onHumanize={() => void handleHumanize()}
            />
          </Reveal>

          <Reveal delay={120}>
            <section className="glass flex h-full flex-col rounded-2xl p-5">
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-[13px] font-semibold tracking-wide text-ink-100">Texte humanisé & résultats</h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  {report && (
                    <Pill tone={report.viaApi ? "info" : "gold"}>{report.viaApi ? `${report.model ?? "AgweStream"} · Qwen` : "moteur local ULTIMATE"}</Pill>
                  )}
                  {report && (
                    <Pill tone={targetReached ? "ok" : "warn"}>
                      {targetReached ? <IconCheck className="h-3 w-3" /> : <IconRefresh className="h-3 w-3" />}
                      IA finale : {finalPct?.toLocaleString("fr-FR")} % {targetReached ? "— objectif atteint" : ""}
                    </Pill>
                  )}
                </div>
              </div>

              {running && flow === "local" ? (
                <LocalProgressPanel progress={localProgress} phaseLabel={phaseLabel} fallbackNote={fallbackNote} />
              ) : running && streaming ? (
                <LiveStreamPanel text={liveText} words={countWords(liveText)} />
              ) : running ? (
                <ConnectingPanel phaseLabel={phaseLabel} step={step} fallbackNote={fallbackNote} />
              ) : output && report ? (
                <div className="flex flex-1 flex-col">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="glass-soft rounded-xl p-3 text-center">
                      <p className="font-display text-[20px] font-bold leading-none text-rose-400">
                        {Math.round(report.proba_initiale * 100)}<span className="text-[12px]">%</span>
                      </p>
                      <p className="label-caps mt-1.5 text-ink-500">Avant</p>
                    </div>
                    <div className="glass-soft rounded-xl p-3 text-center">
                      <p className="font-display text-[20px] font-bold leading-none text-gold-300 gold-text-glow">
                        −{report.reduction_pourcent.toFixed(1).replace(".", ",")}<span className="text-[12px]">pts</span>
                      </p>
                      <p className="label-caps mt-1.5 text-ink-500">Réduction</p>
                    </div>
                    <div className={`glass-soft rounded-xl border p-3 text-center ${targetReached ? "border-jade-400/40" : "border-ember-400/40"}`}>
                      <p className="font-display text-[20px] font-bold leading-none" style={{ color: probaColor(report.proba_finale * 100) }}>
                        {finalPct?.toLocaleString("fr-FR")}<span className="text-[12px]">%</span>
                      </p>
                      <p className="label-caps mt-1.5 text-ink-500">Après</p>
                    </div>
                  </div>

                  <textarea
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                    className="mt-3.5 h-44 w-full flex-1 resize-none rounded-xl border border-jade-400/25 bg-night-900/60 p-3.5 text-[12.5px] leading-relaxed text-ink-200 outline-none transition-colors placeholder:text-ink-500 focus:border-jade-400/50"
                  />

                  <div className="mt-3.5 flex flex-wrap gap-2">
                    <button onClick={() => void copyText()} className="btn-gold px-3.5 py-2 text-[12px]">
                      <IconCheck className="h-3.5 w-3.5" /> Copier
                    </button>
                    <button onClick={downloadTxt} className="btn-ghost px-3.5 py-2 text-[12px]">
                      <IconDownload className="h-3.5 w-3.5" /> TXT
                    </button>
                    <button onClick={() => void downloadDocx()} className="btn-ghost px-3.5 py-2 text-[12px]">
                      <IconDownload className="h-3.5 w-3.5" /> DOCX
                    </button>
                    <button onClick={reanalyze} className="btn-ghost px-3.5 py-2 text-[12px]">
                      <IconScan className="h-3.5 w-3.5" /> Ré-analyser
                    </button>
                    <button onClick={certify} className="btn-ghost px-3.5 py-2 text-[12px]">
                      <IconWand className="h-3.5 w-3.5" /> Rapport certifié
                    </button>
                  </div>

                  {report.partial && (
                    <div className="mt-3.5 flex items-start gap-2.5 rounded-lg border border-ember-400/35 bg-ember-400/[0.08] px-3 py-2.5">
                      <IconRefresh className="mt-0.5 h-4 w-4 shrink-0 text-ember-400" />
                      <p className="text-[12px] leading-snug text-ember-400">
                        <span className="font-semibold">Circuit breaker activé — </span>
                        {report.warning ?? "Humanisation partielle."}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border border-white/[0.07] bg-night-900/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="label-caps text-ink-500">Détails de l'exécution</p>
                      <span className="font-mono text-[10.5px] text-ink-400">
                        {report.viaApi
                          ? `LLM ${report.model ?? "AgweStream"} (Qwen) · DashScope · ${apiDuration !== null ? fmtInt(apiDuration) : "—"} ms · score recalculé par IA_DETECT v2.1`
                          : `${report.iterations_realisees} passe${report.iterations_realisees > 1 ? "s" : ""} · intensité ${report.config.intensite.toFixed(2)} · ${
                              report.engineMode === "worker" ? "Web Worker dédié" : "exécution par lots (repli)"
                            }${fallbackNote ? " · bascule hybride" : ""}`}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-4">
                      <Sparkline
                        points={[report.proba_initiale * 100, ...report.historique.map((h) => h.proba * 100), report.proba_finale * 100]}
                        color="#3ddc97"
                        className="h-12 w-36 shrink-0"
                      />
                      <p className="text-[12px] leading-relaxed text-ink-300">{report.decision}</p>
                    </div>
                    <p className="mt-2.5 border-t border-white/[0.06] pt-2.5 text-[10.5px] text-ink-500">
                      Rapport injecté dans l'état global — disponible pour le générateur de rapports PDF.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-ink-500/25 bg-night-900/30 px-6 py-14 text-center">
                  <div>
                    <IconWand className="mx-auto h-10 w-10 text-ink-500" />
                    <p className="mt-3 text-[13px] font-semibold text-ink-300">Le texte réécrit apparaîtra ici, en direct</p>
                    <p className="mx-auto mt-1.5 max-w-[320px] text-[12px] leading-relaxed text-ink-500">
                      Un clic déclenche le moteur hybride : flux SSE du modèle AgweStream, ou passes locales si
                      l'endpoint est injoignable.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </Reveal>
        </div>
      )}
    </>
  );
}
