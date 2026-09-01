import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { PlanId } from "../lib/billing/plans";

export interface SubscriptionState {
  plan: PlanId; status: "active"|"expired"|"cancelled"|"none"; period: "month"|"year"|"lifetime"|null;
  currentPeriodEnd: string|null; flashStartedAt: string|null; flashAnalysesToday: number;
}
const FREE_SUBSCRIPTION: SubscriptionState={plan:"free",status:"active",period:null,currentPeriodEnd:null,flashStartedAt:null,flashAnalysesToday:0};
interface AuthContextValue { session:Session|null; user:User|null; loading:boolean; subscription:SubscriptionState; signUp:(email:string,password:string)=>Promise<{needsVerification:boolean}>; signIn:(email:string,password:string)=>Promise<void>; signOut:()=>Promise<void>; refreshSubscription:()=>Promise<void>; }
const AuthContext=createContext<AuthContextValue|null>(null);
async function loadSubscription(userId:string):Promise<SubscriptionState>{
 if(!supabase)return FREE_SUBSCRIPTION;
 const {data,error}=await supabase.from("subscriptions").select("plan,status,billing_period,current_period_end,flash_started_at").eq("user_id",userId).maybeSingle();
 if(error||!data)return FREE_SUBSCRIPTION;
 const expired=data.status!=="active"||(data.current_period_end&&new Date(data.current_period_end)<=new Date())||(data.plan==="flash"&&data.flash_started_at&&Date.now()-new Date(data.flash_started_at).getTime()>=7*86400000);
 if(expired&&data.plan!=="free")return {...FREE_SUBSCRIPTION,status:"active"};
 let flashAnalysesToday=0;
 if(data.plan==="flash"){const day=new Date().toISOString().slice(0,10);const usage=await supabase.from("usage_events").select("id",{count:"exact",head:true}).eq("user_id",userId).eq("event_type","analysis").gte("created_at",`${day}T00:00:00Z`);flashAnalysesToday=usage.count??0;}
 return {plan:data.plan as PlanId,status:data.status,period:data.billing_period,currentPeriodEnd:data.current_period_end,flashStartedAt:data.flash_started_at,flashAnalysesToday};
}
export function AuthProvider({children}:{children:ReactNode}){const[session,setSession]=useState<Session|null>(null);const[loading,setLoading]=useState(true);const[subscription,setSubscription]=useState(FREE_SUBSCRIPTION);
 const refreshSubscription=useCallback(async()=>{if(!session?.user.id){setSubscription(FREE_SUBSCRIPTION);return;}setSubscription(await loadSubscription(session.user.id));},[session?.user.id]);
 useEffect(()=>{if(!supabase){setLoading(false);return;}let mounted=true;void supabase.auth.getSession().then(({data})=>{if(!mounted)return;setSession(data.session);setLoading(false);});const{data:listener}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setLoading(false);});return()=>{mounted=false;listener.subscription.unsubscribe();};},[]);
 useEffect(()=>{void refreshSubscription();},[refreshSubscription]);
 const signUp=useCallback(async(email:string,password:string)=>{if(!supabase)throw new Error("Supabase n'est pas configuré.");const{data,error}=await supabase.auth.signUp({email:email.trim().toLowerCase(),password,options:{emailRedirectTo:`${window.location.origin}${window.location.pathname}#/dashboard`}});if(error)throw error;return{needsVerification:!data.session};},[]);
 const signIn=useCallback(async(email:string,password:string)=>{if(!supabase)throw new Error("Supabase n'est pas configuré.");const{error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});if(error)throw error;},[]);
 const signOut=useCallback(async()=>{if(!supabase)return;const{error}=await supabase.auth.signOut();if(error)throw error;},[]);
 return <AuthContext.Provider value={useMemo(()=>({session,user:session?.user??null,loading,subscription,signUp,signIn,signOut,refreshSubscription}),[session,loading,subscription,signUp,signIn,signOut,refreshSubscription])}>{children}</AuthContext.Provider>;
}
export function useAuth():AuthContextValue{const ctx=useContext(AuthContext);if(!ctx)throw new Error("useAuth doit être utilisé dans <AuthProvider>.");return ctx;}
