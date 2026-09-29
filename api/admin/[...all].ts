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
      return res.status(500).json({
        error: "Connexion à la base de données administrateur impossible.",
        code: "ADMIN_DATABASE_ERROR",
      });
    }
    if (/AUTH_SECRET/i.test(message)) {
      return res.status(500).json({
        error: "AUTH_SECRET est absent ou invalide sur le serveur.",
        code: "AUTH_SECRET_NOT_CONFIGURED",
      });
    }
    return res.status(500).json({
      error: "Erreur interne du service administrateur.",
      code: "ADMIN_FUNCTION_ERROR",
    });
  }
}
