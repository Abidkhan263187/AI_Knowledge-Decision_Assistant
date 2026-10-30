import { HttpError } from "../lib/http.js";
import { db } from "../lib/store.js";
import { evidenceIsWeak, keepStrongChunks, mergeChunks, scoreNormalized, questionRepair, formatEvidence, type RetrievedChunk } from "./retrieval.js";
import {
  decomposeQuestion,
  generateAnswer,
  generateSmallTalk,
  hasLlmKey,
  classifyIntent,
  type ChatTurn,
} from "./llm.js";

export type { ChatTurn };

const MAX_QUESTION = 2000;
const POLICY_HINT = "minimum GPA first-year sports scholarship merit scholarship";

function clip(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}…`;
}

type SocialKind = "greeting" | "thanks" | "goodbye" | "identity";

const SOCIAL: Record<SocialKind, string[]> = {
  greeting: ["hi", "hii", "hello", "hey", "heya", "howdy", "yo", "goodmorning", "goodafternoon", "goodevening", "hithere", "hellothere"],
  thanks: ["thanks", "thankyou", "thx", "ty", "thanku", "nothanks", "nothankyou", "nothanku"],
  goodbye: ["bye", "goodbye", "seeyou", "cya", "takecare", "goodnight"],
  identity: ["whoareyou", "whatcanyoudo", "howareyou", "howru", "howruyou", "howsitgoing", "whatsup", "wazzup", "sup"],
};

function detectSocial(question: string): SocialKind | null {
  const key = question.toLowerCase().replace(/[^a-z]/g, "");
  if (!key || key.length > 28) return null;
  for (const [kind, keys] of Object.entries(SOCIAL) as [SocialKind, string[]][]) {
    if (keys.includes(key)) return kind;
  }
  return null;
}

function socialTemplate(kind: SocialKind, orgName: string): string {
  if (kind === "thanks") return "You're welcome. Ask whenever you have a question about this organization's documents.";
  if (kind === "goodbye") return `Goodbye. You can come back anytime with questions about ${orgName}.`;
  if (kind === "identity") {
    return `I'm the ${orgName} knowledge assistant. I answer from this organization's uploaded documents.`;
  }
  return `Hello. I'm the ${orgName} assistant. Ask me about the uploaded documents.`;
}

function fallbackAnswer(chunks: RetrievedChunk[]): string {
  const cites = chunks.slice(0, 2).map((c) => `${c.filename} — Page ${c.pageNumber}`).join("; ");
  return `**Answer:** ${clip(chunks[0]?.content || "")}\n\n**Source:** ${cites}`;
}

function uniqueReferences(chunks: RetrievedChunk[]) {
  const seen = new Set<string>();
  const references: { filename: string; page: number; snippet: string }[] = [];
  for (const chunk of chunks) {
    const key = `${chunk.filename}:${chunk.pageNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({ filename: chunk.filename, page: chunk.pageNumber, snippet: chunk.content.slice(0, 220) });
    if (references.length === 3) break;
  }
  return references;
}

function refusal(docNames: string[]): string {
  return docNames.length
    ? `I could not find that in this organization's knowledge base. I can help with: ${docNames.join(", ")}.`
    : "I could not find this in the knowledge base, and no documents are uploaded yet.";
}

function userTurns(history: ChatTurn[]): ChatTurn[] {
  return history.filter((turn) => turn.role === "user");
}

/** Short replies that only make sense with the previous question (yes, 3.7, year 2). */
export function isFollowUpFragment(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (/^(what|how|when|where|who|why|which|can|could|is|are|do|does|did|tell|explain|show|list|give)\b/i.test(q)) {
    return false;
  }
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  if (/^(yes|yeah|yep|yup|no|nope|ok|okay|sure|correct|right)\b[.!]?$/i.test(q)) return true;
  if (/^(gpa\s*)?\d+(\.\d+)?%?$/i.test(q)) return true;
  return /^(year\s+)?(1|2|3|4|one|two|three|four|first|second|third|fourth|1st|2nd|3rd|4th)(\s+year)?$/i.test(q);
}

function looksLikeSmallTalk(question: string): boolean {
  const q = question.trim();
  if (q.length > 32 || /[?\d]/.test(q)) return false;
  if (/^(what|how|when|where|who|why|which|can|is|are|do|does)\b/i.test(q)) return false;
  return q.split(/\s+/).filter(Boolean).length <= 4;
}

async function resolveSocial(question: string, history: ChatTurn[]): Promise<SocialKind | null> {
  const fast = detectSocial(question);
  if (fast) return fast;
  if (!looksLikeSmallTalk(question) || !hasLlmKey()) return null;
  try {
    const intent = await classifyIntent(question, userTurns(history));
    if (intent === "knowledge" || intent === "followup") return null;
    return intent;
  } catch {
    return null;
  }
}

export async function askQuestion(
  organizationId: string,
  question: string,
  orgName: string,
  history: ChatTurn[] = []
) {
  const trimmed = question.trim();
  if (!trimmed) throw new HttpError(400, "Please enter a question.");
  if (trimmed.length > MAX_QUESTION) {
    throw new HttpError(400, `Please keep questions under ${MAX_QUESTION} characters.`);
  }

  const social = await resolveSocial(trimmed, history);
  if (social) {
    let answer = socialTemplate(social, orgName);
    if (hasLlmKey()) {
      try {
        answer = await generateSmallTalk(orgName, trimmed, userTurns(history));
      } catch {
        /* keep the short template if the LLM is down */
      }
    }
    await db.addUsage(organizationId, "answered");
    return {
      answer,
      status: "answered" as const,
      references: [] as { filename: string; page: number; snippet: string }[],
    };
  }

  const stored = await db.chunksForOrg(organizationId);
  const repair = questionRepair(stored);
  const asked = repair(trimmed);
  const wordCount = asked.split(/\s+/).filter(Boolean).length;
  const lastUser = [...history].reverse().find((t) => t.role === "user")?.content;
  const prior = lastUser ? repair(lastUser) : undefined;
  const followUp = Boolean(prior && isFollowUpFragment(trimmed));
  const searchText = followUp ? `${prior}. ${asked}` : asked;

  const wantsPolicy = /eligible|eligibility|qualify|scholarship|gpa|first[-\s]?year|sports scholarship/i.test(searchText);
  const documents = await db.listDocuments(organizationId);
  const primary = scoreNormalized(stored, searchText);
  const extra = wantsPolicy ? scoreNormalized(stored, `${searchText} ${POLICY_HINT}`, 4) : [];
  const chunks = keepStrongChunks(mergeChunks([primary, extra]));
  const docNames = documents.map((d) => d.filename);

  if (evidenceIsWeak(chunks)) {
    await db.addUsage(organizationId, "unable");
    return {
      answer: refusal(docNames),
      status: "unable" as const,
      references: [] as { filename: string; page: number; snippet: string }[],
    };
  }

  const evidence = formatEvidence(chunks);
  let status: "answered" | "unable" | "review" = "unable";
  let answer: string;
  const simpleLookup = wordCount <= 16;

  try {
    if (hasLlmKey()) {
      const decomposition = simpleLookup
        ? "1. What does the retrieved text say about this question?"
        : await decomposeQuestion(asked, evidence);
      answer = await generateAnswer({
        question: asked,
        priorQuestion: followUp ? prior : undefined,
        evidence,
        decomposition,
        availableDocs: docNames,
      });
      status = "answered";
    } else {
      answer = fallbackAnswer(chunks);
      status = "answered";
    }
  } catch (err) {
    console.error(err);
    answer = fallbackAnswer(chunks);
    status = "review";
  }

  await db.addUsage(organizationId, status);

  return {
    answer,
    status,
    references: uniqueReferences(chunks),
  };
}
