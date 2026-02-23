"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const returnTo = searchParams.get("returnTo") || "/portfolio";

  async function handleSignIn() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || "Sign in failed");
        return;
      }
      router.push(returnTo);
      router.refresh();
    } catch {
      setError("Unable to sign in right now");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="rounded-2xl border border-border bg-panel p-6 shadow-panel">
        <h1 className="text-2xl font-bold text-ink">Sign In</h1>
        <p className="mt-2 text-sm text-mist">Sign in to access protected routes and your saved data.</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-mist">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none ring-cyan-200 focus:ring-2"
              placeholder="Enter username"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-mist">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none ring-cyan-200 focus:ring-2"
              placeholder="Enter password"
            />
          </div>
        </div>

        {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="mt-6 flex gap-2">
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <Link
            href="/"
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
          >
            Back
          </Link>
          <Link
            href={`/signup?returnTo=${encodeURIComponent(returnTo)}`}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
          >
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}
