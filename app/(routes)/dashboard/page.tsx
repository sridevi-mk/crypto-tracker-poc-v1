"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { DataSourceNote } from "../../../components/DataSourceNote";

const REFRESH_MS = Number(process.env.NEXT_PUBLIC_REFRESH_MS) || 30000;

type CoinRow = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number;
};

type WatchlistResponse = {
  watchlist: string[];
  unauthorized?: boolean;
};

type MarketResponse = {
  coins: CoinRow[];
  meta?: {
    source?: string;
    last_updated?: string;
    stale?: boolean;
    cache?: string;
  };
};

type BacktestSummary = {
  symbol: string;
  coin_id: string;
  strategy: "dca_weekly" | "buy_dip";
  days: number;
  invested_usd: number;
  final_value_usd: number;
  roi_pct: number;
  max_drawdown_pct: number;
  win_rate_pct: number;
  observations: number;
};

function change24h(c: CoinRow) {
  return typeof c.price_change_percentage_24h === "number" ? c.price_change_percentage_24h : 0;
}

function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "up" | "down";
}) {
  const toneClass =
    tone === "up" ? "text-emerald-600" : tone === "down" ? "text-rose-600" : "text-ink";
  return (
    <div className="rounded-xl border border-border bg-panel p-4 shadow-panel">
      <div className="text-[11px] font-medium uppercase tracking-wider text-mist">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function fmtUsd(n: number) {
  return `$${n.toLocaleString()}`;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [cachedWatchlist, setCachedWatchlist] = useState<string[]>([]);
  const [topN, setTopN] = useState(50);
  const [minMarketCap, setMinMarketCap] = useState(0);
  const [direction, setDirection] = useState<"all" | "gainers" | "losers">("all");
  const [watchInput, setWatchInput] = useState("");
  const [watchMessage, setWatchMessage] = useState<string | null>(null);
  const [backtestSymbol, setBacktestSymbol] = useState("BTC");
  const [backtestStrategy, setBacktestStrategy] = useState<"dca_weekly" | "buy_dip">("dca_weekly");
  const [backtestDays, setBacktestDays] = useState(180);
  const [backtestMessage, setBacktestMessage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["market-top-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/market/top?per_page=250");
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const message = body?.error
          ? `${body.error}${body?.status ? ` (${body.status})` : ""}`
          : "Failed to fetch";
        throw new Error(message);
      }
      return body as MarketResponse;
    },
    refetchInterval: REFRESH_MS,
    staleTime: 30000,
  });

  const watchlistQuery = useQuery<WatchlistResponse>({
    queryKey: ["user-watchlist"],
    queryFn: async () => {
      const res = await fetch("/api/user/watchlist");
      const body = await res.json().catch(() => null);
      if (res.status === 401) return { watchlist: [], unauthorized: true };
      if (!res.ok) throw new Error(body?.error || "Failed to fetch watchlist");
      return body as WatchlistResponse;
    },
    placeholderData: cachedWatchlist.length
      ? {
          watchlist: cachedWatchlist,
          unauthorized: false,
        }
      : undefined,
    staleTime: 30_000,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("ct_watchlist_symbols");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const symbols = parsed.map((s) => String(s).toUpperCase());
      setCachedWatchlist(symbols);
      queryClient.setQueryData<WatchlistResponse>(["user-watchlist"], (prev) => {
        if (prev?.watchlist?.length) return prev;
        return {
          watchlist: symbols,
          unauthorized: false,
        };
      });
    } catch {
      // ignore storage failures
    }
  }, [queryClient]);

  useEffect(() => {
    if (!watchlistQuery.data || watchlistQuery.data.unauthorized) return;
    const symbols = (watchlistQuery.data.watchlist || []).map((s) => s.toUpperCase());
    setCachedWatchlist(symbols);
    try {
      window.localStorage.setItem("ct_watchlist_symbols", JSON.stringify(symbols));
    } catch {
      // ignore storage failures
    }
  }, [watchlistQuery.data]);

  const addWatchMutation = useMutation<
    WatchlistResponse,
    Error,
    string,
    { previous?: WatchlistResponse }
  >({
    mutationFn: async (symbol: string) => {
      const res = await fetch("/api/user/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to add watchlist symbol");
      return body as WatchlistResponse;
    },
    onMutate: async (symbol: string) => {
      await queryClient.cancelQueries({ queryKey: ["user-watchlist"] });
      const previous = queryClient.getQueryData<WatchlistResponse>(["user-watchlist"]);
      const prevList = previous?.watchlist || [];
      const up = symbol.toUpperCase();
      if (!prevList.includes(up)) {
        queryClient.setQueryData<WatchlistResponse>(["user-watchlist"], {
          watchlist: [...prevList, up],
          unauthorized: previous?.unauthorized,
        });
      }
      setWatchInput("");
      setWatchMessage("Symbol added to watchlist");
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-watchlist"] });
    },
    onError: (err, _symbol, context) => {
      if (context?.previous) {
        queryClient.setQueryData<WatchlistResponse>(["user-watchlist"], context.previous);
      }
      setWatchMessage(err instanceof Error ? err.message : "Failed to add watchlist symbol");
    },
  });

  const removeWatchMutation = useMutation<
    WatchlistResponse,
    Error,
    string,
    { previous?: WatchlistResponse }
  >({
    mutationFn: async (symbol: string) => {
      const res = await fetch("/api/user/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to remove watchlist symbol");
      return body as WatchlistResponse;
    },
    onMutate: async (symbol: string) => {
      await queryClient.cancelQueries({ queryKey: ["user-watchlist"] });
      const previous = queryClient.getQueryData<WatchlistResponse>(["user-watchlist"]);
      const up = symbol.toUpperCase();
      queryClient.setQueryData<WatchlistResponse>(["user-watchlist"], {
        watchlist: (previous?.watchlist || []).filter((s) => s.toUpperCase() !== up),
        unauthorized: previous?.unauthorized,
      });
      setWatchMessage("Symbol removed from watchlist");
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-watchlist"] });
    },
    onError: (err, _symbol, context) => {
      if (context?.previous) {
        queryClient.setQueryData<WatchlistResponse>(["user-watchlist"], context.previous);
      }
      setWatchMessage(err instanceof Error ? err.message : "Failed to remove watchlist symbol");
    },
  });

  const backtestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol_or_id: backtestSymbol.trim(),
          strategy: backtestStrategy,
          days: backtestDays,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || body?.error || "Backtest failed");
      return body as { summary: BacktestSummary };
    },
    onSuccess: () => setBacktestMessage(null),
    onError: (err: unknown) =>
      setBacktestMessage(err instanceof Error ? err.message : "Backtest failed"),
  });

  const allItems = data?.coins || [];
  const marketMeta = data?.meta;
  const bySymbol = useMemo(() => {
    const map = new Map<string, CoinRow>();
    for (const coin of allItems) {
      map.set(coin.symbol.toUpperCase(), coin);
    }
    return map;
  }, [allItems]);

  const watchlistRows = useMemo(() => {
    const symbols = watchlistQuery.data?.watchlist || [];
    return symbols.map((s) => ({ symbol: s, coin: bySymbol.get(s.toUpperCase()) || null }));
  }, [watchlistQuery.data?.watchlist, bySymbol]);

  const items = useMemo(() => {
    const base = allItems.filter((c) => (c.market_cap || 0) >= minMarketCap);
    const withDirection =
      direction === "gainers"
        ? base.filter((c) => change24h(c) >= 0)
        : direction === "losers"
          ? base.filter((c) => change24h(c) < 0)
          : base;
    return withDirection
      .sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
      .slice(0, topN);
  }, [allItems, minMarketCap, direction, topN]);

  const totalMarketCap = items.reduce((sum, c) => sum + (c.market_cap || 0), 0);
  const totalVolume = items.reduce((sum, c) => sum + (c.total_volume || 0), 0);
  const avgChange24h = items.length
    ? items.reduce((sum, c) => sum + change24h(c), 0) / items.length
    : 0;
  const medianChange24h = median(items.map((c) => change24h(c)));
  const top5Cap = [...items]
    .sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
    .slice(0, 5)
    .reduce((sum, c) => sum + (c.market_cap || 0), 0);
  const top5Concentration = totalMarketCap > 0 ? (top5Cap / totalMarketCap) * 100 : 0;
  const advancingCount = items.filter((c) => change24h(c) >= 0).length;
  const breadthRatio = items.length > 0 ? advancingCount / items.length : 0;
  const gainers = [...items]
    .sort((a, b) => change24h(b) - change24h(a))
    .slice(0, 5);
  const losers = [...items]
    .sort((a, b) => change24h(a) - change24h(b))
    .slice(0, 5);
  const topByCap = [...items].sort((a, b) => b.market_cap - a.market_cap).slice(0, 8);
  const topByVolume = [...items].sort((a, b) => b.total_volume - a.total_volume).slice(0, 8);
  const maxCap = topByCap[0]?.market_cap || 1;
  const maxVol = topByVolume[0]?.total_volume || 1;

  const sparkData = [...items]
    .sort((a, b) => b.market_cap - a.market_cap)
    .slice(0, 12)
    .map((c) => c.current_price || 0);
  const minSpark = Math.min(...sparkData, 0);
  const maxSpark = Math.max(...sparkData, 1);
  const sparkPoints = sparkData
    .map((v, i) => {
      const x = (i / Math.max(sparkData.length - 1, 1)) * 100;
      const y = 90 - ((v - minSpark) / Math.max(maxSpark - minSpark, 1)) * 80;
      return `${x},${y}`;
    })
    .join(" ");

  function handleAddWatchlist() {
    const symbol = watchInput.trim().toUpperCase();
    if (!symbol) return;
    setWatchMessage(null);
    addWatchMutation.mutate(symbol);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-panel p-6 shadow-panel">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Power Dashboard</h1>
          <DataSourceNote
            className="mt-1"
            source={marketMeta?.source || "CoinGecko API (via `/api/market/top`)"}
            lastUpdated={marketMeta?.last_updated}
            stale={marketMeta?.stale}
            cache={marketMeta?.cache}
          />
        </div>
        <div className="flex gap-2">
          <Link
            href="/"
            title="Return to the Market Overview page"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-slate-50"
          >
            Back to Overview
          </Link>
          <Link
            href="/screener"
            title="Open the Screener table to sort and search all listed coins"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-slate-50"
          >
            Open Screener
          </Link>
        </div>
      </div>

      {marketMeta?.stale && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Live source is unavailable. Dashboard is showing cached market data.
        </div>
      )}

      <section className="mb-6 rounded-xl border border-border bg-panel p-4 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Watchlist</h2>
            <p className="text-xs text-mist">Track selected symbols with quick market context.</p>
          </div>
          <div className="flex gap-2">
            <input
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              placeholder="Add symbol (e.g. BTC)"
              className="w-48 rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none ring-cyan-200 focus:ring-2"
            />
            <button
              onClick={handleAddWatchlist}
              disabled={watchlistQuery.data?.unauthorized}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              Add
            </button>
          </div>
        </div>
        {watchMessage && <p className="mt-2 text-xs text-mist">{watchMessage}</p>}
        {watchlistQuery.data?.unauthorized && (
          <p className="mt-2 text-xs text-amber-700">
            Sign in from the Portfolio page to save and manage your watchlist.
          </p>
        )}
        <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {watchlistRows.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-white px-3 py-3 text-sm text-mist">
              No watchlist symbols yet.
            </div>
          )}
          {watchlistRows.map(({ symbol, coin }) => (
            <div key={symbol} className="rounded-lg border border-border bg-white px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">{symbol}</span>
                <button
                  onClick={() => removeWatchMutation.mutate(symbol)}
                  disabled={watchlistQuery.data?.unauthorized}
                  className="rounded-md border border-border px-2 py-1 text-xs text-ink hover:bg-slate-50 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
              {coin ? (
                <div className="mt-2 text-xs text-mist">
                  <div>Price: ${coin.current_price?.toLocaleString?.() ?? "N/A"}</div>
                  <div className={change24h(coin) >= 0 ? "text-emerald-700" : "text-rose-700"}>
                    24h: {change24h(coin).toFixed(2)}%
                  </div>
                </div>
              ) : isLoading ? (
                <div className="mt-2 text-xs text-slate-500">
                  Loading market details...
                </div>
              ) : (
                <div className="mt-2 text-xs text-amber-700">
                  Symbol not found in current top market list.
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-border bg-panel p-4 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Backtesting Lite</h2>
            <p className="text-xs text-mist">POC strategies: weekly DCA and buy-the-dip on historical prices.</p>
          </div>
          <button
            onClick={() => {
              setBacktestMessage(null);
              backtestMutation.mutate();
            }}
            disabled={backtestMutation.isPending}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {backtestMutation.isPending ? "Running..." : "Run Backtest"}
          </button>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <input
            value={backtestSymbol}
            onChange={(e) => setBacktestSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol or CoinGecko ID"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none ring-cyan-200 focus:ring-2"
          />
          <select
            value={backtestStrategy}
            onChange={(e) => setBacktestStrategy(e.target.value as "dca_weekly" | "buy_dip")}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none ring-cyan-200 focus:ring-2"
          >
            <option value="dca_weekly">DCA Weekly</option>
            <option value="buy_dip">Buy Dip</option>
          </select>
          <select
            value={backtestDays}
            onChange={(e) => setBacktestDays(Number(e.target.value))}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none ring-cyan-200 focus:ring-2"
          >
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>365 days</option>
          </select>
        </div>

        {backtestMessage && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {backtestMessage}
          </div>
        )}

        {backtestMutation.data?.summary && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border border-border bg-white px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-mist">ROI</div>
              <div className={`text-sm font-semibold ${backtestMutation.data.summary.roi_pct >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {backtestMutation.data.summary.roi_pct.toFixed(2)}%
              </div>
            </div>
            <div className="rounded-lg border border-border bg-white px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-mist">Max Drawdown</div>
              <div className="text-sm font-semibold text-rose-700">
                {backtestMutation.data.summary.max_drawdown_pct.toFixed(2)}%
              </div>
            </div>
            <div className="rounded-lg border border-border bg-white px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-mist">Win Rate</div>
              <div className="text-sm font-semibold text-ink">
                {backtestMutation.data.summary.win_rate_pct.toFixed(2)}%
              </div>
            </div>
            <div className="rounded-lg border border-border bg-white px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-mist">Invested</div>
              <div className="text-sm font-semibold text-ink">
                ${backtestMutation.data.summary.invested_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-white px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-mist">Final Value</div>
              <div className="text-sm font-semibold text-ink">
                ${backtestMutation.data.summary.final_value_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="mb-6 grid gap-3 rounded-xl border border-border bg-panel p-4 shadow-panel md:grid-cols-4">
        <div className="md:col-span-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-mist">Top N</label>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            title="Choose how many top coins to include in this dashboard"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none ring-cyan-200 focus:ring-2"
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
          </select>
        </div>
        <div className="md:col-span-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-mist">Min Market Cap</label>
          <select
            value={minMarketCap}
            onChange={(e) => setMinMarketCap(Number(e.target.value))}
            title="Filter out coins below the selected market cap threshold"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none ring-cyan-200 focus:ring-2"
          >
            <option value={0}>No minimum</option>
            <option value={1_000_000_000}>$1B+</option>
            <option value={10_000_000_000}>$10B+</option>
            <option value={100_000_000_000}>$100B+</option>
          </select>
        </div>
        <div className="md:col-span-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-mist">24h Direction</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "all" | "gainers" | "losers")}
            title="Show all coins, only gainers, or only losers based on 24h price change"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none ring-cyan-200 focus:ring-2"
          >
            <option value="all">All</option>
            <option value="gainers">Gainers only</option>
            <option value="losers">Losers only</option>
          </select>
        </div>
        <div className="md:col-span-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-mist">Result Set</label>
          <div className="rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm font-medium text-ink">
            {items.length} of {allItems.length}
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Tracked Coins" value={String(items.length)} />
        <KpiCard label="Total Market Cap" value={fmtUsd(totalMarketCap)} />
        <KpiCard label="24h Total Volume" value={fmtUsd(totalVolume)} />
        <KpiCard
          label="Average 24h Change"
          value={`${avgChange24h.toFixed(2)}%`}
          tone={avgChange24h >= 0 ? "up" : "down"}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Median 24h Change"
          value={`${medianChange24h.toFixed(2)}%`}
          tone={medianChange24h >= 0 ? "up" : "down"}
        />
        <KpiCard
          label="Top 5 Cap Concentration"
          value={`${top5Concentration.toFixed(1)}%`}
        />
        <KpiCard
          label="Breadth Ratio (Advancing)"
          value={`${(breadthRatio * 100).toFixed(1)}%`}
          tone={breadthRatio >= 0.5 ? "up" : "down"}
        />
      </div>

      {isLoading && <div className="rounded-lg border border-border bg-panel p-4 text-sm text-mist">Loading dashboard...</div>}
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error.message}</div>}

      {!isLoading && !error && items.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No coins match your current filters. Try lowering min market cap or changing direction.
        </div>
      )}

      {!isLoading && !error && items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-12">
          <section className="rounded-xl border border-border bg-panel p-4 shadow-panel lg:col-span-5">
            <h2 className="text-sm font-semibold text-ink">Market Cap Ranking</h2>
            <div className="mt-3 space-y-2">
              {topByCap.map((c) => (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink">{c.symbol.toUpperCase()}</span>
                    <span className="text-mist">{fmtUsd(c.market_cap)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                      style={{ width: `${(c.market_cap / maxCap) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-panel p-4 shadow-panel lg:col-span-4">
            <h2 className="text-sm font-semibold text-ink">Price Trend (Top Coins)</h2>
            <svg viewBox="0 0 100 100" className="mt-3 h-44 w-full rounded-lg bg-slate-50">
              <polyline
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="2.5"
                points={sparkPoints}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="mt-2 text-xs text-mist">Relative line chart by current price (top market cap assets).</p>
          </section>

          <section className="rounded-xl border border-border bg-panel p-4 shadow-panel lg:col-span-3">
            <h2 className="text-sm font-semibold text-ink">Market Breadth</h2>
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 text-xs text-mist">Advancing</div>
                <div className="text-lg font-semibold text-emerald-600">
                  {items.filter((c) => c.price_change_percentage_24h >= 0).length}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-mist">Declining</div>
                <div className="text-lg font-semibold text-rose-600">
                  {items.filter((c) => c.price_change_percentage_24h < 0).length}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-mist">Flat</div>
                <div className="text-lg font-semibold text-ink">
                  {items.filter((c) => Math.abs(c.price_change_percentage_24h) < 0.01).length}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-panel p-4 shadow-panel lg:col-span-6">
            <h2 className="text-sm font-semibold text-ink">Top Gainers (24h)</h2>
            <div className="mt-3 space-y-2">
              {gainers.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <img src={c.image} alt={c.symbol} width={20} height={20} />
                    <span className="text-sm font-medium text-ink">{c.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-emerald-700">{change24h(c).toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-panel p-4 shadow-panel lg:col-span-6">
            <h2 className="text-sm font-semibold text-ink">Top Losers (24h)</h2>
            <div className="mt-3 space-y-2">
              {losers.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <img src={c.image} alt={c.symbol} width={20} height={20} />
                    <span className="text-sm font-medium text-ink">{c.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-rose-700">{change24h(c).toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-panel p-4 shadow-panel lg:col-span-12">
            <h2 className="text-sm font-semibold text-ink">Volume Distribution</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {topByVolume.map((c) => (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink">{c.symbol.toUpperCase()}</span>
                    <span className="text-mist">{fmtUsd(c.total_volume)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                      style={{ width: `${(c.total_volume / maxVol) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
