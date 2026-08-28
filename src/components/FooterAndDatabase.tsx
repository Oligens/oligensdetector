import type { ReactNode } from "react";
import { fmtInt } from "../data";
import { Reveal, SectionTitle, useCountUp } from "../ui";
import { IconChip, IconDatabase, IconHeadset, IconLogo, IconScale, IconShield } from "./icons";

/* ---------- Base institutionnelle (carte dashboard) ---------- */

export function DatabaseCard({ onAction }: { onAction: (message: string) => void }) {
  const docs = useCountUp(128437, 1400);
  const size = useCountUp(842, 1400);

  return (
    <Reveal delay={120}>
      <section className="glass card-hover rounded-2xl p-5">
        <SectionTitle
          icon={<IconDatabase className="h-4 w-4" />}
          title="Base Institutionnelle"
          right={
            <span className="inline-flex items-center gap-1.5 rounded-md border border-jade-400/25 bg-jade-400/[0.06] px-2 py-0.5">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-jade-400" />
              <span className="font-mono text-[10px] font-semibold text-jade-400">Connectée</span>
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-soft rounded-xl p-3.5">
            <p className="label-caps text-ink-500">Documents</p>
            <p className="mt-1.5 font-display text-[19px] font-bold leading-none text-ink-100">{fmtInt(docs)}</p>
          </div>
          <div className="glass-soft rounded-xl p-3.5">
            <p className="label-caps text-ink-500">Taille totale</p>
            <p className="mt-1.5 font-display text-[19px] font-bold leading-none text-ink-100">
              {(size / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
              <span className="ml-1 text-[12px] font-semibold text-gold-400">Go</span>
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {[
            { label: "Bibliothèque numérique", v: 52480 },
            { label: "HAL institutionnel", v: 36904 },
            { label: "Thèses en ligne (STAR)", v: 18230 },
            { label: "Revues internes OA", v: 20823 },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-ink-400">{s.label}</span>
              <span className="font-mono text-[11px] text-ink-300">{fmtInt(s.v)}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-white/[0.06] pt-3 font-mono text-[10.5px] text-ink-500">
          Dernière mise à jour : <span className="text-gold-300">il y a 1 h</span> · synchro OAI-PMH
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => onAction("Ouverture du gestionnaire de base — 128 437 documents, 4 corpus actifs.")} className="btn-ghost flex-1 px-3 py-2 text-[12.5px]">
            Gérer la base
          </button>
        </div>
      </section>
    </Reveal>
  );
}

/* ---------- Footer 4 colonnes ---------- */

const cols: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <IconShield className="h-5 w-5" />,
    title: "Sécurisé & Confidentiel",
    body: "Chiffrement AES-256 de bout en bout. Vos documents ne quittent jamais votre espace souverain et sont purgés après analyse.",
  },
  {
    icon: <IconChip className="h-5 w-5" />,
    title: "Technologie de pointe",
    body: "Moteur IA_DETECT v2.1 : 18 features stylométriques calibrées sur plus de 90 millions de documents académiques et scientifiques.",
  },
  {
    icon: <IconScale className="h-5 w-5" />,
    title: "Conforme RGPD",
    body: "Hébergement exclusivement européen, registre des traitements intégré et droit à l'effacement exerçable en un clic.",
  },
  {
    icon: <IconHeadset className="h-5 w-5" />,
    title: "Support 24/7",
    body: "Une équipe d'experts francophones répond en moins de 15 minutes, jour et nuit, week-ends et périodes de jurys inclus.",
  },
];

export function Footer() {
  return (
    <Reveal>
      <footer className="glass mt-8 overflow-hidden rounded-2xl">
        <div className="grid gap-8 p-6 sm:grid-cols-2 lg:grid-cols-4 lg:p-8">
          {cols.map((c) => (
            <div key={c.title} className="group">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-gold-400/25 bg-gold-400/[0.08] text-gold-300 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-gold-400/50 group-hover:shadow-[0_10px_30px_-10px_rgba(213,166,60,0.5)]">
                {c.icon}
              </span>
              <h3 className="mt-3.5 font-display text-[12.5px] font-semibold tracking-wide text-ink-100">{c.title}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-400">{c.body}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] bg-night-900/50 px-6 py-4 sm:flex-row lg:px-8">
          <div className="flex items-center gap-2.5">
            <IconLogo className="h-6 w-6" />
            <span className="text-[12px] text-ink-500">
              © 2026 <span className="font-semibold text-ink-300">Oligens Detector</span> — Tous droits réservés · v2.1.0
            </span>
          </div>
          <div className="flex items-center gap-4 text-[12px]">
            <a href="#" onClick={(e) => e.preventDefault()} className="text-ink-400 transition-colors hover:text-gold-300">Confidentialité</a>
            <a href="#" onClick={(e) => e.preventDefault()} className="text-ink-400 transition-colors hover:text-gold-300">CGU</a>
            <span className="inline-flex items-center gap-1.5 text-jade-400">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-jade-400" />
              Tous les systèmes opérationnels
            </span>
          </div>
        </div>
      </footer>
    </Reveal>
  );
}
