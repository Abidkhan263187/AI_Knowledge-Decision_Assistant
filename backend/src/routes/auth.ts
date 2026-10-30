import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../lib/http.js";
import { clientIp, rateLimit } from "../lib/rateLimit.js";
import { db } from "../lib/store.js";
import { getAuth, jwtSecret, requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

function tokenFor(orgId: string, email: string, tokenVersion = 0) {
  return jwt.sign({ orgId, email, tv: tokenVersion }, jwtSecret(), { expiresIn: "7d" });
}

function publicOrg(organization: { id: string; name: string; email: string; assistantToken: string }) {
  return {
    id: organization.id,
    name: organization.name,
    email: organization.email,
    assistantToken: organization.assistantToken,
  };
}

function isDuplicate(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 11000;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

authRouter.post("/register", rateLimit(5, 60_000, (req) => `register:${clientIp(req)}`), asyncHandler(async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!name || name.length > 80 || !EMAIL.test(email) || email.length > 254 || password.length < 6 || password.length > 128) {
    res.status(400).json({ error: "Organization name, a valid email, and a password of 6 to 128 characters are required." });
    return;
  }
  if (await db.findOrgByEmail(email)) {
    res.status(409).json({ error: "An organization with this email already exists." });
    return;
  }
  try {
    const organization = await db.upsertOrg({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      assistantToken: randomUUID(),
    });
    res.status(201).json({
      token: tokenFor(organization.id, organization.email, organization.tokenVersion ?? 0),
      organization: publicOrg(organization),
    });
  } catch (err) {
    if (isDuplicate(err)) {
      res.status(409).json({ error: "An organization with this email already exists." });
      return;
    }
    throw err;
  }
}));

authRouter.post("/login", rateLimit(10, 60_000, (req) => `login:${clientIp(req)}`), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 254);
  const password = String(req.body?.password || "").slice(0, 128);
  const organization = email ? await db.findOrgByEmail(email) : null;
  let passwordOk = false;
  if (organization?.passwordHash) {
    try {
      passwordOk = await bcrypt.compare(password, organization.passwordHash);
    } catch {
      passwordOk = false;
    }
  }
  if (!organization || !passwordOk) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }
  res.json({
    token: tokenFor(organization.id, organization.email, organization.tokenVersion ?? 0),
    organization: publicOrg(organization),
  });
}));

authRouter.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  await db.bumpTokenVersion(getAuth(req).orgId);
  res.json({ ok: true });
}));

authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const { orgId } = getAuth(req);
  const organization = await db.findOrgById(orgId);
  if (!organization) {
    res.status(401).json({ error: "Organization not found." });
    return;
  }
  res.json({
    organization: publicOrg(organization),
    usage: await db.usageCounts(orgId),
  });
}));
