import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Load the admin module inside the request boundary so module-load errors
    // cannot become an opaque Vercel 500 before our JSON error handler runs.
    const { default: adminHandler } = await import("../../src/server/api/admin");
    return await adminHandler(req, res);
  } catch (error) {
    console.error("[api/admin]", error);
    const message = error instanceof Error ? error.message : "Service administrateur indisponible.";
    if (/DATABASE_URL|POSTGRES_URL|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|certificate|SSL|connection/i.test(message)) {
      return res.status(503).json({
        error: "Base de données administrateur temporairement indisponible.",
        code: "ADMIN_DATABASE_UNAVAILABLE",
      });
    }
    if (/AUTH_SECRET/i.test(message)) {
      return res.status(503).json({
        error: "Authentification administrateur non configurée sur le serveur.",
        code: "AUTH_SECRET_NOT_CONFIGURED",
      });
    }
    return res.status(503).json({
      error: "Service administrateur temporairement indisponible.",
      code: "ADMIN_FUNCTION_UNAVAILABLE",
    });
  }
}
