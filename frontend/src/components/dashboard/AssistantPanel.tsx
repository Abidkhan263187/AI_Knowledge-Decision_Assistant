import { embedSnippet, type Assistant } from "@/lib/common";

export function AssistantPanel({
  assistant,
  origin,
  copied,
  onCopy,
  onRegenerate,
}: {
  assistant: Assistant;
  origin: string;
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
}) {
  const snippet = embedSnippet(assistant.token, origin);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Assistant</h2>
      <p className="mt-2 break-all text-sm">
        Public URL:{" "}
        <a className="font-medium text-slate-900 underline" href={assistant.assistantUrl} target="_blank" rel="noreferrer">
          {assistant.assistantUrl}
        </a>
      </p>
      <p className="mt-3 text-sm font-medium">Embed code</p>
      <textarea readOnly className="mt-1 h-24 w-full rounded-lg border border-slate-300 p-2 text-xs" value={snippet} />
      <div className="mt-3 flex gap-2">
        <button className="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={onCopy}>
          {copied ? "Copied" : "Copy embed code"}
        </button>
        <button className="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={onRegenerate}>
          Regenerate token
        </button>
        <a href={`/embed-demo?token=${assistant.token}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          Open embed demo
        </a>
      </div>
      <p className="mt-3 text-xs text-slate-500">Paste this into an HTML page or a React component.</p>
    </section>
  );
}
