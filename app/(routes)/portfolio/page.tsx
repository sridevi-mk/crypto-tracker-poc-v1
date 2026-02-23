"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { WalletConnectButton } from "../../../components/WalletConnectButton";
import { PortfolioHoldingsTable } from "../../../components/PortfolioHoldingsTable";
import { DataSourceNote } from "../../../components/DataSourceNote";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface PortfolioResponse {
  address: string;
  native: {
    symbol: string;
    balance: string;
    usd_price: number | null;
    usd_value: number | null;
  };
  tokens: {
    contract: string;
    symbol: string;
    name: string;
    decimals: number;
    balance: string;
    usd_price: number | null;
    usd_value: number | null;
  }[];
  total_usd_value: number;
}

interface PreferencesResponse {
  selected_currency: string;
  updated_at: string;
}

interface WalletsResponse {
  wallets: string[];
}

export default function PortfolioPage() {
  const [signingOut, setSigningOut] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);
  const syncedAddressRef = useRef<string | null>(null);
  const { address, isConnected } = useAccount();

  const sessionQuery = useQuery<{ isAuthenticated: boolean }>({
    queryKey: ["auth-session"],
    queryFn: async () => {
      const res = await fetch("/api/auth/session");
      if (!res.ok) throw new Error("Failed to check auth session");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data, isLoading, error } = useQuery<PortfolioResponse>({
    queryKey: ["portfolio-balances", address],
    queryFn: async () => {
      const res = await fetch(`/api/portfolio/balances?address=${address}`);
      if (!res.ok) throw new Error("Failed to fetch portfolio balances");
      return res.json();
    },
    enabled: Boolean(sessionQuery.data?.isAuthenticated && isConnected && address),
    staleTime: 30_000,
  });

  const preferencesQuery = useQuery<PreferencesResponse>({
    queryKey: ["user-preferences"],
    queryFn: async () => {
      const res = await fetch("/api/user/preferences");
      if (!res.ok) throw new Error("Failed to fetch user preferences");
      return res.json();
    },
    enabled: Boolean(sessionQuery.data?.isAuthenticated),
    staleTime: 30_000,
  });

  const walletsQuery = useQuery<WalletsResponse>({
    queryKey: ["user-wallets"],
    queryFn: async () => {
      const res = await fetch("/api/user/wallets");
      if (!res.ok) throw new Error("Failed to fetch saved wallets");
      return res.json();
    },
    enabled: Boolean(sessionQuery.data?.isAuthenticated),
    staleTime: 30_000,
  });


  useEffect(() => {
    if (!preferencesQuery.data) return;
    setSelectedCurrency(preferencesQuery.data.selected_currency || "USD");
  }, [preferencesQuery.data]);

  useEffect(() => {
    if (!sessionQuery.data?.isAuthenticated || !isConnected || !address) return;
    if (syncedAddressRef.current?.toLowerCase() === address.toLowerCase()) return;

    const hasAddress = walletsQuery.data?.wallets?.some((w) => w.toLowerCase() === address.toLowerCase());
    if (hasAddress) {
      syncedAddressRef.current = address;
      return;
    }

    syncedAddressRef.current = address;
    void fetch("/api/user/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    }).then(() => walletsQuery.refetch());
  }, [address, isConnected, sessionQuery.data?.isAuthenticated, walletsQuery.data?.wallets, walletsQuery.refetch]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      sessionQuery.refetch();
    } finally {
      setSigningOut(false);
    }
  }

  async function handleSavePreferences() {
    setSavingPrefs(true);
    setPrefsMessage(null);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedCurrency,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setPrefsMessage(json?.error || "Failed to save preferences");
        return;
      }
      setPrefsMessage("Preferences saved");
      preferencesQuery.refetch();
    } catch {
      setPrefsMessage("Failed to save preferences");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleRemoveWallet(wallet: string) {
    await fetch("/api/user/wallets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: wallet }),
    });
    walletsQuery.refetch();
  }

  if (sessionQuery.isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-xl border border-border bg-panel p-4 text-sm text-mist shadow-panel">
          Preparing portfolio...
        </div>
      </main>
    );
  }

  if (!sessionQuery.data?.isAuthenticated) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-2xl border border-border bg-panel p-6 shadow-panel">
          <h1 className="text-2xl font-bold text-ink">Portfolio Access</h1>
          <p className="mt-2 text-sm text-mist">
            This route requires sign-in. Please authenticate to continue.
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              href="/signin?returnTo=%2Fportfolio"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Go to Sign In
            </Link>
            <Link
              href="/"
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
            >
              Back to Market
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 rounded-2xl border border-border bg-panel p-6 shadow-panel">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Portfolio</h1>
        <DataSourceNote className="mt-1" text="Alchemy (balances) + CoinGecko (USD pricing)" />
      </div>
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <WalletConnectButton />
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-60"
          >
            {signingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-panel p-4 shadow-panel">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mist">Preferences</h2>
          <p className="mt-1 text-xs text-mist">Saved per signed-in user. Currency preference is stored for upcoming conversion features.</p>
          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Display Currency</label>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="INR">INR</option>
              </select>
            </div>
            <button
              onClick={handleSavePreferences}
              disabled={savingPrefs}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {savingPrefs ? "Saving..." : "Save Preferences"}
            </button>
            {prefsMessage && <p className="text-xs text-mist">{prefsMessage}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-panel p-4 shadow-panel">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mist">Saved Wallets</h2>
          <p className="mt-1 text-xs text-mist">Connected wallet addresses are persisted here.</p>
          <div className="mt-3 space-y-2">
            {walletsQuery.data?.wallets?.length ? (
              walletsQuery.data.wallets.map((wallet) => (
                <div key={wallet} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2">
                  <span className="font-mono text-xs text-ink">{wallet}</span>
                  <button
                    onClick={() => handleRemoveWallet(wallet)}
                    className="rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-mist">No saved wallets yet.</p>
            )}
          </div>
        </div>
      </section>

      {!isConnected && (
        <div className="rounded-xl border border-border bg-panel p-4 shadow-panel">
          <div className="text-sm font-semibold text-ink">Connect your wallet to start</div>
          <p className="mt-1 text-sm text-mist">
            After connecting, this page will show your ETH and token balances, plus estimated USD values.
          </p>
          <p className="mt-1 text-xs text-mist">
            Your wallet is used for read-only balance lookups in this view.
          </p>
        </div>
      )}

      {isConnected && isLoading && <div className="text-sm text-mist">Loading holdings...</div>}

      {isConnected && error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error.message}</div>}

      {isConnected && data && (
        <div>
          <div className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
            USD values are estimates from current CoinGecko prices mapped by token symbol/ID.
            Unmapped tokens may show no USD price/value.
          </div>
          <div className="mb-4 rounded-xl border border-border bg-panel px-4 py-3 text-xl font-semibold text-ink shadow-panel">
            Total USD Value: $
            {data.total_usd_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <PortfolioHoldingsTable native={data.native} tokens={data.tokens} />
        </div>
      )}
    </main>
  );
}
