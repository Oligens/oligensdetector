import type { VercelRequest, VercelResponse } from "@vercel/node";
import { session } from "../../src/server/api/admin.ts";

/**
 * Keep the Vercel entrypoint thin and use the same admin-session implementation
 * as the login, logout and API-key routes. This prevents the session endpoint
 * from drifting into a second, incompatible authentication implementation.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  return session(req, res);
}
