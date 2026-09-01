import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUser } from "../_lib/auth";
import { query } from "../_lib/db";

type SubscriptionRow = {
  plan: "free" | "flash" | "pro" | "gold";
  status: "active" | "expired" | "cancelled" | "none";
  billing_period: "month" | "year" | "lifetime" | null;
  current_period_end: string | null;
  flash_started_at: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });

  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ user: null });

    // Do not call expire_subscriptions() from a read endpoint. The old implementation
    // made /api/auth/me fail with HTTP 500 when the DB function was missing or the
    // migration was only partially deployed. Compute the effective subscription here;
    // a later write/webhook can normalize the row in the database.
    const result = await query<SubscriptionRow>(
      `SELECT
         CASE
           WHEN plan <> 'free' AND status = 'active' AND (
             (current_period_end IS NOT NULL AND current_period_end <= now()) OR
             (plan = 'flash' AND flash_started_at IS NOT NULL AND flash_started_at <= now() - interval '7 days')
           ) THEN 'free'::subscription_plan
           ELSE plan
         END AS plan,
         CASE
           WHEN plan <> 'free' AND status = 'active' AND (
             (current_period_end IS NOT NULL AND current_period_end <= now()) OR
             (plan = 'flash' AND flash_started_at IS NOT NULL AND flash_started_at <= now() - interval '7 days')
           ) THEN 'active'::subscription_status
           ELSE status
         END AS status,
         CASE
           WHEN plan <> 'free' AND status = 'active' AND (
             (current_period_end IS NOT NULL AND current_period_end <= now()) OR
             (plan = 'flash' AND flash_started_at IS NOT NULL AND flash_started_at <= now() - interval '7 days')
           ) THEN NULL
           ELSE billing_period
         END AS billing_period,
         CASE
           WHEN plan <> 'free' AND status = 'active' AND (
             (current_period_end IS NOT NULL AND current_period_end <= now()) OR
             (plan = 'flash' AND flash_started_at IS NOT NULL AND flash_started_at <= now() - interval '7 days')
           ) THEN NULL
           ELSE current_period_end
         END AS current_period_end,
         CASE
           WHEN plan <> 'free' AND status = 'active' AND (
             (current_period_end IS NOT NULL AND current_period_end <= now()) OR
             (plan = 'flash' AND flash_started_at IS NOT NULL AND flash_started_at <= now() - interval '7 days')
           ) THEN NULL
           ELSE flash_started_at
         END AS flash_started_at
       FROM subscriptions
       WHERE user_id = $1
       LIMIT 1`,
      [user.id]
    );

    const sub: SubscriptionRow = result.rows[0] ?? {
      plan: "free",
      status: "active",
      billing_period: null,
      current_period_end: null,
      flash_started_at: null,
    };

    let flashAnalysesToday = 0;
    if (sub.plan === "flash") {
      const usage = await query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM usage_events
          WHERE user_id = $1
            AND event_type = 'analysis'
            AND created_at >= date_trunc('day', now())`,
        [user.id]
      );
      flashAnalysesToday = Number(usage.rows[0]?.count ?? 0);
    }

    return res.status(200).json({
      user,
      subscription: {
        plan: sub.plan,
        status: sub.status,
        period: sub.billing_period,
        currentPeriodEnd: sub.current_period_end,
        flashStartedAt: sub.flash_started_at,
        flashAnalysesToday,
      },
    });
  } catch (error) {
    console.error("[auth/me] database error", error);
    return res.status(503).json({
      error: "Service d'authentification temporairement indisponible.",
      code: "AUTH_DATABASE_UNAVAILABLE",
    });
  }
}
