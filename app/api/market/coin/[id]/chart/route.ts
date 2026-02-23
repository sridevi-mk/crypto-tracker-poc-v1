import { fetchCoinGecko } from '@/lib/coingecko';
import { cacheGet, cachePeek, cacheSet } from '@/lib/cache';
import { vsCurrencySchema, daysSchema } from '@/lib/validation';
import { z } from 'zod';
import type { NextRequest } from 'next/server';

const paramsSchema = z.object({
  id: z.string().min(1),
});
const querySchema = z.object({
  vs_currency: vsCurrencySchema.default('usd'),
  days: daysSchema.default('7'),
});

const FETCH_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Upstream timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

function getLastUpdatedFromSeries(series: Array<{ t: number }>): string {
  const latest = series.reduce((max, p) => Math.max(max, p.t || 0), 0);
  return new Date((latest || Math.floor(Date.now() / 1000)) * 1000).toISOString();
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const parseParams = paramsSchema.safeParse(params);
  const parseQuery = querySchema.safeParse(query);
  if (!parseParams.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid coin id', details: parseParams.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (!parseQuery.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid query', details: parseQuery.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const { id } = parseParams.data;
  const { vs_currency, days } = parseQuery.data;
  const cacheKey = `chart:${id}:${vs_currency}:${days}`;
  const cached = cacheGet<any>(cacheKey);
  if (cached) {
    return new Response(JSON.stringify({
      ...cached,
      meta: {
        source: 'coingecko',
        last_updated: getLastUpdatedFromSeries(cached.series || []),
        cache: 'HIT',
        stale: false,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
    });
  }
  try {
    const data = await withTimeout(fetchCoinGecko<any>(
      `/coins/${id}/market_chart`,
      { vs_currency, days }
    ), FETCH_TIMEOUT_MS);
    // data.prices: [[timestamp, price], ...] (timestamp in ms)
    const series = Array.isArray(data.prices)
      ? data.prices.map(([t, p]: [number, number]) => ({ t: Math.floor(t / 1000), p }))
      : [];
    const result = { series };
    cacheSet(cacheKey, result, 60_000);
    return new Response(JSON.stringify({
      ...result,
      meta: {
        source: 'coingecko',
        last_updated: getLastUpdatedFromSeries(series),
        cache: 'MISS',
        stale: false,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  } catch (err: any) {
    const stale = cachePeek<any>(cacheKey);
    if (stale?.value) {
      return new Response(
        JSON.stringify({
          ...stale.value,
          meta: {
            source: 'coingecko',
            last_updated: getLastUpdatedFromSeries(stale.value.series || []),
            cache: 'STALE',
            stale: true,
            warning: err?.message || 'Using stale cached chart data',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'X-Cache': 'STALE' } }
      );
    }
    return new Response(
      JSON.stringify({ error: err?.message || 'Failed to fetch data', status: err?.status || 500 }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
