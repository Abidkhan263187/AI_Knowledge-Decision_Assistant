"use client";

import { useParams } from "next/navigation";
import { Chat } from "@/components/Chat";

export default function AssistantPage() {
  const params = useParams<{ token: string }>();
  return (
    <main className="flex h-screen justify-center bg-slate-200">
      <div className="flex h-full w-full max-w-3xl flex-col border-x border-slate-300 bg-white shadow-sm">
        <Chat token={params.token} />
      </div>
    </main>
  );
}
