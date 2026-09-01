import type { VercelRequest,VercelResponse } from "@vercel/node";
import { setSession,verifyPassword } from "../_lib/auth";
import { query } from "../_lib/db";
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=="POST") return res.status(405).json({error:"Méthode non autorisée"});
 try{
  const email=String(req.body?.email??"").trim().toLowerCase(); const password=String(req.body?.password??"");
  const r=await query<{id:string;password_hash:string;email_verified:boolean}>("SELECT id,password_hash,email_verified FROM users WHERE email=$1",[email]); const u=r.rows[0];
  if(!u||!(await verifyPassword(password,u.password_hash))) return res.status(401).json({error:"E-mail ou mot de passe incorrect."});
  if(!u.email_verified) return res.status(403).json({error:"Vérifiez votre e-mail avant de vous connecter.",code:"EMAIL_NOT_VERIFIED"});
  setSession(res,u.id); return res.status(200).json({user:{id:u.id,email}});
 }catch(e){console.error(e);return res.status(500).json({error:"Connexion impossible."});}
}
