import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { dbQuery, internalError, requireUser } from "./_dashboardDb";

function body(req: VercelRequest) { return (req.body ?? {}) as Record<string, unknown>; }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    if (req.method === "GET") {
      const result = await dbQuery("SELECT d.* FROM institutional_databases d WHERE d.user_id=$1 ORDER BY d.created_at DESC", [user.id]);
      return res.status(200).json({ databases: result.rows });
    }

    if (req.method === "POST") {
      const b = body(req);
      const name = String(b.name ?? "").trim();
      const theme = String(b.theme ?? "").trim();
      const files = Array.isArray(b.files) ? b.files : [];
      if (!name) return res.status(400).json({ error: "Nom de la base requis.", code: "INVALID_NAME" });
      const result = await dbQuery("INSERT INTO institutional_databases (id,user_id,name,description,document_count,metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *", [crypto.randomUUID(), user.id, name, theme || null, files.length, JSON.stringify({ theme, files })]);
      return res.status(201).json({ database: result.rows[0] });
    }

    if (req.method === "PATCH") {
      const b = body(req);
      const id = String(b.id ?? "").trim();
      if (!id) return res.status(400).json({ error: "Identifiant requis.", code: "INVALID_ID" });
      const current = await dbQuery("SELECT * FROM institutional_databases WHERE id=$1 AND user_id=$2 LIMIT 1", [id, user.id]);
      if (!current.rows[0]) return res.status(404).json({ error: "Base introuvable.", code: "DATABASE_NOT_FOUND" });
      const row = current.rows[0] as any;
      const metadata = { ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}), ...(Array.isArray(b.files) ? { files: b.files } : {}), ...(b.theme !== undefined ? { theme: String(b.theme ?? "") } : {}) };
      const name = b.name === undefined ? row.name : String(b.name ?? "").trim();
      const files = Array.isArray(metadata.files) ? metadata.files : [];
      const result = await dbQuery("UPDATE institutional_databases SET name=$1,document_count=$2,metadata=$3::jsonb,updated_at=NOW() WHERE id=$4 AND user_id=$5 RETURNING *", [name || row.name, files.length, JSON.stringify(metadata), id, user.id]);
      return res.status(200).json({ database: result.rows[0] });
    }

    if (req.method === "DELETE") {
      const id = String(body(req).id ?? "").trim();
      if (!id) return res.status(400).json({ error: "Identifiant requis.", code: "INVALID_ID" });
      await dbQuery("DELETE FROM institutional_databases WHERE id=$1 AND user_id=$2", [id, user.id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Méthode non autorisée" });
  } catch (error) {
    return internalError(res, "institutional-databases", error);
  }
}
