"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AssistantPanel } from "@/components/dashboard/AssistantPanel";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { KnowledgeBase } from "@/components/dashboard/KnowledgeBase";
import { UsageStats } from "@/components/dashboard/UsageStats";
import { api, clearToken } from "@/lib/api";
import { embedSnippet, errorText, hasSession, isSessionError, type Assistant, type Doc, type Org, type Usage } from "@/lib/common";

export default function DashboardPage() {
  const router = useRouter();
  const [org, setOrg] = useState<Org | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [limits, setLimits] = useState<{ maxDocuments: number; maxPages: number; maxBytes: number }>();
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [origin, setOrigin] = useState("http://localhost:3000");
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    const me = await api<{ organization: Org; usage: Usage }>("/api/auth/me");
    const documents = await api<{ documents: Doc[]; limits: { maxDocuments: number; maxPages: number; maxBytes: number } }>("/api/documents");
    const assist = await api<Assistant>("/api/assistant");
    setOrg(me.organization);
    setUsage(me.usage);
    setDocs(documents.documents);
    setLimits(documents.limits);
    setAssistant(assist);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    if (!hasSession()) {
      router.replace("/");
      return;
    }
    load().catch((err) => {
      const message = errorText(err, "Failed to load dashboard");
      if (isSessionError(message)) {
        clearToken();
        router.replace("/");
        return;
      }
      setError(message);
      setFailed(true);
    });
  }, [load, router]);

  async function onUpload(file: File) {
    setError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      await api("/api/documents", { method: "POST", body });
      await load();
    } catch (err) {
      setError(errorText(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(id: string) {
    setError("");
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorText(err, "Delete failed"));
    }
  }

  async function regenerate() {
    setError("");
    try {
      const assist = await api<Assistant>("/api/assistant/regenerate", { method: "POST" });
      setAssistant(assist);
    } catch (err) {
      setError(errorText(err, "Could not regenerate the assistant token."));
    }
  }

  async function logout() {
    setLoading(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      setLoading(false);
    } finally {
      clearToken();
      router.push("/");
      setLoading(false);
    }

  }

  async function copyEmbed() {
    if (!assistant) return;
    await navigator.clipboard.writeText(embedSnippet(assistant.token, origin));
    setCopied(true);
    setTimeout(() => setCopied(false), 5000);
  }

  if (failed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-slate-700">
        <p>{error}</p>
        <button
          onClick={() => {
            clearToken();
            router.replace("/");
          }}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm"
        >
          Back to sign in
        </button>
      </main>
    );
  }

  if (!org || !assistant) {
    return <main className="flex min-h-screen items-center justify-center text-slate-500">Loading dashboard…</main>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10 text-slate-900">
      <DashboardHeader org={org} onLogout={logout} loading={loading} />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <UsageStats usage={usage} documentCount={docs.length} />
      <KnowledgeBase docs={docs} uploading={uploading} limits={limits} onUpload={onUpload} onRemove={removeDoc} />
      <AssistantPanel
        assistant={assistant}
        origin={origin}
        copied={copied}
        onCopy={copyEmbed}
        onRegenerate={regenerate}
      />
    </main>
  );
}
