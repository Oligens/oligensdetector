import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { Pool } from "pg";

const COOKIE = "oligens_session";
type AuthUser = { id: string; email: string; email_verified: boolean };
type SubscriptionRow = {
  plan: "free" | "flash" | "pro" | "gold";
  status: "active" | "expired" | "cancelled" | "pending";
  billing_period: "monthly" | "yearly" | "lifetime" | null;
  expires_at: string | null;
  started_at: string;
};

let pool: Pool | undefined;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false },
    application_name: "oligens-detector-auth-me",
  });
  pool.on("error", (error) => console.error("[auth/me] database pool error", error));
  return pool;
}

function authSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  if (secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return secret;
}

function getCookie(req: VercelRequest) {
  return (req.headers.cookie ?? "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    if (!process.env.DATABASE_URL?.trim()) {
      return res.status(503).json({ error: "Base de données non configurée.", code: "DATABASE_NOT_CONFIGURED" });
    }

    const token = getCookie(req);
    if (!token) return res.status(401).json({ user: null });

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, authSecret(), { issuer: "oligens-detector" }) as jwt.JwtPayload;
    } catch {
      return res.status(401).json({ user: null });
    }

    if (!payload.sub) return res.status(401).json({ user: null });

    const db = getPool();
    const userResult = await db.query<AuthUser>(
      "SELECT id,email,email_verified FROM users WHERE id=$1 LIMIT 1",
      [payload.sub],
    );
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ user: null });

    const subscriptionResult = await db.query<SubscriptionRow>(
      `SELECT
        CASE WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()
          THEN 'free'::subscription_plan ELSE plan END AS plan,
        CASE WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()
          THEN 'active'::subscription_status ELSE status END AS status,
        CASE WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()
          THEN 'monthly'::billing_period ELSE billing_period END AS billing_period,
        CASE WHEN plan <> 'free' AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()
          THEN NULL ELSE expires_at END AS expires_at,
        started_at
      FROM subscriptions
      WHERE user_id = $1
      LIMIT 1`,
      [user.id],
    );

    const subscription = subscriptionResult.rows[0] ?? {
      plan: "free" as const,
      status: "active" as const,
      billing_period: "monthly" as const,
      expires_at: null,
      started_at: new Date().toISOString(),
    };

    let flashAnalysesToday = 0;
    if (subscription.plan === "flash") {
      const usage = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM usage_events
         WHERE user_id = $1
           AND event_type = 'analysis'
           AND created_at >= DATE_TRUNC('day', NOW())`,
        [user.id],
      );
      flashAnalysesToday = Number(usage.rows[0]?.count ?? 0);
    }

    return res.status(200).json({
      user,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        period: subscription.billing_period,
        currentPeriodEnd: subscription.expires_at,
        flashStartedAt: subscription.plan === "flash" ? subscription.started_at : null,
        flashAnalysesToday,
      },
    });
  } catch (error) {
    console.error("[auth/me] error", error);
    const message = error instanceof Error ? error.message : "Service indisponible.";
    if (message.includes("AUTH_SECRET")) {
      return res.status(503).json({
        error: "Authentification non configurée sur le serveur.",
        code: "AUTH_SECRET_NOT_CONFIGURED",
      });
    }
    if (message.includes("DATABASE_URL") || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|connection/i.test(message)) {
      return res.status(503).json({
        error: "Base de données temporairement indisponible.",
        code: "DATABASE_UNAVAILABLE",
      });
    }
    return res.status(500).json({
      error: "Erreur interne pendant la récupération de la session.",
      code: "AUTH_ME_INTERNAL_ERROR",
    });
  }
}
