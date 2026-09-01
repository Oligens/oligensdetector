import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfConfigured = false;
const mammothBrowser = mammoth as unknown as { extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> };

function decodeText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("�")) return utf8;
  try { return new TextDecoder("windows-1252").decode(buffer); } catch { return utf8; }
}

function validateSignature(ext: string, bytes: Uint8Array) {
  if (ext === "pdf" && new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Le fichier PDF n'a pas une signature PDF valide.");
  if (ext === "docx" && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error("Le fichier DOCX n'a pas une signature ZIP valide.");
}

async function extractPdf(file: File, onPage?: (page: number, total: number) => void): Promise<string> {
  if (!pdfConfigured) { pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl; pdfConfigured = true; }
  const buffer = await file.arrayBuffer();
  validateSignature("pdf", new Uint8Array(buffer));
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: true });
  try {
    const doc = await task.promise;
    let out = "";
    for (let p = 1; p <= doc.numPages; p++) {
      onPage?.(p, doc.numPages);
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      out += content.items.map((it) => (it as { str?: string }).str ?? "").join(" ") + "\n\n";
      if (p % 4 === 0) await new Promise(r => window.setTimeout(r, 0));
    }
    return out.trim();
  } finally { await task.destroy(); }
}

async function extractDocx(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  validateSignature("docx", new Uint8Array(buffer));
  const { value } = await mammothBrowser.extractRawText({ arrayBuffer: buffer });
  return value.trim();
}

function cleanRtf(raw: string): string {
  return raw.replace(/\\[a-zA-Z]+-?\d* ?/g, " ").replace(/[{}]/g, " ").replace(/\\\*/g, " ").replace(/\s+/g, " ").trim();
}

async function serverFallback(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  const response = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, mimeType: file.type, base64: btoa(binary) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.text !== "string") throw new Error(data.error ?? "Extraction serveur impossible.");
  return data.text.trim();
}

export function isSupportedFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["pdf", "docx", "doc", "txt", "md", "rtf"].includes(ext);
}

export async function extractTextFromFile(file: File, onPage?: (page: number, total: number) => void): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") {
    try { return await extractPdf(file, onPage); } catch (browserError) { try { return await serverFallback(file); } catch { throw browserError; } }
  }
  if (ext === "docx") {
    try { return await extractDocx(file); } catch (browserError) { try { return await serverFallback(file); } catch { throw browserError; } }
  }
  if (ext === "doc") throw new Error("Le format DOC binaire ancien n'est pas fiable dans un navigateur. Convertissez-le en DOCX ou PDF.");
  const raw = decodeText(await file.arrayBuffer());
  return ext === "rtf" ? cleanRtf(raw) : raw.trim();
}
