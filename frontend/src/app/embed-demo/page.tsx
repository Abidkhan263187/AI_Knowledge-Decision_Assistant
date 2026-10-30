"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function EmbedInner() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const src = token ? `/widget/${token}` : "";
  return (
    <main className="min-h-screen bg-slate-100 px-8 py-10 text-slate-900">
      <h1 className="text-2xl font-semibold">External university website (demo)</h1>
      <p className="mt-2 max-w-xl text-slate-600">
        This page represents a third-party site. The assistant is embedded and does not require login.
      </p>
      {src ? (
        <iframe title="Knowledge Assistant" src={src} className="mt-8 h-[560px] w-[380px] rounded-lg border border-slate-300 bg-white shadow-sm" />
      ) : (
        <p className="mt-6 text-red-600">Missing assistant token in the URL.</p>
      )}
    </main>
  );
}

export default function EmbedDemoPage() {
  return (
    <Suspense fallback={<p className="p-8 text-slate-600">Loading embed demo…</p>}>
      <EmbedInner />
    </Suspense>
  );
}
