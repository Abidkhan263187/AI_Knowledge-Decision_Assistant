type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type LlmIntent = "greeting" | "thanks" | "goodbye" | "identity" | "followup" | "knowledge";

function historyMessages(history: ChatTurn[]): ChatMessage[] {
  return history.slice(-6).map((t) => ({ role: t.role, content: t.content.slice(0, 500) }));
}

function provider() {
  return (process.env.LLM_PROVIDER || "groq").toLowerCase();
}

function config() {
  if (provider() === "openai") {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY || "",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }
  return {
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY || "",
    model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
  };
}

export function hasLlmKey() {
  return provider() === "openai" ? Boolean(process.env.OPENAI_API_KEY) : Boolean(process.env.GROQ_API_KEY);
}

export async function chat(messages: ChatMessage[], temperature = 0.2): Promise<string> {
  const { url, key, model } = config();
  if (!key) {
    throw new Error("LLM API key is missing. Set GROQ_API_KEY or OPENAI_API_KEY in backend/.env.");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, temperature, messages }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`LLM request failed (${res.status}).`, body.slice(0, 500));
    throw new Error(`LLM request failed (${res.status}).`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("LLM returned an empty response.");
  return text;
}

export async function decomposeQuestion(question: string, evidence: string): Promise<string> {
  return chat([
    {
      role: "system",
      content:
        "You understand user questions about organization policies. Decompose the question into independent sub-questions. Do not answer yet. Return short numbered sub-questions only.",
    },
    {
      role: "user",
      content: `Question:\n${question}\n\nRetrieved evidence (may be incomplete):\n${evidence || "(none)"}`,
    },
  ]);
}

export async function classifyIntent(question: string, history: ChatTurn[] = []): Promise<LlmIntent> {
  const raw = await chat(
    [
      {
        role: "system",
        content: `Classify the user message. Typos and missing spaces are allowed (howareyou, nothhankyou).
Reply with ONE word only:
greeting | thanks | goodbye | identity | followup | knowledge
- followup = short reply that continues the last assistant topic (yes, ok, 3.7, year 2)
- knowledge = asking about documents/policy
- identity = who are you / how are you / what can you do`,
      },
      ...historyMessages(history),
      { role: "user", content: question },
    ],
    0
  );
  const word = raw.toLowerCase().split(/[^a-z]+/).find(Boolean) || "";
  if (word === "greeting") return "greeting";
  if (word === "thanks") return "thanks";
  if (word === "goodbye") return "goodbye";
  if (word === "identity") return "identity";
  if (word === "followup") return "followup";
  return "knowledge";
}

export async function generateSmallTalk(orgName: string, question: string, history: ChatTurn[] = []): Promise<string> {
  return chat(
    [
      {
        role: "system",
        content: `You are ${orgName}'s knowledge assistant. The user is making small talk. Reply in 1-2 short sentences. Be warm. Do not invent policies. Invite them to ask about uploaded documents.`,
      },
      ...historyMessages(history),
      { role: "user", content: question },
    ],
    0.4
  );
}

export async function generateAnswer(input: {
  question: string;
  priorQuestion?: string;
  evidence: string;
  decomposition: string;
  availableDocs?: string[];
}): Promise<string> {
  const docs = input.availableDocs?.length ? input.availableDocs.join(", ") : "none listed";
  return chat([
    {
      role: "system",
      content: `You write short, structured answers for an organization knowledge assistant.
Use ONLY retrieved evidence. Do not invent policies.
Answer ONLY the current question. Never repeat an earlier answer.
If an earlier user question is provided, use it only to interpret a short follow-up. Do not answer that earlier question.

Use this shape and nothing else:

**Answer:** one direct sentence.

- up to 4 short facts, one idea each
- omit a bullet that only repeats the answer line

**Source:** Filename.pdf — Page N

Rules:
- No greeting, no "based on the documents", no restating the question.
- No extra headings, paragraphs, or closing summary.
- Do not ask a follow-up question.
- If evidence is missing, set **Answer:** to one sentence saying it is not in the knowledge base, add one bullet listing these documents: ${docs}, and set **Source:** to none.`,
    },
    {
      role: "user",
      content: `Current question (answer only this):
${input.question}
${input.priorQuestion ? `\nEarlier user question (context only — do not answer it again):\n${input.priorQuestion}\n` : ""}
Sub-questions:
${input.decomposition}

Evidence:
${input.evidence || "(no relevant passages retrieved)"}`,
    },
  ]);
}
