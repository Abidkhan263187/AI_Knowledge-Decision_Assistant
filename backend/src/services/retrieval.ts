import { db } from "../lib/store.js";

const STOP = new Set(
  "a an the and or of to for in on at is are was were be been being with from by as that this these those it its if then than not no yes can may must should would could how what when where who why which will your you we they their our".split(
    " "
  )
);

const FUNCTION = new Set(
  "a an the and or of to for in on at is are was be do does did can may will my me we you your how what when where who why which about tell please with from by as it its if not no yes long many much per".split(
    " "
  )
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function squeeze(token: string): string {
  return token.replace(/([a-z])\1{2,}/g, "$1$1");
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function damerau1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return i + 1 < a.length && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i++;
  return shorter.slice(i) === longer.slice(i + 1);
}

function dictionary(chunks: { content: string; filename?: string }[]): Map<string, string[]> {
  const words = new Set<string>();
  for (const chunk of chunks) {
    const text = `${chunk.filename || ""} ${chunk.content}`.toLowerCase();
    for (const raw of text.split(/[^a-z0-9]+/)) {
      if (raw.length >= 3 && raw.length <= 30 && !/^\d+$/.test(raw)) words.add(raw);
    }
  }
  const buckets = new Map<string, string[]>();
  for (const word of words) {
    const key = `${word[0]}:${word.length}`;
    const list = buckets.get(key);
    if (list) list.push(word);
    else buckets.set(key, [word]);
  }
  return buckets;
}

function bucketWords(slice: string, buckets: Map<string, string[]>): string[] {
  const out: string[] = [];
  for (let len = Math.max(3, slice.length - 1); len <= slice.length + 4; len++) {
    const list = buckets.get(`${slice[0]}:${len}`);
    if (list) out.push(...list);
  }
  return out;
}

function resolveWord(slice: string, buckets: Map<string, string[]>): string | null {
  const exact = buckets.get(`${slice[0]}:${slice.length}`)?.includes(slice);
  if (exact) return slice;
  if (slice.length <= 5 && FUNCTION.has(slice)) return slice;
  let fuzzy: string | null = null;
  let fuzzyCount = 0;
  let prefix: string | null = null;
  let prefixGap = 99;
  for (const word of bucketWords(slice, buckets)) {
    if (word === slice) return slice;
    if (slice.length >= 5 && damerau1(slice, word) && commonPrefix(slice, word) >= 4) {
      fuzzyCount++;
      fuzzy = word;
    }
    if (slice.length >= 6 && word.startsWith(slice) && word.length - slice.length > 0 && word.length - slice.length <= 4) {
      const gap = word.length - slice.length;
      if (gap < prefixGap) {
        prefix = word;
        prefixGap = gap;
      }
    }
  }
  if (fuzzyCount === 1) return fuzzy;
  return prefix;
}

function segment(token: string, buckets: Map<string, string[]>): string[] | null {
  const n = token.length;
  if (n < 6 || n > 48) return null;
  const dp: (string[] | null)[] = Array(n + 1).fill(null);
  dp[0] = [];
  for (let i = 0; i < n; i++) {
    const prev = dp[i];
    if (!prev) continue;
    const max = Math.min(n, i + 24);
    for (let j = i + 2; j <= max; j++) {
      const word = resolveWord(token.slice(i, j), buckets);
      if (!word) continue;
      if (word.length < 3 && !FUNCTION.has(word)) continue;
      const next = [...prev, word];
      const cur = dp[j];
      if (!cur || next.length < cur.length) dp[j] = next;
    }
  }
  const result = dp[n];
  if (!result || result.length < 2) return null;
  if (!result.some((word) => word.length >= 4 && !FUNCTION.has(word))) return null;
  return result;
}

function expandAlpha(token: string, buckets: Map<string, string[]>): string[] {
  const whole = resolveWord(token, buckets);
  if (whole && (buckets.get(`${whole[0]}:${whole.length}`)?.includes(whole) || whole === token)) {
    if (whole === token || damerau1(token, whole) || (token.length >= 6 && whole.startsWith(token))) return [whole];
  }
  const parts = segment(token, buckets);
  if (parts) return parts;
  return [whole || token];
}

function expandToken(token: string, buckets: Map<string, string[]>): string[] {
  const squeezed = squeeze(token);
  const numbered = squeezed.match(/^([a-z]{3,})(\d+(?:\.\d+)?)$/) || squeezed.match(/^(\d+(?:\.\d+)?)([a-z]{3,})$/);
  if (numbered) {
    const wordFirst = /[a-z]/.test(numbered[1]);
    const word = wordFirst ? numbered[1] : numbered[2];
    const num = wordFirst ? numbered[2] : numbered[1];
    const words = expandAlpha(word, buckets);
    return wordFirst ? [...words, num] : [num, ...words];
  }
  return expandAlpha(squeezed, buckets);
}

function normalizeWith(question: string, buckets: Map<string, string[]>): string {
  if (!buckets.size) return question.trim();
  const pieces: string[] = [];
  for (const raw of question.toLowerCase().split(/[^a-z0-9.]+/)) {
    if (!raw) continue;
    if (/^\d+(?:\.\d+)?$/.test(raw) || raw.length < 4) {
      pieces.push(raw);
      continue;
    }
    pieces.push(...expandToken(raw, buckets));
  }
  return pieces.join(" ");
}

export function questionRepair(chunks: { content: string; filename?: string }[]) {
  const buckets = dictionary(chunks);
  return (question: string) => normalizeWith(question, buckets);
}

export function normalizeQuestion(question: string, chunks: { content: string; filename?: string }[]): string {
  return questionRepair(chunks)(question);
}

function score(queryTokens: string[], content: string): number {
  const contentTokens = tokens(content);
  if (!contentTokens.length) return 0;
  const freq = new Map<string, number>();
  for (const t of contentTokens) freq.set(t, (freq.get(t) || 0) + 1);
  let s = 0;
  for (const t of queryTokens) {
    const f = freq.get(t) || 0;
    if (f) s += 1 + Math.log(1 + f);
  }
  const phrase = queryTokens.join(" ");
  if (phrase.length > 4 && content.toLowerCase().includes(phrase)) s += 3;
  return s;
}

export type RetrievedChunk = {
  documentId: string;
  filename: string;
  pageNumber: number;
  content: string;
  score: number;
};

type ScorableChunk = {
  documentId: string;
  filename: string;
  pageNumber: number;
  content: string;
};

function rankChunks(chunks: ScorableChunk[], query: string, limit: number): RetrievedChunk[] {
  const qTokens = tokens(query);
  if (!qTokens.length) return [];

  return chunks
    .map((c) => ({
      documentId: c.documentId,
      filename: c.filename,
      pageNumber: c.pageNumber,
      content: c.content,
      score: score(qTokens, c.content),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function scoreChunks(chunks: ScorableChunk[], question: string, limit = 6): RetrievedChunk[] {
  return rankChunks(chunks, normalizeQuestion(question, chunks), limit);
}

export function scoreNormalized(chunks: ScorableChunk[], question: string, limit = 6): RetrievedChunk[] {
  return rankChunks(chunks, question, limit);
}

const MIN_EVIDENCE_SUPPORT = 0.3;

export function evidenceIsWeak(chunks: { score?: number }[]): boolean {
  if (!chunks.length) return true;
  const best = Math.max(...chunks.map((chunk) => chunk.score || 0));
  return best / 8 < MIN_EVIDENCE_SUPPORT;
}

export function keepStrongChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  if (!chunks.length) return [];
  const best = Math.max(...chunks.map((chunk) => chunk.score));
  const floor = Math.max(2.5, best * 0.45);
  return chunks.filter((chunk) => chunk.score >= floor);
}

export function mergeChunks(groups: RetrievedChunk[][], limit = 8): RetrievedChunk[] {
  const map = new Map<string, RetrievedChunk>();
  for (const group of groups) {
    for (const chunk of group) {
      const key = `${chunk.documentId}:${chunk.pageNumber}:${chunk.content.slice(0, 80)}`;
      const prev = map.get(key);
      if (!prev || chunk.score > prev.score) map.set(key, chunk);
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function retrieveForOrg(organizationId: string, question: string, limit = 6): Promise<RetrievedChunk[]> {
  const chunks = await db.chunksForOrg(organizationId);
  return scoreChunks(chunks, question, limit);
}

export function formatEvidence(chunks: RetrievedChunk[]): string {
  return chunks.map((c, i) => `[${i + 1}] ${c.filename} — Page ${c.pageNumber}\n${c.content}`).join("\n\n");
}
