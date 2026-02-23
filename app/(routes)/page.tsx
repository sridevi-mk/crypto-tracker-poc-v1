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
      <div className="mb-6 rounded-2xl border border-border bg-panel p-6 shadow-panel">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Market Overview</h1>
        <div className="mt-3 flex items-center gap-2 text-sm text-mist">
          <span>New to crypto?</span>
          <Link
            href="/guide"
            title="Open a beginner-friendly explanation of crypto terms and this app's metrics"
            className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 font-semibold text-cyan-700 transition hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            Read the quick guide
          </Link>
          <Link
            href="/dashboard"
            title="Open the Power BI-style dashboard with KPI cards, charts, and filters"
            className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            Open Dashboard View
          </Link>
        </div>
        <DataSourceNote
          className="mt-1"
          source={meta?.source || "CoinGecko API (via `/api/market/top`)"} 
          lastUpdated={meta?.last_updated}
          stale={meta?.stale}
          cache={meta?.cache}
        />
      </div>

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
