import { createRequire } from "node:module";
import { promisify } from "node:util";
import { inflate, inflateRaw } from "node:zlib";
import { PDFDocument } from "pdf-lib";

const inflateAsync = promisify(inflate);
const inflateRawAsync = promisify(inflateRaw);
const MAX_INFLATE_BYTES = 20 * 1024 * 1024;

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (
  data: Buffer,
  options?: { pagerender?: (pageData: { getTextContent: () => Promise<{ items: { str?: string }[] }> }) => Promise<string> }
) => Promise<{ numpages: number; text: string }>;

export const LIMITS = {
  maxDocuments: 10,
  maxPages: 200,
  maxPageChars: 20_000,
  maxBytes: 10 * 1024 * 1024,
};

export type ExtractedPage = { pageNumber: number; text: string };

function stringsFromPdfText(source: string): string {
  const paren = [...source.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)].map((m) =>
    m[0]
      .replace(/\s*Tj$/, "")
      .slice(1, -1)
      .replace(/\\([()\\])/g, "$1")
  );
  const hex = [...source.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) =>
    Buffer.from(m[1], "hex").toString("latin1")
  );
  return [...paren, ...hex].join(" ").replace(/\s+/g, " ").trim();
}

function assertPdf(buffer: Buffer) {
  const head = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
  if (!head.includes("%PDF-")) {
    throw new Error("Invalid PDF. Please upload a readable PDF file.");
  }
}

async function inflateCapped(slice: Buffer): Promise<string> {
  for (const fn of [inflateAsync, inflateRawAsync]) {
    try {
      const out = await fn(slice, { maxOutputLength: MAX_INFLATE_BYTES });
      return out.toString("latin1");
    } catch {
    }
  }
  return "";
}

async function extractPagesFromStreams(buffer: Buffer): Promise<ExtractedPage[]> {
  const latin = buffer.toString("latin1");
  const marker = /stream\r?\n/g;
  const pages: ExtractedPage[] = [];
  let match: RegExpExecArray | null;
  while ((match = marker.exec(latin))) {
    const start = match.index + match[0].length;
    const end = latin.indexOf("endstream", start);
    if (end === -1) continue;
    let slice = buffer.subarray(start, end);
    while (slice.length && (slice[slice.length - 1] === 10 || slice[slice.length - 1] === 13)) {
      slice = slice.subarray(0, slice.length - 1);
    }
    const decoded = await inflateCapped(slice);
    const text = stringsFromPdfText(decoded);
    if (text) pages.push({ pageNumber: pages.length + 1, text });
  }
  if (!pages.length) {
    const fallback = stringsFromPdfText(latin);
    if (fallback) pages.push({ pageNumber: 1, text: fallback });
  }
  return pages;
}

async function extractWithPdfParse(buffer: Buffer): Promise<ExtractedPage[]> {
  const parsedPages: ExtractedPage[] = [];
  const result = await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const content = await pageData.getTextContent();
      const text = content.items
        .map((item) => item.str || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      parsedPages.push({ pageNumber: parsedPages.length + 1, text });
      return text;
    },
  });
  if (parsedPages.some((p) => p.text)) return parsedPages;
  if (result.text?.trim()) {
    return result.text
      .split(/\f/)
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((text, i) => ({ pageNumber: i + 1, text }));
  }
  return [];
}

export async function extractPdf(buffer: Buffer): Promise<{
  pageCount: number;
  pages: ExtractedPage[];
}> {
  assertPdf(buffer);

  let pageCount: number;
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: false });
    pageCount = doc.getPageCount();
  } catch {
    throw new Error("Invalid PDF. Please upload a readable PDF file.");
  }

  if (pageCount > LIMITS.maxPages) {
    throw new Error(`This PDF has ${pageCount} pages. Maximum allowed is ${LIMITS.maxPages} pages.`);
  }

  let pages: ExtractedPage[] = [];
  try {
    pages = await extractWithPdfParse(buffer);
  } catch {
    pages = [];
  }
  if (!pages.some((p) => p.text)) {
    pages = await extractPagesFromStreams(buffer);
  }

  const usable = pages
    .filter((p) => p.text)
    .map((p) => ({ pageNumber: p.pageNumber, text: p.text.slice(0, LIMITS.maxPageChars) }));
  if (!usable.length) {
    throw new Error("Document processing failed: no readable text was found in this PDF.");
  }

  return { pageCount, pages: usable };
}

export function chunkPages(pages: ExtractedPage[], maxChars = 900): ExtractedPage[] {
  const chunks: ExtractedPage[] = [];
  for (const page of pages) {
    if (page.text.length <= maxChars) {
      chunks.push(page);
      continue;
    }
    const sentences = page.text.split(/(?<=[.?!])\s+/);
    let current = "";
    const windows: string[] = [];
    for (const sentence of sentences) {
      if (sentence.length <= maxChars) {
        windows.push(sentence);
        continue;
      }
      for (let i = 0; i < sentence.length; i += maxChars) windows.push(sentence.slice(i, i + maxChars));
    }
    for (const piece of windows) {
      const next = current ? `${current} ${piece}` : piece;
      if (next.length > maxChars && current) {
        chunks.push({ pageNumber: page.pageNumber, text: current.trim() });
        const tail = current.split(/(?<=[.?!])\s+/).slice(-1)[0] || "";
        current = `${tail} ${piece}`.trim().slice(0, maxChars);
      } else {
        current = next.trim().slice(0, maxChars);
      }
    }
    if (current) chunks.push({ pageNumber: page.pageNumber, text: current.trim() });
  }
  return chunks;
}
