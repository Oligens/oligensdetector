import { createClient } from "@supabase/supabase-js";

type Req = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };
type Payload = { transactionId?: string; reference?: string; status?: string; paid?: boolean };
const admin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ZAKAPRO_WEBHOOK_SECRET) return res.status(500).json({ error: "Webhook not configured" });
  const secret = Array.isArray(req.headers["x-zakapro-secret"]) ? req.headers["x-zakapro-secret"][0] : req.headers["x-zakapro-secret"];
  if (secret !== process.env.ZAKAPRO_WEBHOOK_SECRET) return res.status(401).json({ error: "Invalid signature" });
  const payload = (req.body ?? {}) as Payload; const db = admin(); const ref = payload.reference ?? payload.transactionId;
  if (!ref) return res.status(400).json({ error: "Missing transaction reference" });
  const { data: tx, error } = await db.from("payment_transactions").select("*").or(`id.eq.${ref},provider_reference.eq.${ref}`).maybeSingle();
  if (error || !tx) return res.status(404).json({ error: "Transaction not found" });
  if (tx.status === "paid") return res.status(200).json({ ok: true, alreadyProcessed: true });
  const paid = payload.paid === true || ["paid", "success", "successful", "completed"].includes(String(payload.status).toLowerCase());
  if (!paid) { if (["failed", "cancelled", "expired"].includes(String(payload.status).toLowerCase())) await db.from("payment_transactions").update({ status: "failed" }).eq("id", tx.id); return res.status(200).json({ ok: true, paid: false }); }
  const now = new Date(); let end: string | null = null;
  if (tx.billing_period === "month") { const d = new Date(now); d.setMonth(d.getMonth() + 1); end = d.toISOString(); }
  if (tx.billing_period === "year") { const d = new Date(now); d.setFullYear(d.getFullYear() + 1); end = d.toISOString(); }
  if (tx.plan === "flash") end = new Date(Date.now() + 7 * 86400000).toISOString();
  const { error: updateError } = await db.from("payment_transactions").update({ status: "paid", provider_reference: tx.provider_reference ?? ref, updated_at: new Date().toISOString() }).eq("id", tx.id);
  if (updateError) return res.status(500).json({ error: "Unable to finalize transaction" });
  await db.from("subscriptions").upsert({ user_id: tx.user_id, plan: tx.plan, status: "active", billing_period: tx.billing_period, current_period_end: end, flash_started_at: tx.plan === "flash" ? new Date().toISOString() : null, updated_at: new Date().toISOString() });
  if (tx.metadata?.promoCode) { const code = String(tx.metadata.promoCode); const { error: redemptionError } = await db.from("promo_redemptions").insert({ code, user_id: tx.user_id }); if (!redemptionError) await db.rpc("increment_promo_redemption", { p_code: code }); }
  return res.status(200).json({ ok: true, paid: true, plan: tx.plan });
}
