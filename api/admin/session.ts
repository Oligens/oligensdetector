import type { VercelRequest, VercelResponse } from "@vercel/node";
import { session } from "../../src/server/api/admin.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return session(req, res);
}
