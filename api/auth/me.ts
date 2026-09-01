import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getUser } from "../_lib/auth";
import { query } from "../_lib/db";

type SubscriptionRow = {
  plan: "free" | "flash" | "pro" | "gold";
  status: "active" | "expired" | "cancelled" | "pending";
  billing_period: "monthly" | "yearly" | "lifetime" | null;
  expires_at: string | null;
  started_at: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });

  try {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ user: null });

    // This query matches the Neon V2 schema exactly: subscriptions uses
    // started_at/expires_at and billing_period values monthly/yearly/lifetime.
    const result = await query<SubscriptionRow>(
      `SELECT
         CASE
           WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
             THEN 'free'::subscription_plan
           ELSE plan
         END AS plan,
         CASE
           WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
             THEN 'active'::subscription_status
           ELSE status
         END AS status,
         CASE
           WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
             THEN 'monthly'::billing_period
           ELSE billing_period
         END AS billing_period,
         CASE
           WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
             THEN NULL
           ELSE expires_at
         END AS expires_at,
         started_at
       FROM subscriptions
       WHERE user_id = $1
       LIMIT 1`,
      [user.id]
    );

    const sub: SubscriptionRow = result.rows[0] ?? {
      plan: "free",
      status: "active",
      billing_period: "monthly",
      expires_at: null,
      started_at: new Date().toISOString(),
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
        currentPeriodEnd: sub.expires_at,
        flashStartedAt: sub.plan === "flash" ? sub.started_at : null,
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
