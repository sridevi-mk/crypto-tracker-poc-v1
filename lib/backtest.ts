import { fetchCoinGecko } from "@/lib/coingecko";
import { toCoinGeckoId } from "@/lib/prices";

type Strategy = "dca_weekly" | "buy_dip";

type MarketChartResponse = {
  prices: [number, number][];
};

type BacktestInput = {
  symbolOrId: string;
  strategy: Strategy;
  days: number;
  weeklyAmountUsd?: number;
  dipThresholdPct?: number;
};

type BacktestPoint = {
  t: number;
  price: number;
  equity: number;
};

export type BacktestSummary = {
  symbol: string;
  coin_id: string;
  strategy: Strategy;
  days: number;
  invested_usd: number;
  final_value_usd: number;
  roi_pct: number;
  max_drawdown_pct: number;
  win_rate_pct: number;
  observations: number;
};

function clampDays(days: number) {
  return Math.min(365, Math.max(30, Math.floor(days)));
}

function toDayClosePoints(prices: [number, number][]): [number, number][] {
  const byDay = new Map<string, [number, number]>();
  for (const [ts, price] of prices) {
    const dayKey = new Date(ts).toISOString().slice(0, 10);
    byDay.set(dayKey, [ts, price]);
  }
  return Array.from(byDay.values()).sort((a, b) => a[0] - b[0]);
}

function computeMetrics(curve: BacktestPoint[], investedUsd: number): Pick<BacktestSummary, "final_value_usd" | "roi_pct" | "max_drawdown_pct" | "win_rate_pct" | "observations"> {
  const finalEquity = curve[curve.length - 1]?.equity ?? 0;
  const roi = investedUsd > 0 ? ((finalEquity - investedUsd) / investedUsd) * 100 : 0;

  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;
  for (const p of curve) {
    peak = Math.max(peak, p.equity);
    if (peak > 0) {
      const dd = ((peak - p.equity) / peak) * 100;
      maxDrawdown = Math.max(maxDrawdown, dd);
    }
  }

  let wins = 0;
  let total = 0;
  for (let i = 1; i < curve.length; i += 1) {
    total += 1;
    if (curve[i].equity >= curve[i - 1].equity) wins += 1;
  }
  const winRate = total > 0 ? (wins / total) * 100 : 0;

  return {
    final_value_usd: finalEquity,
    roi_pct: roi,
    max_drawdown_pct: maxDrawdown,
    win_rate_pct: winRate,
    observations: curve.length,
  };
}

function runDcaWeekly(points: [number, number][], weeklyAmountUsd: number) {
  let investedUsd = 0;
  let units = 0;
  const curve: BacktestPoint[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const [t, price] = points[i];
    if (i % 7 === 0) {
      investedUsd += weeklyAmountUsd;
      units += weeklyAmountUsd / price;
    }
    curve.push({ t, price, equity: units * price });
  }

  return { investedUsd, curve };
}

function runBuyDip(points: [number, number][], weeklyAmountUsd: number, dipThresholdPct: number) {
  let investedUsd = 0;
  let units = 0;
  const curve: BacktestPoint[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const [t, price] = points[i];
    const prevPrice = i > 0 ? points[i - 1][1] : null;
    const dayChangePct = prevPrice ? ((price - prevPrice) / prevPrice) * 100 : 0;

    if (i === 0 || dayChangePct <= -Math.abs(dipThresholdPct)) {
      investedUsd += weeklyAmountUsd;
      units += weeklyAmountUsd / price;
    }

    curve.push({ t, price, equity: units * price });
  }

  return { investedUsd, curve };
}

export async function runBacktest(input: BacktestInput): Promise<BacktestSummary> {
  const coinId = toCoinGeckoId(input.symbolOrId);
  const days = clampDays(input.days);
  const weeklyAmountUsd = Math.max(10, input.weeklyAmountUsd ?? 100);
  const dipThresholdPct = Math.max(1, Math.min(20, input.dipThresholdPct ?? 3));

  const data = await fetchCoinGecko<MarketChartResponse>(`/coins/${coinId}/market_chart`, {
    vs_currency: "usd",
    days,
  });

  const points = toDayClosePoints(data.prices || []);
  if (points.length < 2) {
    throw new Error("Not enough historical price data for backtest");
  }

  const run = input.strategy === "dca_weekly"
    ? runDcaWeekly(points, weeklyAmountUsd)
    : runBuyDip(points, weeklyAmountUsd, dipThresholdPct);

  const metrics = computeMetrics(run.curve, run.investedUsd);
  return {
    symbol: input.symbolOrId.toUpperCase(),
    coin_id: coinId,
    strategy: input.strategy,
    days,
    invested_usd: run.investedUsd,
    ...metrics,
  };
}
