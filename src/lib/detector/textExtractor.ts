// ============================================================
// Extraction de texte brut — PDF (pdfjs) · DOCX (mammoth) · TXT/RTF
// Chargé dynamiquement (code-splitting) pour alléger le 1er rendu.
// ============================================================
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfConfigured = false;

const mammothBrowser = mammoth as unknown as {
  extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
};

async function extractPdf(file: File, onPage?: (page: number, total: number) => void): Promise<string> {
  if (!pdfConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    pdfConfigured = true;
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjsLib.getDocument({ data });
  const doc = await task.promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    onPage?.(p, doc.numPages);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    out += content.items.map((it) => (it as { str?: string }).str ?? "").join(" ") + "\n\n";
    if (p % 4 === 0) await new Promise((r) => window.setTimeout(r, 0));
  }
  await task.destroy();
  return out.trim();
}

async function extractDocx(file: File): Promise<string> {
  const { value } = await mammothBrowser.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value.trim();
}

function cleanRtf(raw: string): string {
  return raw
    .replace(/\\[a-zA-Z]+-?\d* ?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\\\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSupportedFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["pdf", "docx", "doc", "txt", "md", "rtf"].includes(ext);
}

export async function extractTextFromFile(
  file: File,
  onPage?: (page: number, total: number) => void
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return extractPdf(file, onPage);
  if (ext === "docx" || ext === "doc") return extractDocx(file);
  const raw = await file.text();
  return ext === "rtf" ? cleanRtf(raw) : raw.trim();
}
