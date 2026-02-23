"use client";
import { useState } from "react";
import { useQuery } from '@tanstack/react-query';
import { CoinChart } from '../../../../components/CoinChart';
import { DataSourceNote } from '../../../../components/DataSourceNote';
import { useParams } from 'next/navigation';

const RANGE_OPTS = [
  { label: '1D', value: '1' },
  { label: '7D', value: '7' },
  { label: '1M', value: '30' },
  { label: '1Y', value: '365' },
];

export default function CoinPage() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState('7');

  const { data: coin, isLoading: loadingCoin, error: errorCoin } = useQuery({
    queryKey: ['coin', id],
    queryFn: async () => {
      const res = await fetch(`/api/market/coin/${id}`);
      if (!res.ok) throw new Error('Failed to fetch coin');
      return res.json();
    },
    enabled: !!id,
    staleTime: 30000,
  });

  const { data: chart, isLoading: loadingChart, error: errorChart } = useQuery({
    queryKey: ['coin-chart', id, range],
    queryFn: async () => {
      const res = await fetch(`/api/market/coin/${id}/chart?days=${range}`);
      if (!res.ok) throw new Error('Failed to fetch chart');
      return res.json();
    },
    enabled: !!id,
    staleTime: 30000,
  });

  const source = coin?.meta?.source || chart?.meta?.source || "CoinGecko API";
  const lastUpdated = chart?.meta?.last_updated || coin?.meta?.last_updated;
  const stale = Boolean(coin?.meta?.stale || chart?.meta?.stale);
  const cache = stale ? "STALE" : (chart?.meta?.cache || coin?.meta?.cache);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <DataSourceNote
        className="mb-4"
        source={source}
        lastUpdated={lastUpdated}
        stale={stale}
        cache={cache}
      />
      {stale && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Live source is unavailable. Showing cached coin data.
        </div>
      )}
      {loadingCoin ? <div className="text-sm text-mist">Loading...</div> : errorCoin ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorCoin.message}</div> : coin && (
        <>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-ink">
            <img src={coin.image} alt={coin.symbol} width={32} height={32} />
            {coin.name} <span className="text-xl font-medium text-mist">({coin.symbol.toUpperCase()})</span>
          </h1>
          <div className="my-4 rounded-xl border border-border bg-panel p-4 text-sm text-slate-700 shadow-panel">{coin.description}</div>
          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-panel p-4 shadow-panel"><b>Price:</b> ${coin.market.current_price?.usd?.toLocaleString?.() ?? coin.market.current_price}</div>
            <div className="rounded-xl border border-border bg-panel p-4 shadow-panel"><b>Market Cap:</b> ${coin.market.market_cap?.usd?.toLocaleString?.() ?? coin.market.market_cap}</div>
            <div className="rounded-xl border border-border bg-panel p-4 shadow-panel"><b>24h %:</b> <span className={coin.market.price_change_percentage_24h >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{coin.market.price_change_percentage_24h?.toFixed?.(2) ?? '--'}%</span></div>
            <div className="rounded-xl border border-border bg-panel p-4 shadow-panel"><b>Volume:</b> ${coin.market.total_volume?.usd?.toLocaleString?.() ?? coin.market.total_volume}</div>
          </div>
        </>
      )}
      <div className="my-6 rounded-xl border border-border bg-panel p-4 shadow-panel">
        <div className="mb-3 flex gap-2">
          {RANGE_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${range === opt.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-border bg-white text-ink hover:bg-slate-50'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {loadingChart ? <div className="text-sm text-mist">Loading chart...</div> : errorChart ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorChart.message}</div> : chart && (
          <CoinChart series={chart.series} />
        )}
      </div>
    </main>
  );
}
