import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { fmtInt, type GlobalResults, type RecentEntry, type ReportItem } from "../data";
import { analyzeText } from "../lib/detector/analysisRunner";
import type { FullAnalysisResult } from "../lib/detector/heuristicEngine";
import type { HumanizerReport } from "../lib/humanizer/humanizerUltimate";
import { prefersReducedMotion } from "../ui";
import { useAuth } from "./AuthContext";

export type ScanPhase = "idle" | "running" | "done";
export interface AnalysisPayload { name: string; text: string; sizeKo: number; }
export interface LastScan { name: string; text: string; at: number; result: GlobalResults; entry: RecentEntry; analysisId?: string; }
interface Toast { id: number; title: string; body: string; }
interface AnalysisContextValue {
  phase: ScanPhase; progress: number; activeName: string | null; activeWords: number | null;
  startScan: (payload: AnalysisPayload, opts?: { redirectTo?: string }) => void; resetScan: () => void;
  results: GlobalResults | null; entries: RecentEntry[]; lastScan: LastScan | null; analysesCount: number;
  reports: ReportItem[]; reportsCount: number; addReportFromEntry: (entry: RecentEntry) => ReportItem;
  humanizerReport: HumanizerReport | null; saveHumanizerReport: (r: HumanizerReport) => void;
  reportEntry: RecentEntry | null; openReport: (entry: RecentEntry) => void; closeReport: () => void;
  toasts: Toast[]; toast: (title: string, body: string) => void; dismissToast: (id: number) => void; refreshData: () => Promise<void>;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function mapAnalysis(a: FullAnalysisResult, name: string): GlobalResults {
  const ia = Math.round(a.probabilite_IA * 100), plagiat = a.plagiat_estime;
  const refs = a.references.total === 0 ? 0 : Math.min(12, Math.max(2, Math.round((a.references.douteuses / a.references.total) * 100)));
  const human = Math.max(0, 100 - Math.min(100, ia + plagiat + refs));
  const passages = Math.max(ia >= 35 ? 2 : 0, Math.round(plagiat / 3));
  const top = a.rapport_detaille[0];
  const ciWidth = (a.intervalle_confiance_95[1] - a.intervalle_confiance_95[0]) * 100;
  return {
    fileName: name, ia, plagiat, refs, human, refsTotal: a.references.total, refsDouteuses: a.references.douteuses, passages,
    summary: `${fmtInt(a.statistiques.mots)} mots, ${fmtInt(a.statistiques.phrases)} phrases et ${fmtInt(a.statistiques.caracteres)} caractères analysés en ${fmtInt(a.processing.durationMs)} ms (${a.processing.mode === "worker" ? "Web Worker dédié" : "exécution directe"}). ${top ? `Facteur dominant : ${top.nom} (z = ${top.z_score >= 0 ? "+" : "−"}${Math.abs(top.z_score).toFixed(2)}). ` : ""}${a.references.total > 0 ? `${a.references.douteuses} référence${a.references.douteuses > 1 ? "s" : ""} sur ${a.references.total} n'${a.references.douteuses > 1 ? "ont" : "a"} pas pu être vérifiée${a.references.douteuses > 1 ? "s" : ""}.` : "Aucune référence bibliographique détectée dans le document."}`,
    origins: a.signature.modeles, confidence: a.confiance_analyse,
    confidenceInterval: [Math.round(a.intervalle_confiance_95[0] * 100), Math.round(a.intervalle_confiance_95[1] * 100)],
    decision: a.decision_precaution, engine: a.processing, language: a.langue, signatureNote: a.signature.note, topFactors: a.rapport_detaille,
    metrics: { precision: Math.round((ciWidth / 2) * 10) / 10, transitionDensity: Math.round(a.features.tauxTransitionStandard * 10000) / 10, burstiness: Math.round(a.features.burstiness * 100) / 100, mattr: Math.round(a.features.mattr * 100) / 100, originalite: a.features.scoreOriginalite, charEntropy: Math.round(a.features.perplexiteRelative * 100) / 100 },
  };
}

function rowToEntry(row: any): RecentEntry {
  const date = new Date(row.created_at);
  const lower = String(row.file_name ?? "").toLowerCase();
  const kind = lower.endsWith(".pdf") ? "pdf" : lower.endsWith(".docx") || lower.endsWith(".doc") ? "docx" : "txt";
  return { id: String(row.id), name: String(row.file_name), kind, date: date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }), time: date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), pages: Math.max(1, Math.ceil(Number(row.word_count ?? 0) / 300)), ai: Number(row.ai_score ?? 0), plagiat: Number(row.plagiarism_score ?? 0), sizeKo: row.file_size_kb == null ? undefined : Number(row.file_size_kb), mots: Number(row.word_count ?? 0) };
}
function rowToResult(row: any): GlobalResults | null {
  if (!row?.analysis_result) return null;
  try { return typeof row.analysis_result === "string" ? JSON.parse(row.analysis_result) : row.analysis_result as GlobalResults; } catch { return null; }
}

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [activeWords, setActiveWords] = useState<number | null>(null);
  const [results, setResults] = useState<GlobalResults | null>(null);
  const [entries, setEntries] = useState<RecentEntry[]>([]);
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const [analysesCount, setAnalysesCount] = useState(0);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [humanizerReport, setHumanizerReport] = useState<HumanizerReport | null>(null);
  const [reportEntry, setReportEntry] = useState<RecentEntry | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const runningRef = useRef(false);
  const runIdRef = useRef(0);
  const refreshIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const toast = useCallback((title: string, body: string) => {
    const id = ++toastId.current;
    setToasts((items) => [...items, { id, title, body }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const refreshData = useCallback(async () => {
    const refreshId = ++refreshIdRef.current;
    if (!user) { setEntries([]); setReports([]); setResults(null); setLastScan(null); setAnalysesCount(0); return; }
    try {
      const [aRes, rRes, sRes] = await Promise.all([
        fetch("/api/analyses?limit=100", { credentials: "include" }),
        fetch("/api/reports", { credentials: "include" }),
        fetch("/api/stats", { credentials: "include" }),
      ]);
      const [aData, rData, sData] = await Promise.all([aRes.json(), rRes.json(), sRes.json()]);
      if (refreshId !== refreshIdRef.current) return;
      if (!aRes.ok) throw new Error(aData.error ?? "Impossible de charger les analyses.");
      if (!rRes.ok) throw new Error(rData.error ?? "Impossible de charger les rapports.");
      if (!sRes.ok) throw new Error(sData.error ?? "Impossible de charger les statistiques.");
      const rows = Array.isArray(aData.analyses) ? aData.analyses : [];
      setEntries(rows.map(rowToEntry));
      setAnalysesCount(Number(sData.analysesCount ?? rows.length));
      setReports((Array.isArray(rData.reports) ? rData.reports : []).map((r: any) => ({ id: String(r.id), analysisId: r.analysis_id ?? undefined, entry: rowToEntry({ id: r.analysis_id ?? r.id, file_name: r.file_name ?? "Rapport", file_type: r.file_type ?? "txt", word_count: r.word_count ?? 0, ai_score: r.ai_score ?? 0, plagiarism_score: r.plagiarism_score ?? 0, created_at: r.analysis_created_at ?? r.created_at }), hash: String(r.report_data?.hash ?? ""), createdAt: new Date(r.created_at).toLocaleString("fr-FR") })));
      const latest = rows[0];
      if (latest) {
        const latestResult = rowToResult(latest);
        if (latestResult) setResults(latestResult);
        setLastScan((previous) => ({ name: String(latest.file_name), text: previous?.name === String(latest.file_name) ? previous.text : "", at: new Date(latest.created_at).getTime(), result: latestResult ?? previous?.result ?? ({} as GlobalResults), entry: rowToEntry(latest), analysisId: String(latest.id) }));
      } else if (!runningRef.current) {
        setLastScan(null);
        setResults(null);
      }
    } catch (error) {
      if (refreshId === refreshIdRef.current) toast("Données indisponibles", error instanceof Error ? error.message : "Impossible de charger les données.");
    }
  }, [toast, user]);

  useEffect(() => { void refreshData(); }, [refreshData]);
  useEffect(() => () => clearTimers(), [clearTimers]);

  const startScan = useCallback((payload: AnalysisPayload, opts?: { redirectTo?: string }) => {
    if (runningRef.current) { toast("Analyse en cours", "Veuillez patienter avant de lancer une nouvelle analyse."); return; }
    if (!user) { toast("Connexion requise", "Connectez-vous pour lancer une analyse."); return; }
    const text = payload.text.trim();
    const wordCount = text ? text.split(/\s+/).length : 0;
    if (wordCount < 30) { toast("Texte trop court", "Le détecteur a besoin d'au moins 30 mots pour produire un résultat fiable."); return; }

    clearTimers();
    const runId = ++runIdRef.current;
    runningRef.current = true;
    setActiveName(payload.name);
    setActiveWords(wordCount);
    setProgress(4);
    setPhase("running");
    const reduced = prefersReducedMotion();
    let progressTimer: number | undefined;

    const finishUi = () => {
      if (runId !== runIdRef.current) return;
      setPhase("idle"); setProgress(0); setActiveName(null); setActiveWords(null);
    };

    const run = async () => {
      try {
        progressTimer = window.setInterval(() => {
          if (runId !== runIdRef.current) return;
          setProgress((value) => value < 88 ? Math.min(88, value + (reduced ? 8 : 1.7) + Math.random() * (reduced ? 8 : 2.5)) : value);
        }, reduced ? 180 : 140);
        const analysis = await analyzeText(text, { language: "auto" });
        if (runId !== runIdRef.current) return;
        const mapped = mapAnalysis(analysis, payload.name);
        const save = await fetch("/api/analyses/create", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: payload.name, sizeKo: payload.sizeKo, result: mapped }),
        });
        const saved = await save.json().catch(() => ({}));
        if (!save.ok) throw Object.assign(new Error(saved.error ?? "Impossible d'enregistrer l'analyse."), { code: saved.code, maxWords: saved.maxWords });
        if (runId !== runIdRef.current) return;
        const row = saved.analysis;
        const entry: RecentEntry = row ? rowToEntry(row) : { id: `local-${Date.now()}`, name: payload.name, kind: "txt", date: new Date().toLocaleDateString("fr-FR"), time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), pages: Math.max(1, Math.ceil(wordCount / 300)), ai: mapped.ia, plagiat: mapped.plagiat, sizeKo: payload.sizeKo, mots: wordCount, fresh: true };
        setProgress(100);
        setResults(mapped);
        setEntries((items) => [entry, ...items.filter((item) => item.id !== entry.id)].slice(0, 100));
        setLastScan({ name: payload.name, text, at: Date.now(), result: mapped, entry, analysisId: row?.id ? String(row.id) : undefined });
        setAnalysesCount((count) => count + 1);
        setPhase("done");
        toast("Analyse terminée", `${payload.name} — risque IA ${mapped.ia} % · ${fmtInt(wordCount)} mots.`);
        void refreshData();
        if (opts?.redirectTo) timersRef.current.push(window.setTimeout(() => { if (runId === runIdRef.current) navigate(opts.redirectTo!); }, reduced ? 150 : 650));
        timersRef.current.push(window.setTimeout(finishUi, reduced ? 900 : 1800));
      } catch (error) {
        if (runId !== runIdRef.current) return;
        setPhase("idle"); setProgress(0); setActiveName(null); setActiveWords(null);
        const err = error as Error & { code?: string; maxWords?: number };
        const suffix = err.code === "WORD_LIMIT" && err.maxWords ? ` Limite : ${err.maxWords.toLocaleString("fr-FR")} mots.` : "";
        toast("Analyse bloquée", `${err.message ?? "Échec de l'analyse."}${suffix}`);
      } finally {
        if (progressTimer) window.clearInterval(progressTimer);
        if (runId === runIdRef.current) runningRef.current = false;
      }
    };
    void run();
  }, [clearTimers, navigate, refreshData, toast, user]);

  const resetScan = useCallback(() => {
    ++runIdRef.current;
    runningRef.current = false;
    clearTimers();
    setPhase("idle"); setProgress(0); setActiveName(null); setActiveWords(null);
  }, [clearTimers]);

  const addReportFromEntry = useCallback((entry: RecentEntry): ReportItem => {
    const id = `pending-${Date.now()}`;
    void (async () => {
      try {
        if (entry.id.startsWith("pending-") || entry.id.startsWith("local-")) { toast("Rapport indisponible", "Cette analyse n'est pas encore enregistrée dans votre compte."); return; }
        const response = await fetch("/api/reports", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId: entry.id, reportType: "pdf", reportData: results ?? {} }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Impossible de créer le rapport.");
        await refreshData();
        toast("Rapport enregistré", "Le rapport est maintenant conservé dans votre compte.");
      } catch (error) { toast("Rapport non enregistré", error instanceof Error ? error.message : "Erreur serveur."); }
    })();
    return { id, entry, hash: "", createdAt: new Date().toLocaleString("fr-FR"), analysisId: entry.id };
  }, [refreshData, results, toast]);

  const saveHumanizerReport = useCallback((report: HumanizerReport) => setHumanizerReport(report), []);
  const openReport = useCallback((entry: RecentEntry) => setReportEntry(entry), []);
  const closeReport = useCallback(() => setReportEntry(null), []);

  return <AnalysisContext.Provider value={{ phase, progress, activeName, activeWords, startScan, resetScan, results, entries, lastScan, analysesCount, reports, reportsCount: reports.length, addReportFromEntry, humanizerReport, saveHumanizerReport, reportEntry, openReport, closeReport, toasts, toast, dismissToast, refreshData }}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis doit être utilisé dans <AnalysisProvider>.");
  return ctx;
}
