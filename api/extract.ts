type Req = { method?: string; body?: { filename?: string; mimeType?: string; base64?: string } };
type Res = { status: (n: number) => Res; json: (v: unknown) => void };

const MAX_BYTES = 25 * 1024 * 1024;

function send(res: Res, status: number, body: unknown) { res.status(status).json(body); }

function hasPdfSignature(data: Buffer) { return data.subarray(0, 5).toString("ascii") === "%PDF-"; }
function hasZipSignature(data: Buffer) { return data[0] === 0x50 && data[1] === 0x4b; }

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  const filename = String(req.body?.filename ?? "");
  const base64 = String(req.body?.base64 ?? "");
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!base64 || !["pdf", "docx", "doc"].includes(ext)) return send(res, 400, { error: "PDF, DOCX ou DOC attendu." });

  try {
    const data = Buffer.from(base64, "base64");
    if (!data.byteLength) return send(res, 400, { error: "Fichier vide ou base64 invalide." });
    if (data.byteLength > MAX_BYTES) return send(res, 413, { error: "Fichier trop volumineux (25 Mo maximum)." });

    if (ext === "pdf") {
      if (!hasPdfSignature(data)) return send(res, 422, { error: "Le fichier PDF n'a pas une signature PDF valide." });
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // PDF.js v6 no longer exposes disableWorker in DocumentInitParameters.
      // In a Node/Vercel function PDF.js uses its Node/fake-worker implementation.
      const task = pdfjs.getDocument({ data: new Uint8Array(data) });
      try {
        const doc = await task.promise;
        let text = "";
        for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
          const page = await doc.getPage(pageNo);
          const content = await page.getTextContent();
          text += content.items
            .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
            .join(" ") + "\n\n";
        }
        return send(res, 200, { text: text.trim(), source: "server-pdfjs", pages: doc.numPages });
      } finally {
        await task.destroy();
      }
    }

    if (ext === "docx") {
      if (!hasZipSignature(data)) return send(res, 422, { error: "Le fichier DOCX n'a pas une signature ZIP valide." });
      const mammoth = await import("mammoth");
      const result = await mammoth.default.extractRawText({ buffer: data });
      return send(res, 200, { text: result.value.trim(), source: "server-mammoth" });
    }

    return send(res, 422, { error: "Le format DOC binaire ancien n'est pas pris en charge de manière fiable par cet extracteur Node. Convertissez-le en DOCX ou PDF." });
  } catch (error) {
    return send(res, 422, { error: error instanceof Error ? error.message : "Extraction serveur impossible." });
  }
}
