import handler from "../src/server/api/humanize";

/**
 * Explicit Vercel Function for POST /api/humanize.
 *
 * Keep the physical Vercel route on the same guarded handler used by the
 * catch-all API router. This prevents the direct /api/humanize deployment
 * from bypassing the local-first error handling and returning an avoidable
 * HTTP 500 when the legacy Python-port adapter fails.
 */
export default handler;
