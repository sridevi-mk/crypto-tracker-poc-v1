"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/", label: "Market" },
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
    <header className="border-b border-border bg-white/80 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
        <span className="mr-2 text-sm font-semibold text-ink">CryptoTracker</span>
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-slate-900 text-white"
                  : "border border-border bg-white text-ink hover:bg-slate-50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <div className="ml-auto text-xs text-mist">
          {sessionQuery.data?.isAuthenticated && sessionQuery.data?.username
            ? `Signed in as ${sessionQuery.data.username}`
            : "Not signed in"}
        </div>
      </nav>
    </header>
  );
}
