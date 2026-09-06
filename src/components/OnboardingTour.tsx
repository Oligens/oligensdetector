import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { IconCheck, IconChevron } from "./icons";
import { useAuth } from "../state/AuthContext";

const STORAGE_KEY = "oligens:onboarding:v1";

type Step = { title: string; body: string; selector?: string; route?: string; action?: string };

const STEPS: Step[] = [
  { title: "Bienvenue dans Oligens Detector", body: "Cette visite vous présente les fonctions essentielles. Vous pouvez avancer avec Suivant ou fermer le guide et le relancer depuis le menu Profil.", selector: "[data-tour=sidebar]" },
  { title: "Tableau de bord", body: "Votre point de départ : état du moteur, activité récente, indicateurs et accès rapide à un nouveau scan.", selector: "[data-tour=dashboard]", route: "/dashboard" },
  { title: "Analyses", body: "Retrouvez vos analyses, leurs résultats et les informations associées à chaque document.", selector: "[data-tour=analyses]", route: "/analyses" },
  { title: "Nouveau scan", body: "Importez un document, lancez l'analyse et suivez sa progression. Les quotas et droits du compte sont contrôlés côté serveur.", selector: "[data-tour=new-scan]", route: "/scan/new" },
  { title: "Base institutionnelle", body: "Accédez aux corpus et sources documentaires institutionnels. La gestion de la base s'effectue depuis cette section.", selector: "[data-tour=database]", route: "/base-institutionnelle" },
  { title: "Rapports", body: "Consultez les rapports générés. Les fonctions premium sont protégées par le palier d'abonnement actif.", selector: "[data-tour=reports]", route: "/reports" },
  { title: "Paramètres", body: "Configurez les règles, le moteur et les préférences de votre compte. Les modifications sont enregistrées dans Neon.", selector: "[data-tour=settings]", route: "/settings" },
  { title: "Abonnements", body: "Flash / Découverte, Oligens Pro et Oligens Gold débloquent progressivement les analyses, rapports, historiques, statistiques et fonctions institutionnelles selon votre formule.", selector: "[data-tour=subscriptions]", route: "/subscriptions" },
  { title: "Vous êtes prêt", body: "Commencez par un nouveau scan. Vous pourrez relancer cette visite depuis le bouton Aide du profil à tout moment." },
];

function getTarget(selector?: string) { return selector ? document.querySelector<HTMLElement>(selector) : null; }

export default function OnboardingTour() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const step = STEPS[index];

  const refreshTarget = () => {
    const el = getTarget(step.selector);
    setTarget(el);
    setRect(el?.getBoundingClientRect() ?? null);
  };

  useEffect(() => {
    if (!user) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "done") {
        const timer = window.setTimeout(() => setOpen(true), 700);
        return () => window.clearTimeout(timer);
      }
    } catch { setOpen(true); }
  }, [user]);

  useEffect(() => {
    if (!open) return;
    refreshTarget();
    const onResize = () => refreshTarget();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("scroll", onResize, true); };
  }, [open, index, location.pathname]);

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, "done"); } catch { /* non-blocking */ }
    setOpen(false);
  };

  const next = () => {
    if (index >= STEPS.length - 1) { finish(); return; }
    const nextIndex = index + 1;
    const nextStep = STEPS[nextIndex];
    setIndex(nextIndex);
    if (nextStep.route && location.pathname !== nextStep.route) navigate(nextStep.route);
  };

  const restart = () => { setIndex(0); setOpen(true); };

  useEffect(() => {
    const listener = () => restart();
    window.addEventListener("oligens:restart-onboarding", listener);
    return () => window.removeEventListener("oligens:restart-onboarding", listener);
  }, []);

  const style = useMemo(() => {
    if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" } as const;
    const width = Math.min(380, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    const preferredTop = rect.bottom + 14;
    const top = preferredTop + 230 < window.innerHeight ? preferredTop : Math.max(16, rect.top - 244);
    return { top, left, width } as const;
  }, [rect]);

  if (!open || !user) return null;
  const portal = document.body;
  if (!portal) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-night-950/65 backdrop-blur-[1px]" />
      {target && rect && <div className="pointer-events-none absolute rounded-xl border-2 border-gold-300 shadow-[0_0_0_9999px_rgba(2,4,10,.58),0_0_30px_rgba(232,189,85,.45)]" style={{ left: rect.left - 5, top: rect.top - 5, width: rect.width + 10, height: rect.height + 10 }} />}
      <section className="glass absolute rounded-2xl border border-gold-400/30 p-5 shadow-2xl" style={style} role="dialog" aria-modal="true" aria-labelledby="oligens-tour-title">
        <div className="flex items-start justify-between gap-4">
          <div><p className="label-caps text-gold-400">Visite guidée · {index + 1}/{STEPS.length}</p><h2 id="oligens-tour-title" className="mt-1 font-display text-lg font-bold text-ink-100">{step.title}</h2></div>
          <button type="button" onClick={finish} className="text-xs text-ink-500 hover:text-ink-100" aria-label="Fermer la visite">Ignorer</button>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-300">{step.body}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex gap-1.5">{STEPS.map((_, i) => <span key={i} className={`h-1.5 w-5 rounded-full ${i === index ? "bg-gold-400" : "bg-white/10"}`} />)}</div>
          <button type="button" onClick={next} className="btn-gold inline-flex items-center gap-2 px-4 py-2 text-[12px]">{index === STEPS.length - 1 ? <><IconCheck className="h-3.5 w-3.5" /> Terminer</> : <>Suivant <IconChevron className="h-3.5 w-3.5 -rotate-90" /></>}</button>
        </div>
      </section>
    </div>, portal
  );
}
