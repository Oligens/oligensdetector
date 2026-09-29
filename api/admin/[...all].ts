import type { VercelRequest, VercelResponse } from "@vercel/node";
import adminHandler from "../../src/server/api/admin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await adminHandler(req, res);
  } catch (error) {
    console.error("[api/admin]", error);
    return res.status(503).json({
      error: "Service administrateur temporairement indisponible.",
      code: "ADMIN_FUNCTION_UNAVAILABLE",
    });
  }
}
