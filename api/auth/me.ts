import type { VercelRequest,VercelResponse } from "@vercel/node";
import { getUser } from "../_lib/auth";
import { query } from "../_lib/db";
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=="GET") return res.status(405).json({error:"Méthode non autorisée"});
 try{const user=await getUser(req);if(!user)return res.status(401).json({user:null});
  await query("SELECT expire_subscriptions() ");
  const s=await query<{plan:string;status:string;billing_period:string|null;current_period_end:string|null;flash_started_at:string|null}>("SELECT plan,status,billing_period,current_period_end,flash_started_at FROM subscriptions WHERE user_id=$1",[user.id]);
  const sub=s.rows[0]??{plan:"free",status:"active",billing_period:null,current_period_end:null,flash_started_at:null};
  let flashAnalysesToday=0;if(sub.plan==="flash"){const u=await query<{count:string}>("SELECT count(*)::text AS count FROM usage_events WHERE user_id=$1 AND event_type='analysis' AND created_at>=date_trunc('day',now())",[user.id]);flashAnalysesToday=Number(u.rows[0]?.count??0);}
  return res.status(200).json({user,subscription:{plan:sub.plan,status:sub.status,period:sub.billing_period,currentPeriodEnd:sub.current_period_end,flashStartedAt:sub.flash_started_at,flashAnalysesToday}});
 }catch(e){console.error(e);return res.status(500).json({error:"Session impossible à charger."});}
}
