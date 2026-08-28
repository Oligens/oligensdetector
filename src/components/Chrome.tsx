import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { notifications } from "../data";
import { useAnalysis } from "../state/AnalysisContext";
import { Pill } from "../ui";
import {
  IconBell,
  IconChart,
  IconCheck,
  IconChevron,
  IconDatabase,
  IconFile,
  IconFolder,
  IconGrid,
  IconHistory,
  IconLogo,
  IconReport,
  IconScan,
  IconSettings,
  IconShield,
  IconWand,
} from "./icons";

/* ================= Fond ambiant ================= */

export function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Lignes géométriques dorées en dérive lente */}
      <div className="anim-drift-a absolute -left-[20%] top-[12%] h-px w-[140%] bg-gradient-to-r from-transparent via-gold-400/25 to-transparent blur-[1.5px]" />
      <div className="anim-drift-b absolute -left-[10%] top-[38%] h-px w-[130%] bg-gradient-to-r from-transparent via-gold-400/15 to-transparent blur-[2px]" />
      <div className="anim-drift-c absolute -left-[15%] top-[66%] h-px w-[140%] bg-gradient-to-r from-transparent via-azure-400/20 to-transparent blur-[2px]" />
      <div className="anim-drift-b absolute -left-[25%] top-[86%] h-px w-[150%] bg-gradient-to-r from-transparent via-gold-400/12 to-transparent blur-[1.5px]" />

      {/* Polygones filaires */}
      <svg className="spin-slow absolute -right-24 -top-24 h-[420px] w-[420px] opacity-[0.16]" viewBox="0 0 100 100" fill="none">
        <path d="M50 5 95 27.5v45L50 95 5 72.5v-45L50 5Z" stroke="#e8bd55" strokeWidth="0.35" />
        <path d="M50 18 82 34v32L50 82 18 66V34L50 18Z" stroke="#e8bd55" strokeWidth="0.25" />
        <circle cx="50" cy="50" r="3" fill="#e8bd55" opacity="0.6" />
      </svg>
      <svg className="absolute -bottom-16 -left-16 h-[300px] w-[300px] opacity-[0.1]" viewBox="0 0 100 100" fill="none">
        <path d="M50 8 92 29v42L50 92 8 71V29L50 8Z" stroke="#5b8def" strokeWidth="0.4" />
        <path d="M50 22 78 36v28L50 78 22 64V36L50 22Z" stroke="#5b8def" strokeWidth="0.3" />
      </svg>

      {/* Grille d'ingénieur */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(132,148,186,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(132,148,186,0.5) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 90% 70% at 50% 30%, black 30%, transparent 75%)",
        }}
      />

      {/* Grain + vignettage */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 180px 60px rgba(2,4,10,0.75)" }} />
    </div>
  );
}

/* ================= Header ================= */

const navItems = [
  { label: "Tableau de bord", to: "/dashboard" },
  { label: "Analyses", to: "/analyses" },
  { label: "Base institutionnelle", to: "/base-institutionnelle" },
  { label: "Rapports", to: "/reports" },
  { label: "Paramètres", to: "/settings" },
];

export function Header() {
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 lg:px-6">
        <NavLink to="/dashboard" className="group flex min-w-0 items-center gap-3">
          <IconLogo className="h-9 w-9 shrink-0 transition-transform duration-500 group-hover:rotate-[30deg]" />
          <span className="hidden min-w-0 sm:block">
            <span className="block font-display text-[13px] font-bold leading-tight tracking-[0.14em] text-ink-100">
              OLIGENS <span className="text-gold-400 gold-text-glow">DETECTOR</span>
            </span>
            <span className="block truncate text-[10.5px] font-medium tracking-[0.08em] text-ink-400">
              L'authenticité documentaire, certifiée
            </span>
          </span>
        </NavLink>

        <nav className="mx-auto hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors duration-300 ${
                  isActive ? "text-gold-300" : "text-ink-300 hover:text-ink-100"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  <span
                    className={`absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-gradient-to-r from-transparent via-gold-400 to-transparent transition-opacity duration-300 ${
                      isActive ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <div className="mr-1 hidden items-center gap-2 rounded-lg border border-jade-400/20 bg-jade-400/5 px-3 py-1.5 xl:flex">
            <span className="live-dot h-2 w-2 rounded-full bg-jade-400" />
            <span className="font-mono text-[11px] text-jade-400">Moteur v2.1 · en ligne</span>
          </div>

          <div className="relative" ref={bellRef}>
            <button
              onClick={() => setBellOpen((v) => !v)}
              className={`relative grid h-10 w-10 place-items-center rounded-lg border transition-colors duration-300 ${
                bellOpen ? "border-gold-400/40 bg-gold-400/10 text-gold-300" : "border-transparent text-ink-300 hover:bg-white/5 hover:text-ink-100"
              }`}
              aria-label="Notifications"
            >
              <IconBell className="h-5 w-5" />
              <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-gold-400 font-mono text-[9px] font-bold text-night-900">3</span>
            </button>
            {bellOpen && (
              <div className="glass toast-in absolute right-0 top-[calc(100%+10px)] w-[340px] rounded-xl p-2">
                <div className="flex items-center justify-between px-3 pb-2 pt-1.5">
                  <span className="label-caps text-ink-400">Notifications</span>
                  <span className="font-mono text-[10px] text-gold-300">3 nouvelles</span>
                </div>
                {notifications.map((n) => (
                  <button key={n.id} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.tone === "warn" ? "bg-ember-400" : n.tone === "ok" ? "bg-jade-400" : "bg-azure-400"}`} />
                    <span>
                      <span className="block text-[13px] font-semibold text-ink-100">{n.title}</span>
                      <span className="block text-[12px] leading-snug text-ink-400">{n.body}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-ink-500">{n.when}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className={`flex items-center gap-2.5 rounded-lg border py-1.5 pl-1.5 pr-2.5 transition-colors duration-300 ${
                profileOpen ? "border-gold-400/40 bg-gold-400/10" : "border-transparent hover:bg-white/5"
              }`}
            >
              <span className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-gold-300 to-gold-600 font-display text-[11px] font-bold text-night-900 shadow-[0_4px_16px_-4px_rgba(213,166,60,.6)]">
                AD
              </span>
              <span className="hidden text-left md:block">
                <span className="block text-[12.5px] font-semibold leading-tight text-ink-100">A. Delcourt</span>
                <span className="block text-[10.5px] leading-tight text-gold-400">Administrateur Institution</span>
              </span>
              <IconChevron className={`hidden h-4 w-4 text-ink-400 transition-transform duration-300 md:block ${profileOpen ? "rotate-180" : ""}`} />
            </button>
            {profileOpen && (
              <div className="glass toast-in absolute right-0 top-[calc(100%+10px)] w-60 rounded-xl p-2">
                <div className="border-b border-white/5 px-3 pb-3 pt-2">
                  <p className="text-[13px] font-semibold text-ink-100">Aurore Delcourt</p>
                  <p className="text-[11.5px] text-ink-400">a.delcourt@sorbonne-univ.fr</p>
                  <Pill tone="gold" className="mt-2">
                    <IconCheck className="h-3 w-3" /> Licence Institutionnelle
                  </Pill>
                </div>
                {[
                  { icon: <IconSettings className="h-4 w-4" />, label: "Préférences du compte", to: "/settings" },
                  { icon: <IconScan className="h-4 w-4" />, label: "Mes analyses", to: "/analyses" },
                  { icon: <IconCheck className="h-4 w-4" />, label: "Journal d'audit", to: "/history" },
                ].map((it) => (
                  <NavLink
                    key={it.label}
                    to={it.to}
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-ink-300 transition-colors hover:bg-white/5 hover:text-ink-100"
                  >
                    <span className="text-gold-400">{it.icon}</span> {it.label}
                  </NavLink>
                ))}
                <button className="mt-1 flex w-full items-center gap-2.5 rounded-lg border-t border-white/5 px-3 py-2.5 text-[13px] font-medium text-rose-400 transition-colors hover:bg-rose-400/10">
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/* ================= Sidebar ================= */

interface SideItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: string | number;
  badgeTone?: "gold" | "jade";
}

function SideLink({ item }: { item: SideItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-300 ${
          isActive
            ? "bg-gold-400/[0.12] text-gold-300 shadow-[inset_0_0_0_1px_rgba(232,189,85,0.3)]"
            : "text-ink-300 hover:bg-white/[0.04] hover:text-ink-100"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-400 shadow-[0_0_12px_rgba(232,189,85,0.8)] transition-all duration-300 ${
              isActive ? "opacity-100" : "opacity-0"
            }`}
          />
          <span className={`transition-transform duration-300 group-hover:translate-x-0.5 ${isActive ? "text-gold-300" : "text-ink-400 group-hover:text-gold-400"}`}>
            {item.icon}
          </span>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge !== undefined && (
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-bold ${
                item.badgeTone === "jade"
                  ? "bg-jade-400/15 text-jade-400"
                  : isActive
                    ? "bg-gold-400/25 text-gold-200"
                    : "bg-white/[0.06] text-ink-400"
              }`}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { analysesCount, reportsCount, phase } = useAnalysis();
  const sessionScans = analysesCount - 1248;
  const monthlyUsed = 172 + sessionScans;
  const quotaPct = Math.min(100, Math.round((monthlyUsed / 500) * 100));

  const pilotage: SideItem[] = [
    { to: "/dashboard", label: "Tableau de bord", icon: <IconGrid className="h-[18px] w-[18px]" />, badge: 12 },
    { to: "/analyses", label: "Analyses", icon: <IconFile className="h-[18px] w-[18px]" />, badge: analysesCount.toLocaleString("fr-FR") },
    { to: "/history", label: "Historique", icon: <IconHistory className="h-[18px] w-[18px]" /> },
    { to: "/reports", label: "Rapports", icon: <IconReport className="h-[18px] w-[18px]" />, badge: reportsCount },
  ];
  const outils: SideItem[] = [
    { to: "/humanizer", label: "Humaniseur IA", icon: <IconWand className="h-[18px] w-[18px]" />, badge: "Nouveau", badgeTone: "jade" },
    { to: "/references", label: "Vérif. plagiat & réf.", icon: <IconShield className="h-[18px] w-[18px]" /> },
    { to: "/database", label: "Base documentaire", icon: <IconDatabase className="h-[18px] w-[18px]" /> },
    { to: "/corpus", label: "Corpus & dossiers", icon: <IconFolder className="h-[18px] w-[18px]" /> },
  ];
  const systeme: SideItem[] = [
    { to: "/statistics", label: "Statistiques", icon: <IconChart className="h-[18px] w-[18px]" /> },
    { to: "/settings", label: "Paramètres", icon: <IconSettings className="h-[18px] w-[18px]" /> },
  ];

  const Group = ({ title, items }: { title: string; items: SideItem[] }) => (
    <div>
      <p className="label-caps mb-2 px-3 text-ink-500">{title}</p>
      <div className="space-y-1">
        {items.map((it) => (
          <SideLink key={it.to} item={it} />
        ))}
      </div>
    </div>
  );

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[248px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-white/[0.06] bg-night-900/40 px-3 py-6 backdrop-blur-xl lg:flex">
      <NavLink
        to="/scan/new"
        className={({ isActive }) =>
          `group relative flex items-center justify-center gap-2.5 overflow-hidden rounded-xl px-4 py-3.5 font-display text-[12px] font-bold tracking-[0.08em] transition-all duration-300 ${
            isActive ? "scale-[0.99]" : "hover:-translate-y-0.5"
          }`
        }
        style={{
          background: "linear-gradient(115deg,#f8e3a4 0%,#e8bd55 40%,#d5a63c 70%,#5b8def 150%)",
          boxShadow: "0 0 32px -8px rgba(213,166,60,0.65), 0 0 60px -24px rgba(91,141,239,0.55), inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      >
        <IconScan className="h-[18px] w-[18px] text-night-900 transition-transform duration-300 group-hover:scale-110" />
        <span className="text-night-900">NOUVEAU SCAN</span>
        {phase === "running" && <span className="live-dot h-2 w-2 rounded-full bg-night-900" />}
      </NavLink>

      <Group title="Pilotage" items={pilotage} />
      <Group title="Outils" items={outils} />
      <Group title="Système" items={systeme} />

      <div className="mt-auto rounded-xl border border-gold-400/20 bg-gold-400/[0.05] p-3.5">
        <p className="label-caps text-gold-400">Quota mensuel</p>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-night-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-600 via-gold-400 to-gold-300 transition-[width] duration-700"
            style={{ width: `${quotaPct}%` }}
          />
        </div>
        <p className="mt-2 font-mono text-[10.5px] text-ink-400">
          <span className="text-gold-300">{monthlyUsed}</span> / 500 analyses · {quotaPct} %
        </p>
      </div>
    </aside>
  );
}

/* ================= 404 ================= */

export function NotFound() {
  return (
    <div className="glass grid place-items-center rounded-2xl px-6 py-24 text-center">
      <IconLogo className="h-14 w-14 opacity-70" />
      <p className="mt-5 font-display text-4xl font-bold text-gold-300 gold-text-glow">404</p>
      <p className="mt-2 text-[14px] text-ink-300">Cette route n'existe pas dans la console Oligens.</p>
      <Link to="/dashboard" className="btn-gold mt-6 px-5 py-2.5 text-[13px]">
        Retour au tableau de bord
      </Link>
    </div>
  );
}
