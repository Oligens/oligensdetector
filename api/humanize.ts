import handler from "../src/server/api/humanizePythonPort";

/**
 * Explicit Vercel Function for POST /api/humanize.
 *
 * The public route now uses the native TypeScript port of the repository's
 * Python humanizer contract. The legacy humanizer route remains intact for
 * compatibility and emergency fallback.
 */
export default handler;
