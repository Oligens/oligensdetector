import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setSession, verifyPassword } from "../_lib/auth";
import { query } from "../_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  try {
    if (!process.env.DATABASE_URL?.trim()) {
      console.error("[auth/signin] DATABASE_URL is missing");
      return res.status(503).json({ error: "Base de données non configurée.", code: "DATABASE_NOT_CONFIGURED" });
    }
    if (!process.env.AUTH_SECRET?.trim()) {
      console.error("[auth/signin] AUTH_SECRET is missing");
      return res.status(503).json({ error: "Authentification non configurée.", code: "AUTH_SECRET_NOT_CONFIGURED" });
    }

    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email) || !password) {
      return res.status(400).json({ error: "E-mail ou mot de passe invalide." });
    }

    const result = await query<{ id: string; password_hash: string; email_verified: boolean }>(
      "SELECT id,password_hash,email_verified FROM users WHERE email=$1",
      [email]
    );
    const user = result.rows[0];

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: "E-mail ou mot de passe incorrect." });
    }
    if (!user.email_verified) {
      return res.status(403).json({ error: "Vérifiez votre e-mail avant de vous connecter.", code: "EMAIL_NOT_VERIFIED" });
    }

    setSession(res, user.id);
    return res.status(200).json({ user: { id: user.id, email } });
  } catch (error) {
    console.error("[auth/signin] error", error);
    const message = error instanceof Error ? error.message : "Connexion impossible.";
    if (message.includes("AUTH_SECRET")) {
      return res.status(503).json({ error: "Authentification non configurée sur le serveur.", code: "AUTH_SECRET_NOT_CONFIGURED" });
    }
    return res.status(503).json({ error: "Base de données ou service d'authentification indisponible.", code: "AUTH_DATABASE_UNAVAILABLE" });
  }
}
