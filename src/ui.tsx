import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ---------- Scroll reveal ---------- */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ---------- Animated counter ---------- */
export function useCountUp(target: number, duration = 1100): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/* ---------- Sparkline ---------- */
export function Sparkline({
  points,
  color = "#e8bd55",
  className = "",
}: {
  points: number[];
  color?: string;
  className?: string;
}) {
  const gid = useId().replace(/[:]/g, "");
  const w = 120;
  const h = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => [
    (i / (points.length - 1)) * w,
    h - 4 - ((p - min) / range) * (h - 10),
  ]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`overflow-visible ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`sg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${gid})`} className="spark-fill" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" pathLength={1} className="spark-path" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2.6" fill={color} className="spark-fill" />
    </svg>
  );
}

/* ---------- Animated bar ---------- */
export function MeterBar({
  value,
  color = "linear-gradient(90deg,#b08427,#e8bd55,#f2d37f)",
  height = 6,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
  const [w, setW] = useState(prefersReducedMotion() ? value : 0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className="w-full overflow-hidden rounded-full bg-night-700/80" style={{ height }}>
      <div
        className="bar-fill h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, w))}%`, background: color } as CSSProperties}
      />
    </div>
  );
}

/* ---------- Tones ---------- */
export type Tone = "ok" | "warn" | "bad" | "gold" | "info";

export const toneText: Record<Tone, string> = {
  ok: "text-jade-400",
  warn: "text-ember-400",
  bad: "text-rose-400",
  gold: "text-gold-300",
  info: "text-azure-300",
};

export const toneBg: Record<Tone, string> = {
  ok: "bg-jade-400/10 border-jade-400/30",
  warn: "bg-ember-400/10 border-ember-400/30",
  bad: "bg-rose-400/10 border-rose-400/30",
  gold: "bg-gold-400/10 border-gold-400/30",
  info: "bg-azure-400/10 border-azure-400/30",
};

export function Pill({
  tone,
  children,
  className = "",
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${toneBg[tone]} ${toneText[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ---------- Titles ---------- */
export function SectionTitle({
  icon,
  title,
  right,
}: {
  icon?: ReactNode;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-gold-400/25 bg-gold-400/10 text-gold-300">
            {icon}
          </span>
        )}
        <h2 className="font-display text-[13px] font-semibold tracking-wide text-ink-100">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function PageHead({
  kicker,
  title,
  actions,
}: {
  kicker: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <Reveal>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps text-gold-400">{kicker}</p>
          <h1 className="mt-1.5 font-display text-xl font-bold tracking-wide text-ink-100 sm:text-2xl">{title}</h1>
        </div>
        {actions}
      </div>
    </Reveal>
  );
}

/* ---------- KPI ---------- */
export function Kpi({
  label,
  value,
  unit,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Reveal>
      <div className="glass card-hover relative overflow-hidden rounded-2xl p-5">
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gold-500/[0.08] blur-2xl" />
        <p className="label-caps text-ink-500">{label}</p>
        <p className={`mt-2 font-display text-[24px] font-bold leading-none ${accent ? "text-gold-300 gold-text-glow" : "text-ink-100"}`}>
          {value}
          {unit && <span className="ml-1 text-[13px] font-semibold text-gold-400">{unit}</span>}
        </p>
        {sub && <p className="mt-1.5 font-mono text-[10.5px] text-ink-500">{sub}</p>}
      </div>
    </Reveal>
  );
}

/* ---------- Toggle ---------- */
export function Toggle({
  on,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition-opacity ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span>
        <span className="block text-[12.5px] font-medium text-ink-200">{label}</span>
        {hint && <span className="block text-[10.5px] text-ink-500">{hint}</span>}
      </span>
      <span
        className={`relative h-[22px] w-10 shrink-0 rounded-full border transition-colors duration-300 ${
          on ? "border-gold-400/60 bg-gold-400/25" : "border-white/15 bg-night-700"
        }`}
      >
        <span
          className={`absolute top-[2px] h-4 w-4 rounded-full transition-all duration-300 ${
            on ? "left-[21px] bg-gold-300 shadow-[0_0_10px_rgba(232,189,85,0.7)]" : "left-[3px] bg-ink-400"
          }`}
        />
      </span>
    </button>
  );
}
