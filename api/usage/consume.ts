import type { VercelRequest,VercelResponse } from "@vercel/node";
import { getUser } from "../_lib/auth";
import { query } from "../_lib/db";
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=="POST")return res.status(405).json({error:"Méthode non autorisée"});
 try{const user=await getUser(req);if(!user)return res.status(401).json({error:"Connexion requise."});const words=Number(req.body?.words??0);if(!Number.isInteger(words)||words<0)return res.status(400).json({error:"Nombre de mots invalide."});const r=await query<{allowed:boolean;plan:string;reason:string;analyses_today:number}>("SELECT * FROM consume_analysis($1,$2)",[user.id,words]);const out=r.rows[0];if(!out?.allowed){const msg=out?.reason==="free_word_limit_2500"?"Le plan Free est limité à 2 500 mots par analyse.":out?.reason==="flash_daily_limit_reached"?"Le plan Flash autorise une analyse par jour.":"Analyse non autorisée.";return res.status(403).json({allowed:false,reason:out?.reason,message:msg});}return res.status(200).json(out);}catch(e){console.error(e);return res.status(500).json({error:"Impossible de valider le quota."});}
}
