import { Router } from "express";
import multer from "multer";
import { HttpError, asyncHandler, withTimeout } from "../lib/http.js";
import { db } from "../lib/store.js";
import { getAuth, requireAuth } from "../middleware/auth.js";
import { LIMITS, chunkPages, extractPdf } from "../services/pdf.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.maxBytes },
});

function safeUploadMessage(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  if (err instanceof Error && /PDF|page|text|Knowledge base|readable|too large/i.test(err.message)) {
    return err.message;
  }
  return "Document processing failed.";
}

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

documentsRouter.get("/", asyncHandler(async (req, res) => {
  const { orgId } = getAuth(req);
  res.json({ limits: LIMITS, documents: await db.listDocuments(orgId) });
}));

documentsRouter.post("/", (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message =
        err instanceof Error && /File too large/i.test(err.message)
          ? `File is too large. Maximum size is ${LIMITS.maxBytes / (1024 * 1024)} MB.`
          : "Upload failed. Please try a valid PDF.";
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}, asyncHandler(async (req, res) => {
  const { orgId } = getAuth(req);
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Please choose a PDF file to upload." });
    return;
  }
  if (file.mimetype !== "application/pdf" && !file.originalname.toLowerCase().endsWith(".pdf")) {
    res.status(400).json({ error: "Only PDF documents are allowed." });
    return;
  }
  if (file.size > LIMITS.maxBytes) {
    res.status(400).json({ error: `File is too large. Maximum size is ${LIMITS.maxBytes / (1024 * 1024)} MB.` });
    return;
  }

  try {
    const extracted = await withTimeout(extractPdf(file.buffer), 25_000, "This PDF took too long to read. Try a smaller file.");
    const chunks = chunkPages(extracted.pages);
    const document = await db.createDocument({
      organizationId: orgId,
      filename: file.originalname.replace(/[^\w.\- ()]+/g, "").slice(0, 180) || "document.pdf",
      pageCount: extracted.pageCount,
      sizeBytes: file.size,
      chunks: chunks.map((c) => ({ pageNumber: c.pageNumber, content: c.text })),
    });
    res.status(201).json({
      id: document.id,
      filename: document.filename,
      pageCount: document.pageCount,
      sizeBytes: document.sizeBytes,
    });
  } catch (err) {
    console.error(err);
    const status = err instanceof HttpError ? err.status : 400;
    res.status(status).json({ error: safeUploadMessage(err) });
  }
}));

documentsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const { orgId } = getAuth(req);
  const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const document = await db.findDocument(documentId, orgId);
  if (!document) {
    res.status(404).json({ error: "Document not found in this organization's knowledge base." });
    return;
  }
  await db.deleteDocument(document.id, orgId);
  res.json({ ok: true });
}));
