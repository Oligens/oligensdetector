import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { transaction } from "../_lib/db";

function validSignature(req: VercelRequest, body: string) {
  const secret = process.env.ZAKAPRO_WEBHOOK_SECRET;
  if (!secret) return false;

  const provided = String(req.headers["x-zakapro-signature"] ?? "");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return provided.length === expected.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    if (!validSignature(req, raw)) return res.status(401).json({ error: "Signature invalide." });

    const p = typeof req.body === "object" ? req.body : JSON.parse(raw);
    const transactionId = String(p.transactionId ?? p.transaction_id ?? "");
    const externalId = String(p.externalTransactionId ?? p.external_transaction_id ?? p.id ?? "");
    const status = String(p.status ?? "").toLowerCase();

    if (!transactionId && !externalId) {
      return res.status(400).json({ error: "Identifiant transaction manquant." });
    }

    await transaction(async (client) => {
      const result = await client.query<{
        id: string;
        user_id: string;
        plan: "flash" | "pro" | "gold";
        billing_period: "month" | "year" | "lifetime";
        amount_htg: string;
        promo_code: string | null;
        status: string;
      }>(
        `SELECT id,user_id,plan,billing_period,amount_htg,promo_code,status
           FROM payments
          WHERE ($1::uuid IS NOT NULL AND id=$1::uuid)
             OR ($2::text <> '' AND external_transaction_id=$2)
          FOR UPDATE`,
        [transactionId || null, externalId]
      );

      const payment = result.rows[0];
      if (!payment) throw new Error("Transaction introuvable");

      if (["paid", "success", "completed"].includes(status)) {
        await client.query(
          `UPDATE payments
              SET status='paid',
                  external_transaction_id=COALESCE($2,external_transaction_id),
                  provider_payload=$3::jsonb,
                  paid_at=COALESCE(paid_at,now())
            WHERE id=$1`,
          [payment.id, externalId || null, JSON.stringify(p)]
        );

        const end =
          payment.billing_period === "month"
            ? "1 month"
            : payment.billing_period === "year"
              ? "1 year"
              : payment.plan === "flash"
                ? "7 days"
                : "100 years";

        await client.query(
          `UPDATE subscriptions
              SET plan=$2,
                  status='active',
                  billing_period=$3,
                  current_period_start=now(),
                  current_period_end=CASE WHEN $3='lifetime' THEN NULL ELSE now()+$4::interval END,
                  flash_started_at=CASE WHEN $2='flash' THEN now() ELSE NULL END,
                  flash_daily_limit=CASE WHEN $2='flash' THEN 1 ELSE NULL END
            WHERE user_id=$1`,
          [payment.user_id, payment.plan, payment.billing_period, end]
        );

        // A promo is consumed only after the payment is actually paid. This makes
        // failed/expired payments retryable and keeps used_count consistent.
        if (payment.promo_code) {
          const promo = await client.query<{ id: string }>(
            `SELECT id
               FROM promo_codes
              WHERE code=$1
              FOR UPDATE`,
            [payment.promo_code]
          );
          if (promo.rows[0]) {
            const redemption = await client.query(
              `INSERT INTO promo_redemptions(promo_code_id,user_id,payment_id)
               VALUES($1,$2,$3)
               ON CONFLICT(promo_code_id,user_id) DO NOTHING
               RETURNING id`,
              [promo.rows[0].id, payment.user_id, payment.id]
            );
            if (redemption.rowCount) {
              await client.query(
                `UPDATE promo_codes SET used_count=used_count+1 WHERE id=$1`,
                [promo.rows[0].id]
              );
            }
          }
        }
      } else if (["failed", "cancelled", "expired"].includes(status)) {
        await client.query(
          `UPDATE payments
              SET status=$2,
                  external_transaction_id=COALESCE($3,external_transaction_id),
                  provider_payload=$4::jsonb
            WHERE id=$1`,
          [payment.id, status, externalId || null, JSON.stringify(p)]
        );
      } else {
        throw new Error("Statut de paiement inconnu");
      }
    });

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("[payments/webhook] error", error);
    return res.status(503).json({ error: "Webhook non traité.", code: "PAYMENT_WEBHOOK_UNAVAILABLE" });
  }
}
