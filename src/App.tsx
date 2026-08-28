import { useEffect } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Background, Header, NotFound, Sidebar } from "./components/Chrome";
import { IconCheck, IconClose, IconDownload } from "./components/icons";
import { ReportModal } from "./components/ScanAndReports";
import { generateResults } from "./data";
import { exportAnalysisReportPdf } from "./lib/verify/reportPdfs";
import AnalysesPage from "./pages/AnalysesPage";
import CorpusListPage, { CorpusDetailPage, CorpusScanPage } from "./pages/CorpusPages";
import DashboardPage, { ScanPage } from "./pages/DashboardPage";
import { HistoryPage, ReportsPage } from "./pages/HistoryReportsPages";
import HumanizerPage from "./pages/HumanizerPage";
import { BaseInstitutionnellePage, KnowledgeBasePage, SettingsPage, StatisticsPage } from "./pages/SystemPages";
import VerifyPage from "./pages/VerifyPage";
import { AnalysisProvider, useAnalysis } from "./state/AnalysisContext";
import { CorpusProvider } from "./state/CorpusContext";
import { prefersReducedMotion } from "./ui";

function Shell() {
  const { toasts, dismissToast, reportEntry, closeReport, results, toast } = useAnalysis();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [pathname]);

  const modalResults =
    reportEntry && reportEntry.name === results?.fileName && results
      ? results
      : { ...generateResults(reportEntry?.name ?? "Document.pdf"), fileName: reportEntry?.name ?? "Document.pdf" };

  return (
    <div className="relative min-h-screen">
      <Background />

      <div className="relative z-10">
        <Header />

        <div className="mx-auto flex max-w-[1600px]">
          <Sidebar />

          <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2.5">
        {toasts.map((t) => (
          <div key={t.id} className="toast-in glass pointer-events-auto flex items-start gap-3 rounded-xl p-3.5" style={{ borderColor: "rgba(232,189,85,0.3)" }}>
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-jade-400/40 bg-jade-400/10 text-jade-400">
              <IconCheck className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink-100">{t.title}</p>
              <p className="mt-0.5 truncate text-[12px] text-ink-400" title={t.body}>
                {t.body}
              </p>
            </div>
            <button
              onClick={() => dismissToast(t.id)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-500 transition-colors hover:bg-white/10 hover:text-ink-100"
              aria-label="Fermer la notification"
            >
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Modale de rapport partagée entre toutes les routes */}
      {reportEntry && (
        <ReportModal
          entry={reportEntry}
          results={modalResults}
          onClose={closeReport}
          onDownload={() => {
            exportAnalysisReportPdf(reportEntry, modalResults);
            toast("Téléchargement lancé", `Oligens_Rapport_${reportEntry.name.replace(/\.\w+$/, "").slice(0, 24)}.pdf — signé et horodaté.`);
            closeReport();
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AnalysisProvider>
        <CorpusProvider>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              {/* PILOTAGE */}
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/scan/new" element={<ScanPage />} />
              <Route path="/analyses" element={<AnalysesPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              {/* OUTILS */}
              <Route path="/humanizer" element={<HumanizerPage />} />
              <Route path="/references" element={<VerifyPage />} />
              <Route path="/database" element={<KnowledgeBasePage />} />
              <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
              {/* CORPUS — /corpus/scan (statique) prime sur /corpus/:id (dynamique) */}
              <Route path="/corpus" element={<CorpusListPage />} />
              <Route path="/corpus/scan" element={<CorpusScanPage />} />
              <Route path="/corpus/:id" element={<CorpusDetailPage />} />
              {/* SYSTÈME */}
              <Route path="/statistics" element={<StatisticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/base-institutionnelle" element={<BaseInstitutionnellePage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </CorpusProvider>
      </AnalysisProvider>
    </HashRouter>
  );
}
