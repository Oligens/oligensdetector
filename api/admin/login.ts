import type { VercelRequest, VercelResponse } from "@vercel/node";
import { login } from "../../src/server/api/admin.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return login(req, res);
}
