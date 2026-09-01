import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZAKAPRO_API_URL = process.env.ZAKAPRO_API_URL;
const ZAKAPRO_API_KEY = process.env.ZAKAPRO_API_KEY;

const prices = { flash: 65.85, pro: 250, gold: 2500 } as const;
type Plan = keyof typeof prices;
type Period = "month" | "year" | "lifetime";
type Provider = "zakapro" | "moncash" | "natcash";

function send(res: VercelResponse, status: number, body: unknown) { res.status(status).setHeader("Content-Type", "application/json").json(body); }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return send(res, 500, { error: "Server billing is not configured." });

  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return send(res, 401, { error: "Authentification requise." });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return send(res, 401, { error: "Session invalide." });

  const body = (req.body ?? {}) as { plan?: Plan; billingPeriod?: Period; provider?: Provider; phone?: string; promoCode?: string };
  const plan = body.plan;
  const period = body.billingPeriod;
  const provider = body.provider ?? "zakapro";
  if (!plan || !(plan in prices) || !period || !["month", "year", "lifetime"].includes(period)) return send(res, 400, { error: "Plan ou période invalide." });
  if (period === "lifetime") return send(res, 400, { error: "Le tarif À vie doit être configuré côté serveur avant activation." });
  if (!body.phone || !/^\+?509[0-9]{8}$/.test(body.phone.replace(/[\s-]/g, ""))) return send(res, 400, { error: "Numéro haïtien invalide." });

  let amount = period === "year" ? Math.round(prices[plan] * 12 * 0.87 * 100) / 100 : prices[plan];
  if (plan === "flash") amount = 65.85;

  const code = body.promoCode?.trim().toUpperCase();
  if (code) {
    const { data: promo } = await admin.from("promo_codes").select("code,plan,discount_percent,active,expires_at,max_redemptions,redeemed_count").eq("code", code).maybeSingle();
    if (!promo || !promo.active || (promo.expires_at && new Date(promo.expires_at) <= new Date()) || (promo.max_redemptions !== null && promo.redeemed_count >= promo.max_redemptions) || promo.plan !== plan) return send(res, 400, { error: "Code promo invalide, expiré ou incompatible avec ce plan." });
    amount = Math.round(amount * (1 - Number(promo.discount_percent) / 100) * 100) / 100;
  }

  const transactionId = randomUUID();
  const metadata = { transactionId, promoCode: code ?? null, userEmail: auth.user.email ?? null };
  const { error: insertError } = await admin.from("payment_transactions").insert({ id: transactionId, user_id: auth.user.id, provider, plan, billing_period: period, amount, currency: "HTG", phone: body.phone.replace(/[\s-]/g, ""), status: "pending", metadata });
  if (insertError) return send(res, 500, { error: "Impossible de créer la transaction." });

  if (!ZAKAPRO_API_URL) return send(res, 202, { transactionId, status: "pending", amount, currency: "HTG", message: "Transaction enregistrée. Configurez ZAKAPRO_API_URL pour activer la redirection de paiement." });

  try {
    const response = await fetch(ZAKAPRO_API_URL, { method: "POST", headers: { "Content-Type": "application/json", ...(ZAKAPRO_API_KEY ? { Authorization: `Bearer ${ZAKAPRO_API_KEY}` } : {}) }, body: JSON.stringify({ transactionId, provider, plan, billingPeriod: period, amount, currency: "HTG", phone: body.phone, callbackUrl: `${process.env.APP_URL ?? ""}/api/payments/webhook` }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Zakapro HTTP ${response.status}`);
    const providerReference = data.reference ?? data.transactionId ?? data.id ?? transactionId;
    await admin.from("payment_transactions").update({ provider_reference: providerReference, metadata: { ...metadata, providerResponse: data } }).eq("id", transactionId);
    return send(res, 200, { transactionId, status: "pending", amount, currency: "HTG", checkoutUrl: data.checkoutUrl ?? data.paymentUrl ?? null, confirmationRequired: true });
  } catch (error) {
    await admin.from("payment_transactions").update({ status: "failed", metadata: { ...metadata, error: String(error) } }).eq("id", transactionId);
    return send(res, 502, { error: "La passerelle de paiement est indisponible. Réessayez plus tard." });
  }
}
