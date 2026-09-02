import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";
import crypto from "node:crypto";
import { query, transaction } from "../_lib/db";
import { hashCode, hashPassword, randomCode } from "../_lib/auth";

function mailer() {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD?.trim();
  if (!user || !pass) throw new Error("Gmail SMTP n'est pas configuré sur le serveur.");

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  try {
    if (!process.env.DATABASE_URL?.trim()) {
      return res.status(503).json({ error: "Base de données non configurée.", code: "DATABASE_NOT_CONFIGURED" });
    }

    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const firstName = String(req.body?.firstName ?? req.body?.first_name ?? "").trim() || null;
    const lastName = String(req.body?.lastName ?? req.body?.last_name ?? "").trim() || null;

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "E-mail invalide.", code: "INVALID_EMAIL" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères.", code: "WEAK_PASSWORD" });
    }

    const existing = await query<{ id: string }>("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1", [email]);
    if (existing.rowCount) return res.status(409).json({ error: "Un compte existe déjà avec cet e-mail.", code: "EMAIL_EXISTS" });

    const code = randomCode();
    const passwordHash = await hashPassword(password);
    const codeHash = hashCode(code);
    const userId = crypto.randomUUID();

    // The database transaction only writes database data. SMTP is deliberately
    // outside the transaction so a temporary Gmail outage cannot leave an open
    // transaction or cause an opaque server failure.
    await transaction(async (client) => {
      const exists = await client.query("SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1 FOR UPDATE", [email]);
      if (exists.rowCount) {
        const error = new Error("Un compte existe déjà avec cet e-mail.") as Error & { code?: string };
        error.code = "EMAIL_EXISTS";
        throw error;
      }

      await client.query(
        `INSERT INTO users (
          id, email, password_hash, first_name, last_name,
          email_verified, verification_code_hash, verification_code_expires_at,
          verification_attempts
        ) VALUES ($1,$2,$3,$4,$5,FALSE,$6,NOW()+INTERVAL '15 minutes',0)`,
        [userId, email, passwordHash, firstName, lastName, codeHash],
      );
    });

    try {
      const transport = mailer();
      await transport.verify();
      await transport.sendMail({
        from: process.env.GMAIL_SMTP_USER,
        to: email,
        subject: "Votre code de vérification Oligens Detector",
        text: `Votre code Oligens Detector est ${code}. Il expire dans 15 minutes.`,
        html: `<h2>Oligens Detector</h2><p>Votre code de vérification :</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>Ce code expire dans 15 minutes.</p>`,
      });
    } catch (mailError) {
      console.error("[auth/signup] SMTP error", mailError);
      return res.status(503).json({
        error: "Compte créé mais l'e-mail de vérification n'a pas pu être envoyé.",
        code: "EMAIL_SERVICE_UNAVAILABLE",
        canRetryVerification: true,
      });
    }

    return res.status(201).json({ needsVerification: true, userId });
  } catch (error) {
    console.error("[auth/signup] error", error);
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === "EMAIL_EXISTS") return res.status(409).json({ error: "Un compte existe déjà avec cet e-mail.", code });

    const message = error instanceof Error ? error.message : "Inscription impossible.";
    if (message.includes("DATABASE_URL") || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|connection/i.test(message)) {
      return res.status(503).json({ error: "Base de données temporairement indisponible.", code: "DATABASE_UNAVAILABLE" });
    }

    return res.status(500).json({ error: "Erreur interne pendant l'inscription.", code: "SIGNUP_INTERNAL_ERROR" });
  }
}
