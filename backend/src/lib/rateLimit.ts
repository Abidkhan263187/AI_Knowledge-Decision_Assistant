import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; reset: number };

const buckets = new Map<string, Bucket>();
const inflight = new Map<string, number>();

const INFLIGHT_MAX = 2;

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.reset) buckets.delete(key);
  }
}

export function hitLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

export function rateLimit(max: number, windowMs: number, keyFn: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (hitLimit(keyFn(req), max, windowMs)) {
      res.status(429).json({ error: "Too many requests. Please wait and try again." });
      return;
    }
    next();
  };
}

export function tryAcquire(orgId: string): boolean {
  const current = inflight.get(orgId) || 0;
  if (current >= INFLIGHT_MAX) return false;
  inflight.set(orgId, current + 1);
  return true;
}

export function release(orgId: string): void {
  const next = (inflight.get(orgId) || 1) - 1;
  if (next <= 0) inflight.delete(orgId);
  else inflight.set(orgId, next);
}

export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}
