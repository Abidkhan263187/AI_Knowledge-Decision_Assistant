import { usageCards, type Usage } from "@/lib/common";

export function UsageStats({ usage, documentCount }: { usage: Usage | null; documentCount: number }) {
  return (
    <section className="grid gap-4 sm:grid-cols-5">
      {usageCards(usage, documentCount).map(([label, value]) => (
        <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
      ))}
    </section>
  );
}
