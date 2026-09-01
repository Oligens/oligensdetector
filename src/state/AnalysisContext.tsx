import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { fmtInt, recentEntries, type GlobalResults, type RecentEntry, type ReportItem } from "../data";
import { analyzeText } from "../lib/detector/analysisRunner";
import type { FullAnalysisResult } from "../lib/detector/heuristicEngine";
import type { HumanizerReport } from "../lib/humanizer/humanizerUltimate";
import { prefersReducedMotion } from "../ui";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";

export type ScanPhase = "idle" | "running" | "done";
export interface AnalysisPayload { name: string; text: string; sizeKo: number; }
export interface LastScan { name: string; text: string; at: number; result: GlobalResults; entry: RecentEntry; }
interface Toast { id: number; title: string; body: string; }
interface AnalysisContextValue {
  phase: ScanPhase; progress: number; activeName: string | null; activeWords: number | null;
  startScan: (payload: AnalysisPayload, opts?: { redirectTo?: string }) => void; resetScan: () => void;
  results: GlobalResults | null; entries: RecentEntry[]; lastScan: LastScan | null; analysesCount: number;
  reports: ReportItem[]; reportsCount: number; addReportFromEntry: (entry: RecentEntry) => ReportItem;
  humanizerReport: HumanizerReport | null; saveHumanizerReport: (r: HumanizerReport) => void;
  reportEntry: RecentEntry | null; openReport: (entry: RecentEntry) => void; closeReport: () => void;
  toasts: Toast[]; toast: (title: string, body: string) => void; dismissToast: (id: number) => void;
}
const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function mapAnalysis(a: FullAnalysisResult, name: string): GlobalResults {
  const ia = Math.round(a.probabilite_IA * 100); const plagiat = a.plagiat_estime;
  const refs = a.references.total === 0 ? 0 : Math.min(12, Math.max(2, Math.round((a.references.douteuses / a.references.total) * 100)));
  const human = Math.max(0, 100 - Math.min(100, ia + plagiat + refs)); const passages = Math.max(ia >= 35 ? 2 : 0, Math.round(plagiat / 3));
  const top = a.rapport_detaille[0];
  const summary = `${fmtInt(a.statistiques.mots)} mots, ${fmtInt(a.statistiques.phrases)} phrases et ${fmtInt(a.statistiques.caracteres)} caractères analysés en ${fmtInt(a.processing.durationMs)} ms (${a.processing.mode === "worker" ? "Web Worker dédié" : "exécution directe"}). ${top ? `Facteur dominant : ${top.nom} (z = ${top.z_score >= 0 ? "+" : "−"}${Math.abs(top.z_score).toFixed(2)}). ` : ""}${a.references.total > 0 ? `${a.references.douteuses} référence${a.references.douteuses > 1 ? "s" : ""} sur ${a.references.total} n'${a.references.douteuses > 1 ? "ont" : "a"} pas pu être vérifiée${a.references.douteuses > 1 ? "s" : ""} (DOI introuvable).` : "Aucune référence bibliographique détectée dans le document."}`;
  const ciWidth = (a.intervalle_confiance_95[1] - a.intervalle_confiance_95[0]) * 100;
  return { fileName: name, ia, plagiat, refs, human, refsTotal: a.references.total, refsDouteuses: a.references.douteuses, passages, summary, origins: a.signature.modeles, confidence: a.confiance_analyse, confidenceInterval: [Math.round(a.intervalle_confiance_95[0] * 100), Math.round(a.intervalle_confiance_95[1] * 100)], decision: a.decision_precaution, engine: a.processing, language: a.langue, signatureNote: a.signature.note, topFactors: a.rapport_detaille, metrics: { precision: Math.round((ciWidth / 2) * 10) / 10, transitionDensity: Math.round(a.features.tauxTransitionStandard * 10000) / 10, burstiness: Math.round(a.features.burstiness * 100) / 100, mattr: Math.round(a.features.mattr * 100) / 100, originalite: a.features.scoreOriginalite, charEntropy: Math.round(a.features.perplexiteRelative * 100) / 100 } };
}

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user, subscription } = useAuth();
  const [phase, setPhase] = useState<ScanPhase>("idle"); const [progress, setProgress] = useState(0);
  const [activeName, setActiveName] = useState<string | null>(null); const [activeWords, setActiveWords] = useState<number | null>(null);
  const [results, setResults] = useState<GlobalResults | null>(null); const [entries, setEntries] = useState<RecentEntry[]>(recentEntries);
  const [lastScan, setLastScan] = useState<LastScan | null>(null); const [analysesCount, setAnalysesCount] = useState(0);
  const [reports, setReports] = useState<ReportItem[]>([]); const [humanizerReport, setHumanizerReport] = useState<HumanizerReport | null>(null);
  const [reportEntry, setReportEntry] = useState<RecentEntry | null>(null); const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0); const phaseRef = useRef(phase); const pendingRef = useRef<{ res: GlobalResults; payload: AnalysisPayload } | null>(null); const redirectRef = useRef<string | null>(null);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const toast = useCallback((title: string, body: string) => { const id = ++toastId.current; setToasts(t => [...t, { id, title, body }]); window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5200); }, []);
  const dismissToast = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), []);
  const reportsCount = reports.length;

  const checkQuota = useCallback(async (wordCount: number): Promise<boolean> => {
    if (!user) { toast("Connexion requise", "Connectez-vous pour lancer une analyse."); return false; }
    if (subscription.plan === "free" && wordCount > 2500) { toast("Limite du plan Free", "Le plan Free autorise 2 500 mots maximum par analyse. Passez à Pro pour supprimer cette limite."); return false; }
    if (!supabase) { toast("Configuration serveur manquante", "Configurez Supabase avant d'utiliser le moteur."); return false; }
    const { data, error } = await supabase.rpc("consume_analysis", { p_word_count: wordCount });
    if (error) { toast("Quota indisponible", error.message); return false; }
    const result = data as { allowed?: boolean; code?: string; max_words?: number; remaining?: number } | null;
    if (!result?.allowed) {
      if (result?.code === "WORD_LIMIT") toast("Limite de mots", "2 500 mots maximum avec le plan Free.");
      else if (result?.code === "DAILY_LIMIT") toast("Limite quotidienne", "Le plan Flash autorise 1 analyse par jour.");
      else toast("Analyse non autorisée", "Votre quota actuel ne permet pas cette analyse.");
      return false;
    }
    return true;
  }, [user, subscription.plan, toast]);

  const startScan = useCallback((payload: AnalysisPayload, opts?: { redirectTo?: string }) => {
    if (phaseRef.current === "running") { toast("Analyse en cours", "Veuillez patienter avant de lancer une nouvelle analyse."); return; }
    const wordCount = payload.text.trim() ? payload.text.trim().split(/\s+/).length : 0;
    redirectRef.current = opts?.redirectTo ?? null; setActiveName(payload.name); setActiveWords(wordCount); setProgress(3); setPhase("running");
    void (async () => {
      try {
        const allowed = await checkQuota(wordCount);
        if (!allowed) { setPhase("idle"); setProgress(0); setActiveName(null); setActiveWords(null); return; }
        const analysis = await analyzeText(payload.text, { language: "auto" });
        pendingRef.current = { res: mapAnalysis(analysis, payload.name), payload }; setProgress(100);
      } catch (err) { setPhase("idle"); setProgress(0); toast("Erreur d'analyse", err instanceof Error ? err.message : "Échec inattendu du moteur heuristique."); }
    })();
  }, [checkQuota, toast]);

  useEffect(() => { if (phase !== "running") return; const reduced = prefersReducedMotion(); const id = window.setInterval(() => setProgress(p => p < 90 ? Math.min(90, p + (reduced ? 30 : 1.3) + Math.random() * (reduced ? 30 : 2.1)) : p), reduced ? 80 : 110); return () => window.clearInterval(id); }, [phase]);
  useEffect(() => {
    if (phase !== "running" || progress < 100) return; const pending = pendingRef.current; if (!pending) return; pendingRef.current = null; const { res, payload } = pending; const now = new Date(); const lower = payload.name.toLowerCase();
    const entry: RecentEntry = { id: `e${Date.now()}`, name: payload.name, kind: lower.endsWith(".pdf") ? "pdf" : lower.endsWith(".docx") || lower.endsWith(".doc") ? "docx" : "txt", date: now.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }), time: now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), pages: Math.max(1, Math.round((res.engine?.words ?? 300) / 300)), ai: res.ia, plagiat: res.plagiat, fresh: true, sizeKo: payload.sizeKo, mots: res.engine?.words };
    const t = window.setTimeout(() => { setResults(res); setEntries(prev => [entry, ...prev].slice(0, 8)); setLastScan({ name: payload.name, text: payload.text, at: Date.now(), result: res, entry }); setAnalysesCount(c => c + 1); setPhase("done"); toast("Analyse terminée", `${payload.name} — risque IA ${res.ia} % · ${fmtInt(res.engine?.words ?? 0)} mots.`); const redirect = redirectRef.current; if (redirect) window.setTimeout(() => navigate(redirect), prefersReducedMotion() ? 200 : 1600); window.setTimeout(() => { setPhase("idle"); setProgress(0); setActiveName(null); setActiveWords(null); }, 2400); }, 420);
    return () => window.clearTimeout(t);
  }, [progress, phase, toast, navigate]);
  const resetScan = useCallback(() => { setPhase("idle"); setProgress(0); setActiveName(null); setActiveWords(null); }, []);
  const addReportFromEntry = useCallback((entry: RecentEntry): ReportItem => { const hex = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")).join(" "); const item: ReportItem = { id: `r${Date.now()}`, entry, hash: hex(), createdAt: `${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })} · ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` }; setReports(prev => [item, ...prev]); return item; }, []);
  const saveHumanizerReport = useCallback((r: HumanizerReport) => setHumanizerReport(r), []); const openReport = useCallback((entry: RecentEntry) => setReportEntry(entry), []); const closeReport = useCallback(() => setReportEntry(null), []);
  return <AnalysisContext.Provider value={{ phase, progress, activeName, activeWords, startScan, resetScan, results, entries, lastScan, analysesCount, reports, reportsCount, addReportFromEntry, humanizerReport, saveHumanizerReport, reportEntry, openReport, closeReport, toasts, toast, dismissToast }}>{children}</AnalysisContext.Provider>;
}
export function useAnalysis(): AnalysisContextValue { const ctx = useContext(AnalysisContext); if (!ctx) throw new Error("useAnalysis doit être utilisé dans <AnalysisProvider>."); return ctx; }
