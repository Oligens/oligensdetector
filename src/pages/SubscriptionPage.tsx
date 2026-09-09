import { useState } from "react";
import { Link } from "react-router-dom";
import { formatHTG, PLANS, type BillingPeriod, type PlanId } from "../lib/billing/plans";
import { useAuth } from "../state/AuthContext";

const ZAKAPRO_APP_KEY = "zk_pub_z471ugkkmt04kzwv4lgo";
const ZAKAPRO_BASE = "https://zakapro.vercel.app";
const ZAKAPRO_HUB = `${ZAKAPRO_BASE}/#/hub/app_vl2e7enq`;

const ZAKAPRO_PLANS: Record<Exclude<PlanId, "free">, Record<BillingPeriod, string>> = {
  flash: { month: `${ZAKAPRO_HUB}/plan_izygpex6`, year: `${ZAKAPRO_HUB}/plan_izygpex6`, lifetime: `${ZAKAPRO_HUB}/plan_izygpex6` },
  pro: { month: `${ZAKAPRO_HUB}/plan_3ep9gvnq`, year: `${ZAKAPRO_HUB}/plan_mldfdizu`, lifetime: `${ZAKAPRO_HUB}/plan_mldfdizu` },
  gold: { month: `${ZAKAPRO_HUB}/plan_5lt2d1w9`, year: `${ZAKAPRO_HUB}/plan_3j3nkzqs`, lifetime: `${ZAKAPRO_HUB}/plan_3j3nkzqs` },
};

const ZAKAPRO_AMOUNT: Record<Exclude<PlanId, "free">, Record<BillingPeriod, number>> = {
  flash: { month: 70, year: 70, lifetime: 70 },
  pro: { month: 250, year: 2610, lifetime: 2610 },
  gold: { month: 2500, year: 26100, lifetime: 26100 },
};

const WARNING = "⚠️ Attention : le montant MonCash / NatCash doit être exactement celui affiché. Toute différence peut empêcher la validation automatique.";

export default function SubscriptionPage() {
  const { user, subscription } = useAuth();
  const [period, setPeriod] = useState<BillingPeriod>("month");
  const [plan, setPlan] = useState<Exclude<PlanId, "free">>("pro");
  const [error, setError] = useState<string | null>(null);
  const selectedUrl = ZAKAPRO_PLANS[plan][period];
  const selectedAmount = ZAKAPRO_AMOUNT[plan][period];

  function openCheckout() {
    if (!user) { setError("Connectez-vous avant de souscrire."); return; }
    setError(null);
    window.location.assign(selectedUrl);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="label-caps text-gold-400">ABONNEMENTS · HTG</p><h1 className="mt-1 font-display text-2xl font-bold text-ink-100">Choisir un plan</h1></div><Link to="/dashboard" className="btn-ghost px-3 py-2 text-xs">Retour</Link></div>
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-night-900 p-1">{([["month","Mois"],["year","Année"]] as const).map(([value,label])=><button type="button" key={value} onClick={()=>setPeriod(value)} className={`rounded-lg py-2 text-sm ${period===value?"bg-gold-400/15 text-gold-300":"text-ink-400"}`}>{label}</button>)}</div>
      <div className="grid gap-4 md:grid-cols-3">{(["flash","pro","gold"] as const).map(id=>{const definition=PLANS[id];const amount=ZAKAPRO_AMOUNT[id][period];return <button type="button" key={id} onClick={()=>setPlan(id)} className={`text-left glass rounded-2xl border p-5 ${plan===id?"border-gold-400/60":"border-white/10"}`}><p className="font-display text-lg font-bold text-ink-100">{definition.name}</p><p className="mt-2 font-mono text-xl text-gold-300">{formatHTG(amount)}</p><ul className="mt-4 space-y-2 text-xs text-ink-300">{definition.features.map(feature=><li key={feature}>✓ {feature}</li>)}</ul><div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/[0.08] p-2.5 text-[10.5px] leading-relaxed text-amber-200">{WARNING}</div></button>;})}</div>
      <section className="glass mt-5 rounded-2xl p-5">
        <div className="mb-4 rounded-xl border border-gold-400/25 bg-gold-400/[0.06] p-3 text-xs leading-relaxed text-gold-200"><strong>Paiement sécurisé via ZakaPro.</strong> Le checkout hébergé demande les informations client puis crée l'intention avec le planId sélectionné. Le montant envoyé par le navigateur n'est jamais la source de vérité.</div>
        <div className="rounded-xl border border-white/10 bg-night-950/60 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Plan sélectionné</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><p className="font-display text-lg font-bold text-ink-100">{PLANS[plan].name}</p><p className="text-sm text-gold-300">{formatHTG(selectedAmount)}</p></div><span className="rounded-full border border-jade-400/30 bg-jade-400/10 px-3 py-1 text-[11px] font-semibold text-jade-300">ZakaPro · sécurisé</span></div></div>
        <button type="button" onClick={openCheckout} className="btn-gold mt-5 flex w-full justify-center px-4 py-3">Payer {plan.toUpperCase()} · {formatHTG(selectedAmount)}</button>
        <p className="mt-2 text-center text-[10.5px] text-amber-200">{WARNING}</p>{error&&<p className="mt-3 text-xs text-rose-300">{error}</p>}
        <p className="mt-3 text-[11px] text-ink-500">Plan actuel : <span className="text-gold-300">{subscription.plan}</span>. Activation uniquement après confirmation du paiement par ZakaPro.</p>
        <p className="mt-3 text-[10px] text-ink-500">Clé publique ZakaPro : {ZAKAPRO_APP_KEY}</p>
      </section>
    </div>
  );
}
