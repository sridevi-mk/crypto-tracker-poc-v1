import { fetchCoinGecko } from '@/lib/coingecko';
import { cacheGet, cachePeek, cacheSet } from '@/lib/cache';
import { vsCurrencySchema, perPageSchema, pageSchema, orderSchema } from '@/lib/validation';
import { Coin } from '@/lib/types';
import { z } from 'zod';
import type { NextRequest } from 'next/server';

const querySchema = z.object({
  vs_currency: vsCurrencySchema.default('usd'),
  per_page: perPageSchema.default(50),
  page: pageSchema.default(1),
  order: orderSchema.default('market_cap_desc'),
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

function getLastUpdatedFromCoins(coins: Coin[]): string {
  const latest = coins
    .map((c: any) => Date.parse(c?.last_updated || ''))
    .filter((t) => Number.isFinite(t))
    .reduce((max, t) => Math.max(max, t), 0);
  return new Date(latest || Date.now()).toISOString();
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const parse = querySchema.safeParse(query);
  if (!parse.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid query', details: parse.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const { vs_currency, per_page, page, order } = parse.data;
  const cacheKey = `top:${vs_currency}:${per_page}:${page}:${order}`;
  const cached = cacheGet<Coin[]>(cacheKey);
  if (cached) {
    return new Response(JSON.stringify({
      coins: cached,
      meta: {
        source: 'coingecko',
        last_updated: getLastUpdatedFromCoins(cached),
        cache: 'HIT',
        stale: false,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
    });
  }
  try {
    const coins = await withTimeout(fetchCoinGecko<Coin[]>(
      '/coins/markets',
      { vs_currency, per_page, page, order }
    ), FETCH_TIMEOUT_MS);
    cacheSet(cacheKey, coins, 60_000);
    return new Response(JSON.stringify({
      coins,
      meta: {
        source: 'coingecko',
        last_updated: getLastUpdatedFromCoins(coins),
        cache: 'MISS',
        stale: false,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  } catch (err: any) {
    const stale = cachePeek<Coin[]>(cacheKey);
    if (stale?.value?.length) {
      return new Response(
        JSON.stringify({
          coins: stale.value,
          meta: {
            source: 'coingecko',
            last_updated: getLastUpdatedFromCoins(stale.value),
            cache: 'STALE',
            stale: true,
            warning: err?.message || 'Using stale cached market data',
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
