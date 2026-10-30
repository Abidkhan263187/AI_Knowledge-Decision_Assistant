import type { Org } from "@/lib/common";

export function DashboardHeader({ org, onLogout, loading }: { org: Org; onLogout: () => void; loading: boolean }) {
  return (
    <header className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-6 py-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Dashboard</p>
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        <p className="text-sm text-slate-600">{org.email}</p>
      </div>
      <button
        onClick={onLogout}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-50 hover:text-red-600 hover:shadow-md active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        <span>{loading ? "Logging out..." : "Log out"}</span>
      </button>
    </header>
  );
}
