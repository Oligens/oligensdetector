import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnalysisGrid, GlobalResult, OriginCard, RecentList } from "../components/AnalysisWidgets";
import { fmtInt } from "../data";
import { useAnalysis } from "../state/AnalysisContext";
import { PageHead, Pill, Reveal } from "../ui";
import { DatabaseCard, Footer } from "../components/FooterAndDatabase";
import { ReportsCard, UploadCard } from "../components/ScanAndReports";

export default function DashboardPage() {
  const { phase, progress, activeName, startScan, resetScan, results, entries, lastScan, openReport, toast } = useAnalysis();
  const navigate = useNavigate();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setClock(new Date()), 1000); return () => window.clearInterval(id); }, []);
  const today = clock.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const display = lastScan?.result ?? results;

  return <>
    <Reveal><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="label-caps text-gold-400">Console d'analyse documentaire</p><h1 className="mt-1.5 font-display text-xl font-bold tracking-wide text-ink-100 sm:text-2xl">Tableau de bord</h1></div><div className="flex flex-wrap items-center gap-3"><span className="font-mono text-[12px] capitalize text-ink-400">{today} · <span className="text-gold-300">{clock.toLocaleTimeString("fr-FR")}</span></span><button onClick={() => toast("Export indisponible", "Une synthèse sera disponible lorsque des analyses réelles seront enregistrées.")} className="btn-ghost px-3.5 py-2 text-[12.5px]">Exporter la synthèse</button></div></div></Reveal>
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-3"><div id="scan-zone"><Reveal><UploadCard phase={phase} progress={progress} fileName={activeName} onAnalyze={(p) => startScan(p)} onReset={resetScan} openTick={0} /></Reveal></div><DatabaseCard onAction={(m) => toast("Base institutionnelle", m)} /></div>
      <div className="space-y-5 xl:col-span-5">
        {display ? <><GlobalResult results={display}/><OriginCard results={display}/></> : <Reveal><section className="glass grid place-items-center rounded-2xl border-dashed px-6 py-14 text-center"><div><p className="font-display text-[15px] font-bold text-ink-100">Aucune analyse enregistrée</p><p className="mx-auto mt-2 max-w-[340px] text-[12.5px] leading-relaxed text-ink-400">Les analyses, scores et historiques apparaîtront ici uniquement après un scan réellement enregistré dans votre base Neon.</p><Link to="/scan/new" className="btn-gold mt-5 px-4 py-2.5 text-[13px]">Lancer un premier scan</Link></div></section></Reveal>}
        <RecentList entries={entries} onReport={openReport} onHistory={() => navigate("/history")} />
      </div>
      <div className="space-y-5 xl:col-span-4">{display ? <AnalysisGrid results={display}/> : <Reveal><section className="glass rounded-2xl border-dashed p-6 text-center"><p className="font-display text-[14px] font-semibold text-ink-200">Statistiques d'analyse</p><p className="mt-2 text-[12px] text-ink-500">Aucune donnée réelle à afficher.</p></section></Reveal>}<ReportsCard onExample={entries[0] ? () => openReport(entries[0]) : undefined} /></div>
    </div><Footer />
  </>;
}

export function ScanPage() {
  const { phase, progress, activeName, activeWords, startScan, resetScan, toast } = useAnalysis();
  return <><PageHead kicker="Module principal d'upload & de traitement de texte" title="Nouveau Scan" actions={<Link to="/dashboard" className="btn-ghost px-3.5 py-2 text-[12.5px]">← Retour au tableau de bord</Link>}/><div className="grid grid-cols-1 gap-5 xl:grid-cols-12"><Reveal className="xl:col-span-5"><UploadCard phase={phase} progress={progress} fileName={activeName} onAnalyze={(p) => startScan(p,{redirectTo:"/analyses"})} onReset={resetScan} openTick={0}/></Reveal><Reveal delay={120} className="xl:col-span-7"><section className="glass h-full rounded-2xl p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-[13px] font-semibold tracking-wide text-ink-100">Console moteur</h2><div className="flex items-center gap-1.5"><Pill tone="gold">Analyse locale</Pill><Pill tone="info">Résultat persisté Neon</Pill></div></div><div className="glass-soft rounded-xl p-4"><div className="flex items-center justify-between gap-3"><p className="text-[12.5px] font-semibold text-ink-200">{phase === "running" ? (activeName ?? "Document en cours…") : "En attente d'un document"}</p>{activeWords !== null && <span className="font-mono text-[11px] text-gold-300">{fmtInt(activeWords)} mots</span>}</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-night-700"><div className={`h-full rounded-full transition-[width] duration-200 ease-out ${phase === "done" ? "bg-jade-400" : "shimmer-bar"}`} style={{width:`${progress}%`}}/></div><p className="mt-4 text-[12px] leading-relaxed text-ink-400">Le résultat n'est ajouté à l'historique qu'après enregistrement réussi dans PostgreSQL.</p></div><div className="mt-4 flex flex-wrap gap-2"><Link to="/analyses" className="btn-ghost px-3.5 py-2 text-[12px]">Voir les analyses</Link><button onClick={() => toast("File d'attente vide", "Aucun document en attente de traitement.")} className="btn-ghost px-3.5 py-2 text-[12px]">File d'attente</button></div></section></Reveal></div></>;
}
