import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new HttpError(400, message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function bodyError(err: unknown): { status: number; error: string } | null {
  if (typeof err !== "object" || err === null || !("type" in err)) return null;
  const type = String((err as { type: unknown }).type);
  if (type === "entity.too.large") return { status: 413, error: "Request is too large." };
  if (type === "entity.parse.failed") return { status: 400, error: "Request body is not valid JSON." };
  return null;
}
