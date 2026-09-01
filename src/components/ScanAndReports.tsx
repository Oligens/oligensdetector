import { useEffect, useMemo, useRef, useState } from "react";
import type { GlobalResults, RecentEntry } from "../data";
import { flaggedPassages, fmtInt, reportIncludes, scanStageAt, scanStages } from "../data";
import { exportAnalysisReportPdf } from "../lib/verify/reportPdfs";
import type { AnalysisPayload, ScanPhase } from "../state/AnalysisContext";
import { MeterBar, Pill, Reveal, SectionTitle } from "../ui";
import { IconCheck, IconClose, IconCloudUp, IconDownload, IconFile, IconFlag, IconInfo, IconLock, IconReport, IconScan } from "./icons";

const formats = ["PDF", "DOCX", "DOC", "TXT", "MD", "RTF"];
const ACCEPTED_EXT = ["pdf", "docx", "doc", "txt", "md", "rtf"];

export function UploadCard({ phase, progress, fileName, onAnalyze, onReset, openTick }: { phase: ScanPhase; progress: number; fileName: string | null; onAnalyze: (payload: AnalysisPayload) => void; onReset: () => void; openTick: number; }) {
  const [dragOver, setDragOver] = useState(false); const [tab, setTab] = useState<"fichier" | "texte">("fichier"); const [textValue, setTextValue] = useState("");
  const [extracting, setExtracting] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const inputRef = useRef<HTMLInputElement>(null); const busyRef = useRef(false);
  useEffect(() => { if (openTick > 0) inputRef.current?.click(); }, [openTick]);
  const stage = scanStageAt(progress); const wordCount = useMemo(() => textValue.trim() ? textValue.trim().split(/\s+/).length : 0, [textValue]);
  const startPasted = () => { if (wordCount < 30) return; const stamp = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h"); onAnalyze({ name: `Texte_colle_${stamp}.txt`, text: textValue, sizeKo: Math.max(1, Math.round(textValue.length / 1024)) }); };

  const handleFile = async (file: File) => {
    if (busyRef.current) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXT.includes(ext)) { setError(`Format « .${ext} » non pris en charge. Formats acceptés : ${formats.join(", ")}.`); return; }
    if (file.size > 25 * 1024 * 1024) { setError("Fichier trop volumineux (25 Mo max)."); return; }
    setError(null); busyRef.current = true; setExtracting(`Lecture de ${file.name}…`);
    try {
      const { extractTextFromFile } = await import("../lib/detector/textExtractor");
      const text = await extractTextFromFile(file, (p, total) => setExtracting(`Extraction du PDF — page ${p}/${total}…`));
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      if (words < 30) { setError(`Texte extrait trop court (${words} mots). Minimum requis : 30 mots.`); return; }
      setExtracting(null); onAnalyze({ name: file.name, text, sizeKo: Math.max(1, Math.round(file.size / 1024)) });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Erreur inconnue";
      setError(ext === "doc" ? "Les fichiers DOC anciens ne sont pas extractibles de façon fiable dans le navigateur. Convertissez le document en DOCX ou PDF puis réessayez." : `Extraction impossible. Le document est peut-être protégé/corrompu, ou le serveur d'extraction n'est pas configuré. ${detail}`);
    } finally { setExtracting(null); busyRef.current = false; }
  };
  const idle = phase === "idle";
  return (
    <section className="glass card-hover relative overflow-hidden rounded-2xl p-5">
      {phase === "running" && <div className="scanline pointer-events-none absolute inset-x-4 z-10 h-px bg-gradient-to-r from-transparent via-gold-300 to-transparent shadow-[0_0_18px_2px_rgba(232,189,85,0.55)]" />}
      <SectionTitle icon={<IconScan className="h-4 w-4" />} title="Nouvelle Analyse" right={<span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${phase === "running" ? "border-gold-400/40 bg-gold-400/10 text-gold-300" : "border-jade-400/25 bg-jade-400/5 text-jade-400"}`}>{phase === "running" ? "MOTEUR V2.1…" : "PRÊT"}</span>} />
      <input ref={inputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md,.rtf" className="hidden" onChange={(e) => { const f=e.target.files?.[0]; if(f) void handleFile(f); e.target.value=""; }} />
      {!idle ? <div className="glass-soft rounded-xl p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-gold-400/25 bg-gold-400/10 text-gold-300"><IconFile className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold text-ink-100" title={fileName ?? ""}>{fileName}</p><p className="font-mono text-[11px] text-gold-300">{phase === "done" ? "Analyse terminée ✓" : `${Math.round(progress)} % — ${scanStages[stage]}`}</p></div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-night-700"><div className={`h-full rounded-full transition-[width] duration-200 ease-out ${phase === "done" ? "bg-jade-400" : "shimmer-bar"}`} style={{width:`${progress}%`}} /></div><ul className="mt-4 space-y-1.5">{scanStages.map((s,i)=>{const done=phase==="done"||i<stage;const current=phase==="running"&&i===stage;return <li key={s} className="flex items-center gap-2.5 text-[12px]"><span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[9px] ${done?"border-jade-400/50 bg-jade-400/15 text-jade-400":current?"border-gold-400/60 bg-gold-400/15 text-gold-300":"border-white/10 text-ink-500"}`}>{done?<IconCheck className="h-2.5 w-2.5" />:current?<span className="live-dot h-1.5 w-1.5 rounded-full bg-gold-400" />:i+1}</span><span className={done?"text-ink-300":current?"font-medium text-gold-300":"text-ink-500"}>{s}</span></li>})}</ul><p className="mt-3 border-t border-white/[0.06] pt-2.5 font-mono text-[10px] leading-relaxed text-ink-500">IA_DETECT v2.1 · Voie 3 — heuristique de repli<br/>18 features stylométriques · Web Worker &gt; 10 000 mots</p>{phase==="done"&&<button onClick={onReset} className="btn-ghost mt-3 w-full px-3 py-2 text-[12.5px]"><IconScan className="h-4 w-4" /> Analyser un autre document</button>}</div> : <><div className="mb-3.5 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-night-900/60 p-1">{([{"key":"fichier",label:"Importer un fichier"},{"key":"texte",label:"Coller un texte"}] as const).map(m=><button key={m.key} onClick={()=>setTab(m.key)} className={`rounded-md px-2 py-1.5 text-[12px] font-semibold ${tab===m.key?"bg-gold-400/15 text-gold-300":"text-ink-400"}`}>{m.label}</button>)}</div>{tab==="fichier" ? <><div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files?.[0];if(f)void handleFile(f)}} onClick={()=>inputRef.current?.click()} className={`cursor-pointer rounded-xl border border-dashed p-6 text-center transition-colors ${dragOver?"border-gold-400 bg-gold-400/10":"border-white/15 hover:border-gold-400/40"}`}><IconCloudUp className="mx-auto h-8 w-8 text-gold-300" /><p className="mt-3 text-sm font-semibold text-ink-200">Déposez un document ici</p><p className="mt-1 text-xs text-ink-500">PDF · DOCX · DOC · TXT · MD · RTF · 25 Mo max</p>{extracting&&<p className="mt-3 font-mono text-xs text-gold-300">{extracting}</p>}</div>{error&&<div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-xs leading-relaxed text-rose-300"><strong>Import :</strong> {error}</div>}</> : <div><textarea value={textValue} onChange={e=>setTextValue(e.target.value)} placeholder="Collez ici au moins 30 mots…" className="min-h-44 w-full rounded-xl border border-white/10 bg-night-900/60 p-3 text-sm text-ink-100 outline-none focus:border-gold-400/50" /><div className="mt-2 flex items-center justify-between"><span className="font-mono text-[11px] text-ink-500">{fmtInt(wordCount)} mots</span><button disabled={wordCount<30} onClick={startPasted} className="btn-gold px-3 py-2 text-xs">Analyser</button></div></div>}</>}
    </section>
  );
}
