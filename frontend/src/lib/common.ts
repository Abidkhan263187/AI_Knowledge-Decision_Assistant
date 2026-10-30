import { getToken } from "@/lib/api";

export type Org = { name: string; email: string; assistantToken: string };
export type Doc = {
  id: string;
  filename: string;
  pageCount: number;
  sizeBytes: number;
  createdAt: string;
  chunkCount: number;
};
export type Assistant = { token: string; assistantUrl: string; widgetUrl: string; embedCode: string };
export type Usage = { asked: number; answered: number; unable: number; review: number; documents: number };

export function hasSession() {
  return Boolean(getToken());
}

export function isSessionError(message: string) {
  return /login required|session expired|organization not found/i.test(message);
}

export function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function embedSnippet(token: string, origin: string) {
  return `<iframe src="${origin}/widget/${token}" width="380" height="560" title="Knowledge Assistant"></iframe>`;
}

export function usageCards(usage: Usage | null, documentCount: number): [string, number][] {
  return [
    ["Documents", usage?.documents ?? documentCount],
    ["Questions asked", usage?.asked ?? 0],
    ["Answered", usage?.answered ?? 0],
    ["Unable to answer", usage?.unable ?? 0],
    ["Needs review", usage?.review ?? 0],
  ];
}
