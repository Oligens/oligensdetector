import type { VercelRequest, VercelResponse } from "@vercel/node";
import adminHandler from "../../src/server/api/admin.ts";

/**
 * Vercel catch-all entry point for /api/admin/*.
 *
 * IMPORTANT:
 * Keep this import static and include the .ts extension. The previous
 * implementation used a runtime `import("../../src/server/api/admin")`.
 * In the production Vercel bundle that specifier could remain an ESM
 * extensionless import, causing Node to look for:
 *   /var/task/src/server/api/admin
 * and fail with ERR_MODULE_NOT_FOUND.
 *
 * With a static import, Vercel's Node/TypeScript bundler resolves and bundles
 * src/server/api/admin.ts together with this serverless function.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  return adminHandler(req, res);
}
