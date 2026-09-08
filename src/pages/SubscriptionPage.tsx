import { useEffect,useState } from "react";
import { Link } from "react-router-dom";
import { formatHTG,PLANS,type BillingPeriod,type PlanId } from "../lib/billing/plans";
import { useAuth } from "../state/AuthContext";

const ZAKAPRO_APP_KEY="zk_pub_z471ugkkmt04kzwv4lgo";
const ZAKAPRO_BASE="https://zakapro.vercel.app";
const ZAKAPRO_SDK=`${ZAKAPRO_BASE}/sdk/v4/zaka.js`;
const ZAKAPRO_PLANS:Record<Exclude<PlanId,"free">,Record<BillingPeriod,string>>={
  flash:{month:`${ZAKAPRO_BASE}/#/hub/app_vl2e7enq/plan_tjmlghni`,year:`${ZAKAPRO_BASE}/#/hub/app_vl2e7enq/plan_tjmlghni`,lifetime:`${ZAKAPRO_BASE}/#/hub/app_vl2e7enq/plan_tjmlghni`},
  pro:{month:`${ZAKAPRO_BASE}/#/hub/app_vl2e7enq/plan_5or3mqd7`,year:`${ZAKAPRO_BASE}/#/hub/app_vl2e7enq/plan_m1axkkf3`,lifetime:`${ZAKAPRO_BASE}/#/hub/app_vl2e7enq/plan_m1axkkf3`},
  gold:{month:`${ZAKAPRO_BASE}/#/hub/app_vl2e7enq/plan_m798n6nu`,year:`${ZAKAPRO_BASE}/#/hub/app_vl2e7enq/plan_3j3nkzqs`,lifetime:`${ZAKAPRO_BASE}/#/hub/app_vl2e7enq/plan_3j3nkzqs`}
};
const ZAKAPRO_AMOUNT:Record<Exclude<PlanId,"free">,Record<BillingPeriod,number>>={
  flash:{month:70,year:70,lifetime:70},
  pro:{month:250,year:2610,lifetime:2610},
  gold:{month:2500,year:26100,lifetime:26100}
};
const WARNING="⚠️ Attention : Le montant du dépôt MonCash / NatCash doit être exact au centime près. Ne dépassez pas et ne réduisez pas le montant indiqué, sinon votre abonnement ne sera pas validé automatiquement et vous risquez de perdre votre paiement.";

declare global { interface Window { ZakaPro?: { init: (options: Record<string,unknown>) => void } } }

export default function SubscriptionPage(){
 const{user,subscription}=useAuth();
 const[period,setPeriod]=useState<BillingPeriod>("month");
 const[plan,setPlan]=useState<Exclude<PlanId,"free">>("pro");
 const[provider,setProvider]=useState<"zakapro"|"moncash"|"natcash">("zakapro");
 const[phone,setPhone]=useState("");
 const[promo,setPromo]=useState("");
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState<string|null>(null);
 const[error,setError]=useState<string|null>(null);

 useEffect(()=>{
   const container="#zakapro-plans-sdk";
   const init=()=>{ try { window.ZakaPro?.init({appKey:ZAKAPRO_APP_KEY,apiBase:ZAKAPRO_BASE,container,methods:["moncash","natcash"],buttonClass:"zakapro-payment-button"}); } catch(e){ console.error("[ZakaPro SDK] init failed",e); } };
   if(window.ZakaPro){init();return}
   const script=document.createElement("script"); script.src=ZAKAPRO_SDK; script.async=true; script.onload=init; script.onerror=()=>console.error("[ZakaPro SDK] unable to load"); document.head.appendChild(script);
   return()=>{script.remove()};
 },[]);

 async function checkout(){
   if(!user){setError("Connectez-vous avant de souscrire.");return}
   if(promo.trim()){setError("Les codes promo ne sont pas compatibles avec le paiement ZakaPro direct. Utilisez le montant officiel affiché.");return}
   setBusy(true);setError(null);setMessage(null);
   try{
     const r=await fetch("/api/payments/create",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan,billingPeriod:period,provider,phone})});
     const d=await r.json(); if(!r.ok)throw new Error(d.error??"Création du paiement impossible.");
     setMessage(`Transaction ${d.transactionId??"créée"} pour ${formatHTG(Number(d.amountHTG??ZAKAPRO_AMOUNT[plan][period]))}. Redirection vers ZakaPro…`);
     window.location.assign(ZAKAPRO_PLANS[plan][period]);
   }catch(e){setError(e instanceof Error?e.message:"Erreur de paiement.")}finally{setBusy(false)}
 }

 return <div className="mx-auto max-w-6xl">
   <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="label-caps text-gold-400">ABONNEMENTS · HTG</p><h1 className="mt-1 font-display text-2xl font-bold text-ink-100">Choisir un plan</h1></div><Link to="/dashboard" className="btn-ghost px-3 py-2 text-xs">Retour</Link></div>
   <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-night-900 p-1">{([["month","Mois"],["year","Année"]] as const).map(([v,l])=><button type="button" key={v} onClick={()=>setPeriod(v)} className={`rounded-lg py-2 text-sm ${period===v?"bg-gold-400/15 text-gold-300":"text-ink-400"}`}>{l}</button>)}</div>
   <div className="grid gap-4 md:grid-cols-3">{(["flash","pro","gold"] as const).map(id=>{const p=PLANS[id];const amount=ZAKAPRO_AMOUNT[id][period];return <button type="button" key={id} onClick={()=>setPlan(id)} className={`text-left glass rounded-2xl border p-5 ${plan===id?"border-gold-400/60":"border-white/10"}`}><p className="font-display text-lg font-bold text-ink-100">{p.name}</p><p className="mt-2 font-mono text-xl text-gold-300">{formatHTG(amount)}</p><ul className="mt-4 space-y-2 text-xs text-ink-300">{p.features.map(f=><li key={f}>✓ {f}</li>)}</ul><div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/[0.08] p-2.5 text-[10.5px] leading-relaxed text-amber-200">{WARNING}</div></button>})}</div>
   <section className="glass mt-5 rounded-2xl p-5">
     <div className="mb-4 rounded-xl border border-gold-400/25 bg-gold-400/[0.06] p-3 text-xs leading-relaxed text-gold-200"><strong>Paiement sécurisé via ZakaPro.</strong> Le montant affiché ci-dessus est celui à respecter lors du dépôt MonCash / NatCash.</div>
     <div id="zakapro-plans-sdk" className="zakapro-plans my-4" data-zakapro-app-key={ZAKAPRO_APP_KEY} aria-label="Plans de paiement ZakaPro" />
     <div className="my-4 rounded-lg border border-amber-400/30 bg-amber-400/[0.08] p-3 text-xs leading-relaxed text-amber-200">{WARNING}</div>
     <div className="grid gap-4 md:grid-cols-2">
       <label className="text-xs font-semibold text-ink-400">MODE DE PAIEMENT<select value={provider} onChange={e=>setProvider(e.target.value as typeof provider)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-night-900 px-3 py-2.5 text-sm text-ink-100"><option value="zakapro">ZakaPro · MonCash / NatCash</option><option value="moncash">MonCash</option><option value="natcash">NatCash</option></select></label>
       <label className="text-xs font-semibold text-ink-400">NUMÉRO DE PAIEMENT<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+509…" inputMode="tel" className="mt-1.5 w-full rounded-lg border border-white/10 bg-night-900 px-3 py-2.5 text-sm text-ink-100"/></label>
     </div>
     <label className="mt-4 block text-xs font-semibold text-ink-400">CODE PROMO<input value={promo} onChange={e=>setPromo(e.target.value.toUpperCase())} placeholder="OLIGENS-XXXX" className="mt-1.5 w-full rounded-lg border border-white/10 bg-night-900 px-3 py-2.5 text-sm text-ink-100"/></label>
     <a href={ZAKAPRO_PLANS[plan][period]} target="_blank" rel="noopener noreferrer" data-zakapro-app-key={ZAKAPRO_APP_KEY} data-zakapro-plan-id={plan} className={`btn-gold mt-5 flex w-full justify-center px-4 py-3 ${busy?"pointer-events-none opacity-60":""}`} onClick={async e=>{e.preventDefault();await checkout()}}>{busy?"Préparation du paiement…":`Payer ${plan.toUpperCase()} · ${formatHTG(ZAKAPRO_AMOUNT[plan][period])}`}</a>
     <p className="mt-2 text-center text-[10.5px] text-amber-200">{WARNING}</p>
     {error&&<p className="mt-3 text-xs text-rose-300">{error}</p>}{message&&<p className="mt-3 text-xs text-jade-300">{message}</p>}
     <p className="mt-3 text-[11px] text-ink-500">Plan actuel : <span className="text-gold-300">{subscription.plan}</span>. Activation uniquement après confirmation du paiement.</p>
   </section>
   <p className="mt-3 text-[10px] text-ink-500">Clé publique ZakaPro : {ZAKAPRO_APP_KEY}. Les montants et liens utilisés correspondent aux plans officiels fournis pour cette application.</p>
   <style>{`.zakapro-plans{display:grid;gap:10px}.zakapro-payment-button{display:block;width:100%;margin:10px 0;padding:14px 18px;border:0;border-radius:10px;background:#EAB308;color:#090D16;font:800 14px system-ui,sans-serif;cursor:pointer}.zakapro-payment-button:hover{filter:brightness(1.06)}`}</style>
 </div>
}