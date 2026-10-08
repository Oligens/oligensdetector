import type { VercelRequest, VercelResponse } from "@vercel/node";
import adminHandler from "../../src/server/api/admin.ts";

/**
 * Vercel catch-all entry point for /api/admin/*.
 *
 * Vercel does not guarantee that a catch-all parameter is exposed as
 * req.query.all in every production routing/build configuration. The admin
 * implementation expects that parameter, so normalize it from req.url when
 * necessary before delegating to the real handler.
 */
function resolveAdminPath(req: VercelRequest): string[] {
  const raw = req.query.all;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.flatMap((value) => String(value).split("/")).filter(Boolean);
  }
  if (typeof raw === "string" && raw) {
    return raw.split("/").filter(Boolean);
  }

  const requestUrl = req.url ?? "";
  const pathname = requestUrl.split("?", 1)[0].split("#", 1)[0];
  const marker = "/api/admin/";
  const index = pathname.indexOf(marker);
  if (index === -1) return [];

  return pathname
    .slice(index + marker.length)
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .filter(Boolean);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const all = resolveAdminPath(req);

  // Preserve the existing admin implementation and API-key functionality;
  // only normalize the route parameter required by src/server/api/admin.ts.
  req.query = { ...req.query, all };

  try {
    return await adminHandler(req, res);
  } catch (error) {
    console.error("[api/admin] unhandled route error", error);
    return res.status(500).json({
      success: false,
      error: "Erreur interne du service administrateur.",
      code: "ADMIN_FUNCTION_ERROR",
    });
  }
}
