import { fetchCoinGecko } from './coingecko';

export const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  WBTC: 'wrapped-bitcoin',
};

interface SimplePriceResponse {
  [id: string]: {
    usd?: number;
  };
}

export function toCoinGeckoId(symbolOrId: string): string {
  const trimmed = symbolOrId.trim();
  const fromSymbol = SYMBOL_TO_ID[trimmed.toUpperCase()];
  if (fromSymbol) return fromSymbol;
  return trimmed.toLowerCase();
}

export async function getUsdPrices(
  symbolsOrIds: string[]
): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {};
  const normalizedInputs = symbolsOrIds
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (normalizedInputs.length === 0) {
    return result;
  }

  const inputToId = new Map<string, string>();
  const uniqueIds = new Set<string>();
  for (const input of normalizedInputs) {
    const id = toCoinGeckoId(input);
    inputToId.set(input, id);
    uniqueIds.add(id);
    result[input] = null;
  }

  const data = await fetchCoinGecko<SimplePriceResponse>('/simple/price', {
    ids: Array.from(uniqueIds).join(','),
    vs_currencies: 'usd',
  });

  for (const input of normalizedInputs) {
    const id = inputToId.get(input);
    if (!id) continue;
    const usd = data?.[id]?.usd;
    result[input] = typeof usd === 'number' ? usd : null;
  }

  return result;
}
