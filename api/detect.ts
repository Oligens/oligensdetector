import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../src/server/api/detect";

/**
 * Canonical Vercel entry point for POST /api/detect.
 *
 * The actual detector lives in src/server/api/detect.ts and uses the
 * Vercel-safe local TypeScript engine. Keeping this adapter thin prevents
 * the browser contract from drifting away from the canonical server route.
 */
export default function detect(req: VercelRequest, res: VercelResponse) {
  return handler(req, res);
}
