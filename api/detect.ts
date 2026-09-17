import handler from "../src/server/api/detect";

/**
 * Explicit Vercel Function for POST /api/detect.
 *
 * The application is Vite-based (not Next.js), so server code under
 * src/server is not a route by itself. Keeping this thin adapter in /api
 * makes Vercel's filesystem router expose the endpoint exactly where the
 * frontend calls it, while preserving the existing server implementation.
 */
export default handler;
