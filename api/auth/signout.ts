import type { VercelRequest, VercelResponse } from "@vercel/node";

const COOKIE = "oligens_session";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  const secure = process.env.VERCEL_ENV === "production" ? " Secure;" : "";
  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=0; Expires=${expires}`,
  );

  return res.status(200).json({ ok: true });
}
