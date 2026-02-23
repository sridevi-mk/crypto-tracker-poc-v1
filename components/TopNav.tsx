"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Market" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/screener", label: "Screener" },
  { href: "/chat", label: "AI Chat" },
  { href: "/nft", label: "NFT" },
  { href: "/guide", label: "Guide" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname();
  const sessionQuery = useQuery<{
    isAuthenticated: boolean;
    username: string | null;
  }>({
    queryKey: ["auth-session-nav"],
    queryFn: async () => {
      const res = await fetch("/api/auth/session");
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to fetch session");
      return body as { isAuthenticated: boolean; username: string | null };
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    sessionQuery.refetch();
  }, [pathname, sessionQuery]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-slate-950/80 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
        <span className="-ml-1 mr-6 inline-flex items-center rounded-lg border border-cyan-400/30 bg-slate-900/70 px-2.5 py-1 text-lg font-extrabold tracking-[0.08em] text-transparent bg-gradient-to-r from-cyan-300 via-sky-200 to-emerald-300 bg-clip-text shadow-[0_0_18px_rgba(56,189,248,0.22)] sm:text-xl">
          Crypto Tracker
        </span>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-cyan-500/20 text-cyan-200"
                  : "border border-border bg-slate-900/70 text-slate-200 hover:bg-slate-800"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <div className="ml-auto text-xs text-slate-400">
          {sessionQuery.data?.isAuthenticated && sessionQuery.data?.username
            ? `Signed in as ${sessionQuery.data.username}`
            : "Not signed in"}
        </div>
      </nav>
    </header>
  );
}
