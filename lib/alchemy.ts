import { z } from 'zod';

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_NETWORK = process.env.ALCHEMY_NETWORK || 'eth-mainnet';

const BASE_URL = ALCHEMY_API_KEY
  ? `https://${ALCHEMY_NETWORK}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
  : '';

export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export interface TokenBalance {
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
}

export interface BalancesResult {
  native: { balance: string };
  tokens: TokenBalance[];
}

export async function getBalances(address: string): Promise<BalancesResult> {
  if (!ALCHEMY_API_KEY) {
    throw new Error('Missing ALCHEMY_API_KEY');
  }
  addressSchema.parse(address);
  // Native balance
  const nativeRes = await fetch(`${BASE_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest']
    })
  });
  const nativeJson = await nativeRes.json();
  const native = { balance: nativeJson.result };

  // ERC20 balances
  const erc20Res = await fetch(`${BASE_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenBalances', params: [address]
    })
  });
  const erc20Json = await erc20Res.json();
  const tokens: TokenBalance[] = [];
  for (const t of erc20Json.result.tokenBalances) {
    if (!t.tokenBalance || t.tokenBalance === '0x0') continue;
    // Get token metadata
    const metaRes = await fetch(`${BASE_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenMetadata', params: [t.contractAddress]
      })
    });
    const meta = await metaRes.json();
    tokens.push({
      contract: t.contractAddress,
      symbol: meta.result.symbol,
      name: meta.result.name,
      decimals: Number(meta.result.decimals),
      balance: t.tokenBalance,
    });
  }
  return { native, tokens };
}
