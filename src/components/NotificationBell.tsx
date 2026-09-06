import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAnalysis } from "../state/AnalysisContext";
import { useAuth } from "../state/AuthContext";
import { IconBell } from "./icons";
type Notice={id:string;title:string;body:string;to:string;kind:"ok"|"warn"|"info"};
export default function NotificationBell(){
 const {entries,analysesCount}=useAnalysis(); const {subscription}=useAuth(); const navigate=useNavigate();
 const key="oligens-notifications-"+subscription.plan; const [read,setRead]=useState<string[]>([]); const [hidden,setHidden]=useState<string[]>([]); const [open,setOpen]=useState(false); const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{try{const v=JSON.parse(localStorage.getItem(key)||"{}");setRead(Array.isArray(v.read)?v.read:[]);setHidden(Array.isArray(v.hidden)?v.hidden:[])}catch{}},[key]);
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify({read,hidden}))}catch{}},[key,read,hidden]);
 useEffect(()=>{const f=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};document.addEventListener("mousedown",f);return()=>document.removeEventListener("mousedown",f)},[]);
 const notices=useMemo<Notice[]>(()=>{const limit=subscription.plan==="free"||subscription.plan==="flash"?1:subscription.plan==="pro"?20:100;const list:Notice[]=[]; const latest=entries[0];
 list.push({id:"welcome",title:"Votre espace est prêt",body:"Découvrez les outils disponibles dans votre espace Oligens.",to:"/dashboard",kind:"info"});
 list.push({id:"plan",title:"Abonnement "+subscription.plan,body:"Consultez votre formule, ses possibilités et ses limites.",to:"/subscriptions",kind:"ok"});
 if(analysesCount>=limit)list.unshift({id:"quota-"+subscription.plan+"-"+analysesCount,title:"Limite d’analyses atteinte",body:"Votre limite actuelle est atteinte. Consultez les formules disponibles pour continuer.",to:"/subscriptions",kind:"warn"});
 else if(analysesCount>=Math.max(1,Math.ceil(limit*.8)))list.unshift({id:"quota-near-"+subscription.plan+"-"+analysesCount,title:"Vous approchez de votre limite",body:analysesCount+" analyse(s) utilisée(s) sur "+limit+".",to:"/subscriptions",kind:"warn"});
 if(latest)list.unshift({id:"analysis-"+latest.id,title:"Analyse terminée",body:"« "+latest.name+" » est disponible dans votre historique.",to:"/analyses",kind:"ok"});
 return list.filter(n=>!hidden.includes(n.id)).slice(0,12)},[entries,analysesCount,subscription.plan,subscription.planLabel,hidden]);
 const unread=notices.filter(n=>!read.includes(n.id)).length;
 return <div className="relative" ref={ref}><button onClick={()=>setOpen(v=>!v)} className="relative grid h-10 w-10 place-items-center text-ink-300 hover:text-ink-100" aria-label="Notifications"><IconBell className="h-5 w-5"/>{unread>0&&<span className="absolute right-1.5 top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-gold-400 px-1 font-mono text-[9px] font-bold text-night-900">{unread>9?"9+":unread}</span>}</button>
 {open&&<div className="glass absolute right-0 top-[calc(100%+10px)] z-50 w-[min(380px,calc(100vw-2rem))] rounded-xl p-2 shadow-2xl"><div className="flex items-center justify-between px-3 py-2"><div><p className="text-[13px] font-semibold text-ink-100">Notifications</p><p className="text-[10.5px] text-ink-500">{unread} non lue(s)</p></div><div className="flex gap-1"><button onClick={()=>setRead(notices.map(n=>n.id))} className="px-2 py-1 text-[10.5px] text-gold-300">Tout lire</button><button onClick={()=>setHidden(notices.map(n=>n.id))} className="px-2 py-1 text-[10.5px] text-ink-400">Effacer</button></div></div>
 <div className="max-h-[420px] overflow-y-auto">{notices.length===0?<p className="px-3 py-8 text-center text-[12px] text-ink-500">Aucune notification.</p>:notices.map(n=><button key={n.id} onClick={()=>{setRead(v=>v.includes(n.id)?v:[...v,n.id]);setOpen(false);navigate(n.to)}} className={"flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-white/5 "+(read.includes(n.id)?"opacity-60":"bg-white/[0.025]")}><span className={"mt-1.5 h-2 w-2 shrink-0 rounded-full "+(n.kind==="warn"?"bg-ember-400":n.kind==="ok"?"bg-jade-400":"bg-gold-400")}/><span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold text-ink-100">{n.title}</span><span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-400">{n.body}</span></span></button>)}</div></div>}</div>
}