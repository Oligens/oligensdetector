import handler from "../src/server/api/humanize";

/**
 * Explicit Vercel Function for POST /api/humanize.
 *
 * The project uses Vite rather than Next.js, therefore the implementation in
 * src/server/api is not discovered as a public API route by Vercel. This
 * adapter exposes the exact /api/humanize URL used by the frontend.
 */
export default handler;
