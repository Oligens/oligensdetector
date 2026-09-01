import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUser } from "../_lib/auth";
import { transaction } from "../_lib/db";

const prices = { flash: 65.85, pro: 250, gold: 2500 } as const;

type Plan = keyof typeof prices;
type BillingPeriod = "month" | "year" | "lifetime";
type Provider = "zakapro" | "moncash" | "natcash";

function price(plan: Plan, period: BillingPeriod) {
  if (plan === "flash") return 65.85;
  if (period === "month") return prices[plan];
  if (period === "year") return Math.round(prices[plan] * 12 * 0.87 * 100) / 100;

  const env = process.env[`LIFETIME_${plan.toUpperCase()}_HTG`];
  return env ? Number(env) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "Connexion requise." });

    const plan = String(req.body?.plan) as Plan;
    const billingPeriod = String(req.body?.billingPeriod) as BillingPeriod;
    const provider = String(req.body?.provider) as Provider;
    const phone = String(req.body?.phone ?? "").trim();
    const promoCode = String(req.body?.promoCode ?? "").trim().toUpperCase();

    if (!(plan in prices) || !["month", "year", "lifetime"].includes(billingPeriod) || !["zakapro", "moncash", "natcash"].includes(provider)) {
      return res.status(400).json({ error: "Paramètres de paiement invalides." });
    }
    if (!/^\+?509\d{8}$/.test(phone.replace(/[\s-]/g, ""))) {
      return res.status(400).json({ error: "Numéro haïtien invalide." });
    }

    const amount = price(plan, billingPeriod);
    if (amount === null) {
      return res.status(400).json({ error: "Le tarif À vie n'est pas encore configuré côté serveur." });
    }

    const tx = await transaction(async (client) => {
      let finalAmount = amount;
      let promoId: string | null = null;

      if (promoCode) {
        // Lock the promo row while validating it. Redemption is intentionally NOT
        // recorded yet: a pending/failed payment must not consume a user's promo.
        const promo = await client.query<{
          id: string;
          discount_percent: string;
          discount_amount_htg: string;
        }>(
          `SELECT id, discount_percent, COALESCE(discount_amount_htg, 0) AS discount_amount_htg
             FROM promo_codes
            WHERE code = $1
              AND active = true
              AND valid_from <= now()
              AND (valid_until IS NULL OR valid_until >= now())
              AND (max_uses IS NULL OR used_count < max_uses)
            FOR UPDATE`,
          [promoCode]
        );

        const p = promo.rows[0];
        if (p) {
          const alreadyRedeemed = await client.query(
            `SELECT 1 FROM promo_redemptions WHERE promo_code_id = $1 AND user_id = $2 LIMIT 1`,
            [p.id, user.id]
          );
          if (alreadyRedeemed.rowCount) {
            return Promise.reject(Object.assign(new Error("Ce code promo a déjà été utilisé par ce compte."), { code: "PROMO_ALREADY_USED" }));
          }

          promoId = p.id;
          finalAmount = Math.max(
            0,
            finalAmount * (1 - Number(p.discount_percent) / 100) - Number(p.discount_amount_htg)
          );
        }
      }

      const payment = await client.query<{ id: string }>(
        `INSERT INTO payments(
           user_id, provider, plan, billing_period, amount_htg, phone, promo_code, status, expires_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',now()+interval '30 minutes')
         RETURNING id`,
        [user.id, provider, plan, billingPeriod, finalAmount, phone, promoCode || null]
      );

      return {
        id: payment.rows[0].id,
        amountHTG: finalAmount,
        promoId,
      };
    });

    let checkoutUrl: string | undefined;
    const zakaproUrl = process.env.ZAKAPRO_API_URL;
    if (zakaproUrl && provider === "zakapro") {
      // Keep provider credentials server-side. Map these fields to the deployed
      // ZakaPro contract when the production endpoint is configured.
    }

    return res.status(201).json({
      transactionId: tx.id,
      amountHTG: tx.amountHTG,
      checkoutUrl,
      promoApplied: Boolean(tx.promoId),
    });
  } catch (error) {
    console.error("[payments/create] error", error);
    if (error instanceof Error && (error as Error & { code?: string }).code === "PROMO_ALREADY_USED") {
      return res.status(409).json({ error: error.message, code: "PROMO_ALREADY_USED" });
    }
    return res.status(503).json({ error: "Création du paiement temporairement indisponible.", code: "PAYMENT_SERVICE_UNAVAILABLE" });
  }
}
