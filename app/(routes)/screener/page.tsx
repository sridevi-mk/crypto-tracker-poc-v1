"use client";
import { useQuery } from '@tanstack/react-query';
import { MarketTable } from '../../../components/MarketTable';
import { DataSourceNote } from '../../../components/DataSourceNote';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const REFRESH_MS = Number(process.env.NEXT_PUBLIC_REFRESH_MS) || 30000;

export default function ScreenerPage() {
  const [nlQuery, setNlQuery] = useState('');
  const [preset, setPreset] = useState<{
    search?: string;
    sort?: "current_price" | "price_change_percentage_24h" | "market_cap" | "total_volume";
    desc?: boolean;
    direction?: "all" | "gainers" | "losers";
    minMarketCap?: number;
    limit?: number;
  } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['market-top'],
    queryFn: async () => {
      const res = await fetch('/api/market/top');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    refetchInterval: REFRESH_MS,
    staleTime: 30000,
  });

  const items = data?.coins || [];
  const meta = data?.meta;
  const examples = useMemo(
    () => [
      'top gainers by volume',
      'losers market cap asc',
      'bitcoin',
      'top 50 gainers above 10b market cap',
      'volume desc',
    ],
    []
  );

  function parseNaturalLanguage(input: string) {
    const q = input.trim().toLowerCase();
    const next: NonNullable<typeof preset> = {
      search: '',
      sort: 'market_cap',
      desc: true,
      direction: 'all',
      minMarketCap: 0,
      limit: 0,
    };

    if (!q) return next;

    if (q.includes('gainer') || q.includes('bullish') || q.includes('up')) {
      next.direction = 'gainers';
    } else if (q.includes('loser') || q.includes('bearish') || q.includes('down')) {
      next.direction = 'losers';
    }

    if (q.includes('price')) next.sort = 'current_price';
    if (q.includes('24h') || q.includes('change')) next.sort = 'price_change_percentage_24h';
    if (q.includes('market cap') || q.includes('cap')) next.sort = 'market_cap';
    if (q.includes('volume')) next.sort = 'total_volume';

    if (q.includes('asc') || q.includes('lowest') || q.includes('smallest')) next.desc = false;
    if (q.includes('desc') || q.includes('highest') || q.includes('largest') || q.includes('top')) next.desc = true;

    const bMatch = q.match(/(\d+)\s*b/);
    const mMatch = q.match(/(\d+)\s*m/);
    const topMatch = q.match(/top\s+(\d+)/);
    if (bMatch) next.minMarketCap = Number(bMatch[1]) * 1_000_000_000;
    if (mMatch) next.minMarketCap = Number(mMatch[1]) * 1_000_000;
    if (topMatch) next.limit = Number(topMatch[1]);

    const clean = q
      .replace(/top\s+\d+/g, '')
      .replace(/gainers?|losers?|bullish|bearish|up|down/g, '')
      .replace(/market cap|cap|volume|price|24h|change|asc|desc|highest|lowest|largest|smallest|above/g, '')
      .replace(/\b(top|by|with|from|only|show|coins?|token|tokens)\b/g, '')
      .replace(/\d+\s*[bm]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    next.search = clean.length >= 2 ? clean : '';

    return next;
  }

  function applyNl() {
    setPreset(parseNaturalLanguage(nlQuery));
  }

  function clearNl() {
    setNlQuery('');
    setPreset({
      search: '',
      sort: 'market_cap',
      desc: true,
      direction: 'all',
      minMarketCap: 0,
      limit: 0,
    });
  }

  const activePreset = preset || {
    search: '',
    sort: 'market_cap',
    desc: true,
    direction: 'all',
    minMarketCap: 0,
    limit: 0,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 rounded-2xl border border-border bg-panel p-6 shadow-panel">
        <div className="mb-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
            title="Return to the main market overview page"
          >
            Back to Main Page
          </Link>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Market Screener</h1>
        <p className="mt-2 text-sm text-mist">
          Use this page to quickly search, sort, and compare coins by price, 24h change, market cap, and volume.
        </p>
        <DataSourceNote
          className="mt-1"
          source={meta?.source || "CoinGecko API (via `/api/market/top`)"} 
          lastUpdated={meta?.last_updated}
          stale={meta?.stale}
          cache={meta?.cache}
        />
      </div>
      {meta?.stale && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Live source is temporarily unavailable. Showing cached market data.
        </div>
      )}
      <div className="mb-4 rounded-xl border border-border bg-panel p-4 shadow-panel">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">Natural Language Screener</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={nlQuery}
            onChange={(e) => setNlQuery(e.target.value)}
            placeholder="Example: top gainers above 10b market cap"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none ring-cyan-200 transition focus:ring-2"
          />
          <button
            onClick={applyNl}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            title="Parse this query and apply the matching screener filters"
          >
            Apply
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-mist">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => setNlQuery(ex)}
              className="rounded-full border border-border bg-slate-50 px-2 py-1 transition hover:bg-slate-100"
              title="Use this example query"
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-slate-100 px-2 py-1 text-mist">Search: {activePreset.search || 'none'}</span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-mist">Sort: {activePreset.sort}</span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-mist">Order: {activePreset.desc ? 'desc' : 'asc'}</span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-mist">Direction: {activePreset.direction}</span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-mist">
            Min Cap: {activePreset.minMarketCap ? `$${activePreset.minMarketCap.toLocaleString()}` : 'none'}
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-mist">
            Top N: {activePreset.limit ? activePreset.limit : 'none'}
          </span>
          <button
            onClick={clearNl}
            className="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-slate-50"
            title="Reset natural-language query and screener presets"
          >
            Clear Filters
          </button>
        </div>
      </div>
      <MarketTable items={items} isLoading={isLoading} error={error?.message} preset={preset} />
    </main>
  );
}
