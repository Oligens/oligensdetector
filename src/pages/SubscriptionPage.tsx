import { useState } from "react";
import { Link } from "react-router-dom";
import { annualPrice, formatHTG, getPrice, PLANS, type BillingPeriod, type PlanId } from "../lib/billing/plans";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/AuthContext";

export default function SubscriptionPage() {
  const { user, subscription, refreshSubscription } = useAuth();
  const [period, setPeriod] = useState<BillingPeriod>("month"); const [plan, setPlan] = useState<Exclude<PlanId, "free">>("pro");
  const [provider, setProvider] = useState<"zakapro" | "moncash" | "natcash">("zakapro"); const [phone, setPhone] = useState(""); const [promo, setPromo] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  async function checkout() {
    if (!user || !supabase) { setError("Connectez-vous et configurez Supabase avant de souscrire."); return; }
    if (period === "lifetime") { setError("Le prix À vie doit être configuré côté serveur avant activation."); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession(); const token = sessionData.session?.access_token;
      if (!token) throw new Error("Session expirée. Reconnectez-vous.");
      const res = await fetch("/api/payments/create", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ plan, billingPeriod: period, provider, phone, promoCode: promo }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "Création du paiement impossible.");
      setMessage(data.checkoutUrl ? "Transaction créée. Redirection vers la passerelle…" : `Transaction ${data.transactionId} créée. Suivez les instructions de paiement.`);
      if (data.checkoutUrl) window.location.assign(data.checkoutUrl); await refreshSubscription();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur de paiement."); } finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-6xl"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="label-caps text-gold-400">ABONNEMENTS · HTG</p><h1 className="mt-1 font-display text-2xl font-bold text-ink-100">Choisir un plan</h1></div><Link to="/dashboard" className="btn-ghost px-3 py-2 text-xs">Retour</Link></div>
    <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-night-900 p-1"><button onClick={()=>setPeriod("month")} className={`rounded-lg py-2 text-sm ${period==="month"?"bg-gold-400/15 text-gold-300":"text-ink-400"}`}>Mois</button><button onClick={()=>setPeriod("year")} className={`rounded-lg py-2 text-sm ${period==="year"?"bg-gold-400/15 text-gold-300":"text-ink-400"}`}>Année · −13%</button><button onClick={()=>setPeriod("lifetime")} className={`rounded-lg py-2 text-sm ${period==="lifetime"?"bg-gold-400/15 text-gold-300":"text-ink-400"}`}>À vie</button></div>
    <div className="grid gap-4 md:grid-cols-3">{(["flash","pro","gold"] as const).map(id=>{const p=PLANS[id];const price=period==="year"?annualPrice(p.monthlyPrice):getPrice(id,period);return <button key={id} onClick={()=>setPlan(id)} className={`text-left glass rounded-2xl border p-5 ${plan===id?"border-gold-400/60":"border-white/10"}`}><p className="font-display text-lg font-bold text-ink-100">{p.name}</p><p className="mt-2 font-mono text-xl text-gold-300">{id==="flash"?formatHTG(65.85):formatHTG(price)}</p>{id!=="flash"&&<p className="text-xs text-ink-500">{period==="year"?"par an, remise 13%":"par mois"}</p>}<ul className="mt-4 space-y-2 text-xs text-ink-300">{p.features.map(f=><li key={f}>✓ {f}</li>)}</ul></button>})}</div>
    <section className="glass mt-5 rounded-2xl p-5"><div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-semibold text-ink-400">PASSERELLE<select value={provider} onChange={e=>setProvider(e.target.value as typeof provider)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-night-900 px-3 py-2.5 text-sm text-ink-100"><option value="zakapro">ZakaPro · MonCash / NatCash</option><option value="moncash">MonCash</option><option value="natcash">NatCash</option></select></label><label className="text-xs font-semibold text-ink-400">NUMÉRO DE PAIEMENT<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+509…" className="mt-1.5 w-full rounded-lg border border-white/10 bg-night-900 px-3 py-2.5 text-sm text-ink-100" /></label></div><label className="mt-4 block text-xs font-semibold text-ink-400">CODE PROMO<input value={promo} onChange={e=>setPromo(e.target.value.toUpperCase())} placeholder="OLIGENS-XXXX" className="mt-1.5 w-full rounded-lg border border-white/10 bg-night-900 px-3 py-2.5 text-sm text-ink-100" /></label><button disabled={busy||!phone||!user} onClick={checkout} className="btn-gold mt-5 w-full justify-center px-4 py-3">{busy?"Création de la transaction…":`Payer ${plan.toUpperCase()} · ${period}`}</button>{error&&<p className="mt-3 text-xs text-rose-300">{error}</p>}{message&&<p className="mt-3 text-xs text-jade-300">{message}</p>}<p className="mt-3 text-[11px] text-ink-500">Plan actuel : <span className="text-gold-300">{subscription.plan}</span>. Activation uniquement après confirmation serveur.</p></section>
  </div>;
}
