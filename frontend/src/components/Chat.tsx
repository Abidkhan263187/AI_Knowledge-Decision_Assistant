"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

type Reference = { filename: string; page: number; snippet: string };
type Msg = { role: "user" | "assistant"; text: string; references?: Reference[] };

function inlineText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>
  );
}

function AnswerText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  function flushBullets() {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`b-${blocks.length}`} className="mt-2 list-disc space-y-1 pl-4">
        {items.map((item, i) => (
          <li key={i}>{inlineText(item)}</li>
        ))}
      </ul>
    );
  }

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-snug [&:not(:first-child)]:mt-2">
        {inlineText(line)}
      </p>
    );
  }
  flushBullets();
  return <div>{blocks}</div>;
}

export function Chat({ token, compact = false }: { token: string; compact?: boolean }) {
  const [name, setName] = useState("Assistant");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Msg[]>([]);
  const sendingRef = useRef(false);
  messagesRef.current = messages;

  useEffect(() => {
    api<{ organizationName: string }>(`/api/ask/meta/${token}`, { method: "GET" }, false)
      .then((d) => setName(d.organizationName))
      .catch((e) => setError(e instanceof Error ? e.message : "Invalid assistant"));
  }, [token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || sendingRef.current) return;
    sendingRef.current = true;
    const history = messagesRef.current.slice(-6).map((m) => ({ role: m.role, content: m.text.slice(0, 500) }));
    setQuestion("");
    setError("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const data = await api<{
        answer: string;
        references: Reference[];
      }>("/api/ask", {
        method: "POST",
        body: JSON.stringify({
          token,
          question: q,
          history,
        }),
      }, false);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.answer, references: data.references },
      ]);
    } catch (err) {
      setMessages((m) => (m[m.length - 1]?.role === "user" && m[m.length - 1]?.text === q ? m.slice(0, -1) : m));
      setQuestion(q);
      setError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <div className={`flex h-full min-h-0 flex-col bg-white text-slate-900 ${compact ? "text-sm" : ""}`}>
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Knowledge assistant</p>
        <h2 className="mt-0.5 text-lg font-semibold text-slate-900">{name}</h2>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        {messages.length === 0 && (
          <div className="mx-auto mt-16 max-w-md rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
            Ask about policies, eligibility, or procedures in this organization&apos;s documents.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 ${
                m.role === "user"
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-800 ring-1 ring-slate-200"
              }`}
            >
              {m.role === "assistant" ? <AnswerText text={m.text} /> : <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>}
              {m.references && m.references.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs opacity-80">
                  {m.references.map((r) => (
                    <li key={`${r.filename}-${r.page}`}>
                      {r.filename} — Page {r.page}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-sm text-slate-500">Thinking…</p>}
        <div ref={endRef} />
      </div>
      {error && <p className="shrink-0 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      <form onSubmit={send} className="flex shrink-0 gap-2 border-t border-slate-200 bg-white p-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question"
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-slate-700"
        />
        <button disabled={loading} className="rounded-md bg-slate-900 px-5 py-2.5 font-medium text-white disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
}
