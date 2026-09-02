import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hashCode, setSession } from "../_lib/auth.js";
import { query } from "../_lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const code = String(req.body?.code ?? "").trim();
    if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "E-mail ou code invalide." });
    const r = await query<{ id: string; verification_code_hash: string | null; verification_expires_at: string | null }>(
      "SELECT id,verification_code_hash,verification_code_expires_at AS verification_expires_at FROM users WHERE email=$1",
      [email],
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: "Compte introuvable." });
    if (!u.verification_code_hash || !u.verification_expires_at || new Date(u.verification_expires_at) <= new Date()) return res.status(400).json({ error: "Code expiré. Demandez un nouveau code." });
    if (hashCode(code) !== u.verification_code_hash) return res.status(400).json({ error: "Code incorrect." });
    await query("UPDATE users SET email_verified=true,verification_code_hash=NULL,verification_code_expires_at=NULL,verification_attempts=0 WHERE id=$1", [u.id]);
    setSession(res, u.id);
    return res.status(200).json({ verified: true });
  } catch (error) {
    console.error("[auth/verify] error", error);
    return res.status(503).json({ error: "Vérification temporairement indisponible." });
  }
}
