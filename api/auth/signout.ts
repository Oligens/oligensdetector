import type { VercelRequest,VercelResponse } from "@vercel/node";
import { clearSession } from "../_lib/auth";
export default function handler(req:VercelRequest,res:VercelResponse){if(req.method!=="POST")return res.status(405).json({error:"Méthode non autorisée"});clearSession(res);return res.status(200).json({ok:true});}
