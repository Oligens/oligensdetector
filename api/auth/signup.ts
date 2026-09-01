import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";
import { transaction } from "../_lib/db";
import { hashCode, hashPassword, randomCode } from "../_lib/auth";

function mailer() {
  const { GMAIL_SMTP_USER, GMAIL_SMTP_APP_PASSWORD } = process.env;
  if (!GMAIL_SMTP_USER || !GMAIL_SMTP_APP_PASSWORD) {
    throw new Error("Gmail SMTP n'est pas configuré sur le serveur.");
  }

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: GMAIL_SMTP_USER, pass: GMAIL_SMTP_APP_PASSWORD },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "E-mail invalide." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères." });
    }

    // Validate SMTP before creating the account. This prevents the old failure mode
    // where the user was inserted successfully and then signup returned HTTP 500
    // because Gmail SMTP was not configured.
    const transport = mailer();
    await transport.verify();

    const code = randomCode();
    const passwordHash = await hashPassword(password);
    const codeHash = hashCode(code);

    // Keep account creation and verification-email delivery in the same transaction.
    // If the email cannot be sent, the new user is rolled back instead of being left
    // in a permanent unverified state that blocks a second signup attempt.
    await transaction(async (client) => {
      const exists = await client.query("SELECT id FROM users WHERE email = $1", [email]);
      if (exists.rowCount) {
        const error = new Error("Un compte existe déjà avec cet e-mail.");
        (error as Error & { code?: string }).code = "EMAIL_EXISTS";
        throw error;
      }

      await client.query(
        `INSERT INTO users(
           email,
           password_hash,
           verification_code_hash,
           verification_expires_at,
           last_verification_sent_at
         ) VALUES($1,$2,$3,now()+interval '15 minutes',now())`,
        [email, passwordHash, codeHash]
      );

      await transport.sendMail({
        from: process.env.GMAIL_SMTP_USER,
        to: email,
        subject: "Votre code de vérification Oligens Detector",
        text: `Votre code Oligens Detector est ${code}. Il expire dans 15 minutes.`,
        html: `<h2>Oligens Detector</h2><p>Votre code de vérification :</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>Ce code expire dans 15 minutes.</p>`,
      });
    });

    return res.status(201).json({ needsVerification: true });
  } catch (error) {
    console.error("[auth/signup] error", error);

    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
    if (code === "EMAIL_EXISTS") {
      return res.status(409).json({ error: "Un compte existe déjà avec cet e-mail." });
    }

    const message = error instanceof Error ? error.message : "Inscription impossible.";
    if (
      message.includes("Gmail SMTP") ||
      message.includes("Invalid login") ||
      message.includes("Username and Password not accepted") ||
      message.includes("EAUTH")
    ) {
      return res.status(503).json({
        error: "Le service d'e-mail de vérification n'est pas correctement configuré.",
        code: "EMAIL_SERVICE_UNAVAILABLE",
      });
    }

    return res.status(503).json({
      error: "Service d'inscription temporairement indisponible.",
      code: "SIGNUP_SERVICE_UNAVAILABLE",
    });
  }
}
