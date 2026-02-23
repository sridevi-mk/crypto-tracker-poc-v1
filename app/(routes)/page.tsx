"use client";
import { useQuery } from '@tanstack/react-query';
import { MarketSnapshot } from '../../components/MarketSnapshot';
import { MarketTable } from '../../components/MarketTable';
import { DataSourceNote } from '../../components/DataSourceNote';
import Link from 'next/link';

const REFRESH_MS = Number(process.env.NEXT_PUBLIC_REFRESH_MS) || 30000;

export default function MarketPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['market-top'],
    queryFn: async () => {
      const res = await fetch('/api/market/top');
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          body?.error
            ? `${body.error}${body?.status ? ` (${body.status})` : ''}`
            : 'Failed to fetch';
        throw new Error(message);
      }
      return body;
    },
    refetchInterval: REFRESH_MS,
    staleTime: 30000,
  });

  const items = data?.coins || [];
  const meta = data?.meta;
  const showEmpty = !isLoading && !error && items.length === 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <section className="relative mb-6 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950 p-6 shadow-panel sm:p-8">
        <div className="pointer-events-none absolute -top-16 -left-20 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 -bottom-20 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/90">Crypto Intelligence Hub</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Market Overview</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
            Track live crypto market movement, compare top assets, and jump to advanced analytics from one place.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span>New to crypto?</span>
            <Link
              href="/guide"
              title="Open a beginner-friendly explanation of crypto terms and this app's metrics"
              className="inline-flex items-center rounded-full border border-cyan-300/50 bg-cyan-400/10 px-3 py-1.5 font-semibold text-cyan-200 transition hover:-translate-y-0.5 hover:bg-cyan-400/20 focus:outline-none focus:ring-2 focus:ring-cyan-300"
            >
              Read the quick guide
            </Link>
            <Link
              href="/dashboard"
              title="Open the Power BI-style dashboard with KPI cards, charts, and filters"
              className="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-400/10 px-3 py-1.5 font-semibold text-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-400/20 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              Open Dashboard View
            </Link>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-2 transition hover:border-cyan-300/60">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Live Prices</div>
              <div className="text-sm font-semibold text-white">Real-time market table</div>
            </div>
            <div className="rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-2 transition hover:border-cyan-300/60">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">Wallet Connect</div>
              <div className="text-sm font-semibold text-white">Portfolio-ready access</div>
            </div>
            <div className="rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-2 transition hover:border-cyan-300/60">
              <div className="text-[11px] uppercase tracking-wider text-slate-400">AI Assistant</div>
              <div className="text-sm font-semibold text-white">Tuffy insights on demand</div>
            </div>
          </div>

          <DataSourceNote
            className="mt-4 text-slate-300"
            source={meta?.source || "CoinGecko API (via `/api/market/top`)"} 
            lastUpdated={meta?.last_updated}
            stale={meta?.stale}
            cache={meta?.cache}
          />
        </div>
      </section>

      {isLoading && (
        <div className="mb-4 rounded-xl border border-border bg-panel p-4 shadow-panel">
          <div className="text-sm font-medium text-ink">Loading market data...</div>
          <div className="mt-1 text-xs text-mist">
            Fetching latest prices, market caps, and 24h performance.
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-sm font-semibold text-rose-700">Unable to load market data</div>
          <div className="mt-1 text-xs text-rose-700/90">
            {error.message}. Please retry in a few seconds.
          </div>
        </div>
      )}

      {showEmpty && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-800">No market rows found</div>
          <div className="mt-1 text-xs text-amber-800/90">
            Data source returned an empty list. Try refreshing or check API availability.
          </div>
        </div>
      )}

      <MarketSnapshot items={items} />
      <MarketTable items={items} isLoading={isLoading} error={error?.message} />
    </main>
  );
}
