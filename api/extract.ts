type Req = { method?: string; body?: { filename?: string; mimeType?: string; base64?: string } };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };

function send(res: Res, status: number, body: unknown) { res.status(status).json(body); }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  const filename = String(req.body?.filename ?? "");
  const base64 = String(req.body?.base64 ?? "");
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!base64 || !["pdf", "docx"].includes(ext ?? "")) return send(res, 400, { error: "PDF/DOCX attendu." });
  try {
    const data = Buffer.from(base64, "base64");
    if (data.byteLength > 25 * 1024 * 1024) return send(res, 413, { error: "Fichier trop volumineux." });
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.default.extractRawText({ buffer: data });
      return send(res, 200, { text: result.value.trim(), source: "server-mammoth" });
    }
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: new Uint8Array(data), disableWorker: true });
    const doc = await task.promise;
    let text = "";
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      text += content.items.map((item: { str?: string }) => item.str ?? "").join(" ") + "\n\n";
    }
    await task.destroy();
    return send(res, 200, { text: text.trim(), source: "server-pdfjs" });
  } catch (error) {
    return send(res, 422, { error: error instanceof Error ? error.message : "Extraction serveur impossible." });
  }
}
