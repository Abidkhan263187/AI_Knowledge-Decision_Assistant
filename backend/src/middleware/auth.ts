import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../lib/store.js";

export type AuthPayload = { orgId: string; email: string; tv?: number };

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET || "";
  if (secret.length < 16) {
    throw new Error("JWT_SECRET must be set to a random string of at least 16 characters.");
  }
  return secret;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Login required to access the dashboard." });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), jwtSecret()) as AuthPayload;
    const organization = await db.findOrgById(payload.orgId);
    if (!organization || (payload.tv ?? 0) !== (organization.tokenVersion ?? 0)) {
      res.status(401).json({ error: "Session expired. Please log in again." });
      return;
    }
    (req as Request & { auth: AuthPayload }).auth = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: "Session expired. Please log in again." });
      return;
    }
    next(err);
  }
}

export function getAuth(req: Request): AuthPayload {
  return (req as Request & { auth: AuthPayload }).auth;
}
