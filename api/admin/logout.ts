import type { VercelRequest, VercelResponse } from "@vercel/node";
import { logout } from "../../src/server/api/admin.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return logout(req, res);
}
