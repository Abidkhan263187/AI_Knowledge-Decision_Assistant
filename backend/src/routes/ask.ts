import { Router } from "express";
import { HttpError, asyncHandler } from "../lib/http.js";
import { clientIp, hitLimit, rateLimit, release, tryAcquire } from "../lib/rateLimit.js";
import { db } from "../lib/store.js";
import { askQuestion, type ChatTurn } from "../services/pipeline.js";

function readHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: ChatTurn[] = [];
  for (const row of raw.slice(-6)) {
    if (!row || typeof row !== "object") continue;
    const item = row as { role?: string; content?: string; text?: string };
    if (item.role === "assistant") continue;
    const content = String(item.content || item.text || "").trim().slice(0, 500);
    if (!content) continue;
    turns.push({ role: "user", content });
  }
  return turns;
}

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function dailyAskLimit() {
  const n = Number(process.env.ASK_DAILY_LIMIT || 300);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 300;
}

export const askRouter = Router();

askRouter.post("/", rateLimit(60, 60_000, (req) => `ask-ip:${clientIp(req)}`), asyncHandler(async (req, res) => {
  const token = String(req.body?.token || req.body?.assistantToken || "").trim();
  const question = typeof req.body?.question === "string" ? req.body.question : "";
  if (!question.trim()) throw new HttpError(400, "Please enter a question.");
  if (question.trim().length > 2000) throw new HttpError(400, "Please keep questions under 2000 characters.");
  if (!token) throw new HttpError(401, "Invalid assistant token.");
  const organization = await db.findOrgByToken(token);
  if (!organization) throw new HttpError(401, "Invalid assistant token. This assistant URL is not active.");
  if (hitLimit(`ask-token:${organization.id}`, 30, 60_000)) {
    res.status(429).json({ error: "Too many questions for this assistant. Please wait a minute." });
    return;
  }
  if (!tryAcquire(organization.id)) {
    res.status(429).json({ error: "This assistant is busy. Please try again in a moment." });
    return;
  }
  try {
    await db.consumeDailyAsk(organization.id, dailyAskLimit());
    const result = await askQuestion(organization.id, question, organization.name, readHistory(req.body?.history));
    res.json({
      organizationName: organization.name,
      answer: result.answer,
      status: result.status,
      references: result.references,
    });
  } finally {
    release(organization.id);
  }
}));

askRouter.get("/meta/:token", asyncHandler(async (req, res) => {
  const organization = await db.findOrgByToken(one(req.params.token));
  if (!organization) throw new HttpError(401, "Invalid assistant token.");
  res.json({ organizationName: organization.name });
}));
