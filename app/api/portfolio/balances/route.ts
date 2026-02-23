import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getBalances } from '@/lib/alchemy';
import { getUsdPrices } from '@/lib/prices';
import { getAuthCookieName, verifySessionToken } from '@/lib/auth';

const querySchema = z.object({
  address: z
    .string()
    .min(1)
    .refine((v) => v.startsWith('0x'), { message: 'Address must start with 0x' })
    .refine((v) => v.length === 42, { message: 'Address must be 42 characters long' }),
});

function hexToFloat(hex: string, decimals: number): number | null {
  if (!hex || !hex.startsWith('0x')) return null;
  if (!Number.isInteger(decimals) || decimals < 0) return null;
  try {
    const raw = BigInt(hex);
    const denom = Math.pow(10, Math.min(decimals, 18));
    if (!Number.isFinite(denom) || denom === 0) return null;
    const extraScale = Math.pow(10, Math.max(decimals - 18, 0));
    return Number(raw) / denom / extraScale;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const authToken = req.cookies.get(getAuthCookieName())?.value;
  if (!(await verifySessionToken(authToken))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const parse = querySchema.safeParse(query);

  if (!parse.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid query', details: parse.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { address } = parse.data;
    const balances = await getBalances(address);
    const symbols = ['ETH', ...balances.tokens.map((t) => t.symbol).filter(Boolean)];
    const prices = await getUsdPrices(symbols);

    const nativeAmount = hexToFloat(balances.native.balance, 18);
    const nativeUsdPrice = prices.ETH ?? null;
    const nativeUsdValue =
      nativeAmount !== null && nativeUsdPrice !== null ? nativeAmount * nativeUsdPrice : null;

    const tokens = balances.tokens.map((t) => {
      const amount = hexToFloat(t.balance, t.decimals);
      const usdPrice = t.symbol ? (prices[t.symbol] ?? null) : null;
      const usdValue = amount !== null && usdPrice !== null ? amount * usdPrice : null;
      return {
        contract: t.contract,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        balance: t.balance,
        usd_price: usdPrice,
        usd_value: usdValue,
      };
    });

    const totalUsdValue = [nativeUsdValue, ...tokens.map((t) => t.usd_value)].reduce<number>(
      (sum, value) => (typeof value === 'number' && Number.isFinite(value) ? sum + value : sum),
      0
    );

    return new Response(
      JSON.stringify({
        address,
        native: {
          symbol: 'ETH',
          balance: balances.native.balance,
          usd_price: nativeUsdPrice,
          usd_value: nativeUsdValue,
        },
        tokens,
        total_usd_value: totalUsdValue,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Failed to fetch portfolio balances' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
