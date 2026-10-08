import type { VercelRequest, VercelResponse } from "@vercel/node";
import { serviceKeys } from "../../src/server/api/admin.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return serviceKeys(req, res);
}
