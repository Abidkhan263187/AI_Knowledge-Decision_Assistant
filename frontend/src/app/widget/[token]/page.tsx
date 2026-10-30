"use client";

import { useParams } from "next/navigation";
import { Chat } from "@/components/Chat";

export default function WidgetPage() {
  const params = useParams<{ token: string }>();
  return (
    <main className="h-screen bg-white">
      <Chat token={params.token} compact />
    </main>
  );
}
