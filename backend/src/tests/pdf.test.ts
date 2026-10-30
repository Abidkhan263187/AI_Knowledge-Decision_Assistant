import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdf } from "../services/pdf.js";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

async function twoPagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage();
  first.drawText("Alpha page mentions the library hours.", { x: 50, y: 700, size: 12, font });
  const second = doc.addPage();
  second.drawText("Beta page mentions quiet hours only.", { x: 50, y: 700, size: 12, font });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function main() {
  let rejected = false;
  try {
    await extractPdf(Buffer.from("not a pdf"));
  } catch (err) {
    rejected = err instanceof Error && /Invalid PDF/.test(err.message);
  }
  assert(rejected, "non-PDF bytes should be rejected");

  const extracted = await extractPdf(await twoPagePdf());
  assert(extracted.pageCount === 2, `expected 2 pages, got ${extracted.pageCount}`);
  const beta = extracted.pages.find((page) => /beta page/i.test(page.text));
  assert(beta?.pageNumber === 2, `beta text should be page 2, got ${beta?.pageNumber ?? "missing"}`);
  console.log("PASS: pdf page extraction");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
