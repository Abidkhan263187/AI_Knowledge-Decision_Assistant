import { Router } from "express";
import { randomUUID } from "node:crypto";
import { asyncHandler } from "../lib/http.js";
import { db } from "../lib/store.js";
import { getAuth, requireAuth } from "../middleware/auth.js";

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

function urls(token: string) {
  const origin = process.env.FRONTEND_URL || "http://localhost:3000";
  const assistantUrl = `${origin}/a/${token}`;
  const widgetUrl = `${origin}/widget/${token}`;
  const embedCode = `<iframe src="${widgetUrl}" width="380" height="560" title="Knowledge Assistant"></iframe>`;
  return { assistantUrl, widgetUrl, embedCode };
}

assistantRouter.get("/", asyncHandler(async (req, res) => {
  const { orgId } = getAuth(req);
  const organization = await db.findOrgById(orgId);
  if (!organization) {
    res.status(404).json({ error: "Organization not found." });
    return;
  }
  res.json({ token: organization.assistantToken, ...urls(organization.assistantToken) });
}));

assistantRouter.post("/regenerate", asyncHandler(async (req, res) => {
  const { orgId } = getAuth(req);
  const organization = await db.updateOrgToken(orgId, randomUUID());
  if (!organization) {
    res.status(404).json({ error: "Organization not found." });
    return;
  }
  res.json({ token: organization.assistantToken, ...urls(organization.assistantToken) });
}));
