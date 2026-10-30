"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { errorText, hasSession } from "@/lib/common";
import { Eye, EyeOff } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    if (hasSession()) {
      router.replace("/dashboard");
      return;
    }
    setShowForm(true);
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }, false);
      setToken(data.token);
      router.push("/dashboard");
    } catch (err) {
      setError(errorText(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  if (!showForm) {
    return <main className="flex min-h-screen items-center justify-center text-slate-500">Loading…</main>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Knowledge Assistant</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Manage your organization&apos;s knowledge base and assistant.</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-700" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password

            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 pr-10 outline-none transition-all duration-200 focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 transition-colors duration-200 hover:text-slate-900 active:scale-95"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={loading} className="w-full rounded-md bg-slate-900 py-2.5 font-medium text-white">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-5 text-sm text-slate-600">
          New organization? <Link className="font-medium text-slate-900 underline" href="/register">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
