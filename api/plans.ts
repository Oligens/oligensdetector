import type { VercelRequest,VercelResponse } from "@vercel/node";
import { getUser } from "./_lib/auth.js";
import { query } from "./_lib/db.js";
export default async function handler(req:VercelRequest,res:VercelResponse){if(req.method!=="GET")return res.status(405).json({error:"Méthode non autorisée"});try{const user=await getUser(req);if(!user)return res.status(401).json({error:"Authentification requise."});const r=await query(`SELECT plan,billing_period,price_htg,discount_percent,is_active FROM plan_prices WHERE is_active=true ORDER BY plan,billing_period`);return res.status(200).json({plans:r.rows})}catch(e){console.error("[plans] error",e);return res.status(503).json({error:"Tarifs temporairement indisponibles.",code:"PLANS_UNAVAILABLE"})}}
