import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MAX_FILE_CHARS = 240_000;

const DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const WORDML_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Shared by file inputs so the picker matches what we can parse. */
export const KNOWLEDGE_FILE_ACCEPT = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".docx",
  ".pptx",
  ".xlsx",
  ".xls",
  ".csv",
  ".html",
  ".htm",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
].join(",");

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  let out = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    out += `\n--- PDF page ${p} ---\n`;
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (item && typeof item === "object" && "str" in item && typeof (item as { str: string }).str === "string") {
        out += (item as { str: string }).str + " ";
      }
    }
    out += "\n";
  }
  return out.trim();
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value.trim();
}

/** Pull visible text from PPTX slide / notes OOXML (zip of XML). */
async function extractPptxText(file: File): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const paths = Object.keys(zip.files)
    .filter(
      (p) =>
        /^ppt\/slides\/slide\d+\.xml$/i.test(p) || /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(p)
    )
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const chunks: string[] = [];
  for (const path of paths) {
    const f = zip.file(path);
    if (!f) continue;
    const slideNum = path.match(/slide(\d+)/i)?.[1] ?? "?";
    const xml = await f.async("string");
    const body = ooXmlDrawingAndWordText(xml);
    chunks.push(`\n--- PPTX slide ${slideNum} ---\n${body}`);
  }
  return chunks.join("\n\n").replace(/\s+\n/g, "\n").trim();
}

function ooXmlDrawingAndWordText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return "";

  const out: string[] = [];
  const pushNs = (ns: string) => {
    const nodes = doc.getElementsByTagNameNS(ns, "t");
    for (let i = 0; i < nodes.length; i++) {
      const t = nodes[i].textContent?.replace(/\s+/g, " ").trim();
      if (t) out.push(t);
    }
  };
  pushNs(DRAWINGML_NS);
  pushNs(WORDML_NS);

  if (out.length === 0) {
    const all = doc.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.localName !== "t") continue;
      const u = el.namespaceURI ?? "";
      if (!u.includes("drawingml") && !u.includes("wordprocessingml")) continue;
      const t = el.textContent?.replace(/\s+/g, " ").trim();
      if (t) out.push(t);
    }
  }

  return out.join(" ");
}

async function extractXlsxText(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const data = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(data, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
    if (csv.trim()) parts.push(`[${name}]\n${csv.trim()}`);
  }
  return parts.join("\n\n").trim();
}

async function extractHtmlText(file: File): Promise<string> {
  const html = await file.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  const text = body?.innerText ?? doc.documentElement?.textContent ?? "";
  return text.replace(/\s+\n/g, "\n").trim();
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type;

  if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    type === "text/plain" ||
    type === "text/markdown"
  ) {
    return file.text();
  }

  if (name.endsWith(".csv") || type === "text/csv" || type === "application/csv") {
    return file.text();
  }

  if (name.endsWith(".html") || name.endsWith(".htm") || type === "text/html") {
    return extractHtmlText(file);
  }

  if (name.endsWith(".pdf") || type === "application/pdf") {
    return extractPdfText(file);
  }

  if (
    name.endsWith(".docx") ||
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocxText(file);
  }

  if (
    name.endsWith(".pptx") ||
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return extractPptxText(file);
  }

  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/vnd.ms-excel"
  ) {
    return extractXlsxText(file);
  }

  throw new Error(
    `Unsupported format: “${file.name}”. Try PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), CSV, HTML, TXT, or MD.`
  );
}

export function truncateForStorage(text: string): string {
  const t = text.replace(/\u0000/g, "").trim();
  if (t.length <= MAX_FILE_CHARS) return t;
  return `${t.slice(0, MAX_FILE_CHARS)}\n\n…(truncated for browser storage limits)`;
}
