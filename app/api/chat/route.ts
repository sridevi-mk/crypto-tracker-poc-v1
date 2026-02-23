import { z } from "zod";
import type { NextRequest } from "next/server";
import { fetchCoinGecko } from "@/lib/coingecko";
import { getAuthCookieName, getAuthenticatedUsername } from "@/lib/auth";
import { getUserWallets } from "@/lib/user-store";
import { getBalances } from "@/lib/alchemy";
import { getUsdPrices } from "@/lib/prices";
import { checkRateLimit, getRequestClientKey } from "@/lib/rate-limit";
import { getAppEnv, validateChatEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { apiError, apiOk } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  use_page_context: z.boolean().optional().default(false),
  page_context: z
    .object({
      route: z.string().optional(),
      title: z.string().optional(),
      headings: z.array(z.string()).optional(),
      dataSourceHints: z.array(z.string()).optional(),
      timestamp: z.string().optional(),
    })
    .optional(),
});

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  error?: string;
}

interface CoinMarketRow {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  last_updated?: string;
}

interface PortfolioSummaryResult {
  address: string;
  totalUsd: number;
  topConcentrationPct: number;
  stablecoinRatioPct: number;
  topHoldings: Array<{ symbol: string; usdValue: number }>;
}

const STABLECOIN_SYMBOLS = new Set([
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "TUSD",
  "USDE",
  "USDP",
  "USDD",
  "FDUSD",
  "GUSD",
]);

function isPriceQuestion(message: string): boolean {
  return /\b(price|current price|how much|worth|trading at)\b/i.test(message);
}

function isPortfolioQuestion(message: string): boolean {
  return /\b(portfolio|holdings|allocation|concentration|stablecoin|risk|summari[sz]e my wallet|diversif)\b/i.test(
    message
  );
}

function extractAddress(message: string): string | null {
  const m = message.match(/\b0x[a-fA-F0-9]{40}\b/);
  return m?.[0] || null;
}

function extractRouteCoinId(route?: string): string | null {
  if (!route) return null;
  const m = route.match(/\/coin\/([^/?#]+)/i);
  return m?.[1]?.toLowerCase() || null;
}

function extractCoinHint(message: string): string | null {
  const q = message.toLowerCase();
  const aliases: Record<string, string> = {
    bitcoin: "bitcoin",
    btc: "bitcoin",
    ethereum: "ethereum",
    eth: "ethereum",
    solana: "solana",
    sol: "solana",
    cardano: "cardano",
    ada: "cardano",
    dogecoin: "dogecoin",
    doge: "dogecoin",
    ripple: "ripple",
    xrp: "ripple",
    litecoin: "litecoin",
    ltc: "litecoin",
    chainlink: "chainlink",
    link: "chainlink",
    polkadot: "polkadot",
    dot: "polkadot",
  };
  for (const key of Object.keys(aliases)) {
    const re = new RegExp(`\\b${key}\\b`, "i");
    if (re.test(q)) return aliases[key];
  }
  return null;
}

function formatUsdPrice(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const maxDigits = value >= 1 ? 2 : 8;
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDigits });
}

function redactSecrets(input: string): string {
  return input
    .replace(/\bsk-[A-Za-z0-9\-_]{20,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\b0x[a-fA-F0-9]{64}\b/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(?:[a-z]+\s){11,23}[a-z]+\b/gi, (m) => {
      const words = m.trim().split(/\s+/);
      return words.length === 12 || words.length === 24 ? "[REDACTED_SEED_PHRASE]" : m;
    });
}

function sanitizePageContext(ctx: z.infer<typeof bodySchema>["page_context"]) {
  if (!ctx) return undefined;
  return {
    route: ctx.route ? redactSecrets(String(ctx.route)).slice(0, 300) : undefined,
    title: ctx.title ? redactSecrets(String(ctx.title)).slice(0, 300) : undefined,
    headings: (ctx.headings || [])
      .slice(0, 10)
      .map((h) => redactSecrets(String(h)).slice(0, 200)),
    dataSourceHints: (ctx.dataSourceHints || [])
      .slice(0, 10)
      .map((h) => redactSecrets(String(h)).slice(0, 300)),
    timestamp: ctx.timestamp ? String(ctx.timestamp).slice(0, 80) : undefined,
  };
}

function isUnsafeRequest(message: string): string | null {
  const m = message.toLowerCase();
  if (/\b(seed phrase|private key|mnemonic)\b/.test(m)) {
    return "I can't help with handling or exposing wallet secrets like seed phrases or private keys.";
  }
  if (/\b(pump and dump|wash trading|market manipulation|insider trading)\b/.test(m)) {
    return "I can't help with market manipulation or illegal trading behavior.";
  }
  if (/\b(guaranteed profit|risk[- ]?free return|sure win)\b/.test(m)) {
    return "I can't provide guaranteed-return or risk-free investment claims.";
  }
  if (/\b(bypass kyc|money laundering|launder money)\b/.test(m)) {
    return "I can't assist with bypassing regulations or illegal financial activity.";
  }
  if (/\b(exactly what should i buy|tell me what to buy|should i buy now|all in)\b/.test(m)) {
    return "I can't give direct buy/sell instructions, but I can help you evaluate risk and data.";
  }
  return null;
}

function hexToFloat(hex: string, decimals: number): number | null {
  if (!hex || !hex.startsWith("0x")) return null;
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

async function getPortfolioSummary(address: string): Promise<PortfolioSummaryResult | null> {
  const balances = await getBalances(address);
  const symbols = ["ETH", ...balances.tokens.map((t) => t.symbol).filter(Boolean)];
  const prices = await getUsdPrices(symbols);
  const rows: Array<{ symbol: string; usdValue: number }> = [];

  const nativeAmount = hexToFloat(balances.native.balance, 18);
  const nativeUsd = nativeAmount !== null && prices.ETH !== null ? nativeAmount * (prices.ETH || 0) : null;
  if (typeof nativeUsd === "number" && Number.isFinite(nativeUsd)) {
    rows.push({ symbol: "ETH", usdValue: nativeUsd });
  }

  for (const token of balances.tokens) {
    const amount = hexToFloat(token.balance, token.decimals);
    const usd = token.symbol ? prices[token.symbol] : null;
    const usdValue = amount !== null && usd !== null ? amount * usd : null;
    if (typeof usdValue === "number" && Number.isFinite(usdValue)) {
      rows.push({ symbol: token.symbol || "UNKNOWN", usdValue });
    }
  }

  const totalUsd = rows.reduce((sum, r) => sum + r.usdValue, 0);
  if (!Number.isFinite(totalUsd) || totalUsd <= 0) return null;

  const sorted = [...rows].sort((a, b) => b.usdValue - a.usdValue);
  const topHoldings = sorted.slice(0, 3);
  const topConcentrationPct =
    (topHoldings.reduce((sum, h) => sum + h.usdValue, 0) / totalUsd) * 100;
  const stableUsd = rows
    .filter((r) => STABLECOIN_SYMBOLS.has(r.symbol.toUpperCase()))
    .reduce((sum, r) => sum + r.usdValue, 0);
  const stablecoinRatioPct = (stableUsd / totalUsd) * 100;

  return {
    address,
    totalUsd,
    topConcentrationPct,
    stablecoinRatioPct,
    topHoldings,
  };
}

function buildPortfolioReply(summary: PortfolioSummaryResult): string {
  const top = summary.topHoldings
    .map((h) => `${h.symbol}: $${h.usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
    .join(", ");

  let riskLabel = "moderate concentration risk";
  if (summary.topConcentrationPct >= 70) riskLabel = "high concentration risk";
  else if (summary.topConcentrationPct <= 40) riskLabel = "lower concentration risk";

  let stableLabel = "balanced stablecoin buffer";
  if (summary.stablecoinRatioPct < 10) stableLabel = "low stablecoin buffer";
  else if (summary.stablecoinRatioPct > 50) stableLabel = "high stablecoin weighting";

  return [
    `Portfolio snapshot (${summary.address.slice(0, 6)}...${summary.address.slice(-4)}): ~$${summary.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} tracked value.`,
    `Top holdings: ${top}. Top-3 concentration: ${summary.topConcentrationPct.toFixed(1)}% (${riskLabel}).`,
    `Stablecoin ratio: ${summary.stablecoinRatioPct.toFixed(1)}% (${stableLabel}). Beginner tip: lower concentration usually reduces volatility swings.`,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const chatOk = (reply: string) =>
    apiOk({
      reply,
      disclaimer: "Not financial advice.",
    });

  let env;
  try {
    env = getAppEnv();
    validateChatEnv(env);
  } catch (err) {
    logger.error("chat.env_validation_failed", err);
    return apiError({
      status: 500,
      error: "server_config_error",
      message: err instanceof Error ? err.message : "Invalid server env",
    });
  }

  const clientKey = getRequestClientKey(req);
  const rl = checkRateLimit({
    bucket: "chat",
    key: clientKey,
    limit: env.RATE_LIMIT_CHAT_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    logger.warn("chat.rate_limited", { clientKey });
    return apiError({
      status: 429,
      error: "rate_limited",
      message: "Too many chat requests. Please retry shortly.",
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError({
      status: 400,
      error: "invalid_request_body",
      message: "Body must be valid JSON",
    });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      error: "invalid_request_body",
      message: parsed.error.message,
    });
  }

  try {
    const message = parsed.data.message.trim();
    const unsafeReply = isUnsafeRequest(message);
    if (unsafeReply) {
      auditLog({
        event: "chat.request_blocked",
        outcome: "failure",
        resource: "chat",
        metadata: { clientKey, reason: "unsafe_request" },
      });
      return chatOk(unsafeReply);
    }

    const safePageContext = sanitizePageContext(parsed.data.page_context);
    const routeCoinId = extractRouteCoinId(safePageContext?.route);
    const hintedCoinId = extractCoinHint(message);
    const coinId = hintedCoinId || routeCoinId;

    if (isPortfolioQuestion(message)) {
      const explicitAddress = extractAddress(message);
      let walletAddress = explicitAddress;

      if (!walletAddress) {
        const token = req.cookies.get(getAuthCookieName())?.value;
        const username = await getAuthenticatedUsername(token);
        if (username) {
          const wallets = await getUserWallets(username);
          walletAddress = wallets?.[0] || null;
        }
      }

      if (!walletAddress) {
        return chatOk(
          "I can summarize your portfolio if you provide a wallet address (0x...) or save one by signing in and connecting a wallet on the Portfolio page."
        );
      }

      try {
        const summary = await getPortfolioSummary(walletAddress);
        if (!summary) {
          return chatOk(
            "I could not compute a reliable USD portfolio summary from current token mappings. Try again with another wallet or later."
          );
        }

        return chatOk(buildPortfolioReply(summary));
      } catch {
        return chatOk("I could not fetch your portfolio snapshot right now. Please try again in a moment.");
      }
    }

    if (isPriceQuestion(message) && coinId) {
      try {
        const rows = await fetchCoinGecko<CoinMarketRow[]>("/coins/markets", {
          vs_currency: "usd",
          ids: coinId,
          per_page: 1,
          page: 1,
          order: "market_cap_desc",
        });
        const coin = Array.isArray(rows) ? rows[0] : undefined;
        if (coin && typeof coin.current_price === "number") {
          const reply =
            `${coin.name} (${coin.symbol.toUpperCase()}) is currently trading at $${formatUsdPrice(coin.current_price)} USD.` +
            (coin.last_updated ? ` Last updated: ${new Date(coin.last_updated).toLocaleString()}.` : "");
          return chatOk(reply);
        }
      } catch {
        // Fall back to model response if live fetch fails.
      }
    }

    const contextBlock =
      parsed.data.use_page_context && safePageContext
        ? `Page context (JSON):\n${JSON.stringify(safePageContext, null, 2)}`
        : "";
    const userContent = contextBlock ? `${parsed.data.message}\n\n${contextBlock}` : parsed.data.message;

    const systemPrompt =
      "You are Tuffy AI, a crypto market assistant. Use provided page context when available. " +
      "Provide concise educational guidance, do not provide direct buy/sell instructions, do not claim guaranteed returns, " +
      "and do not assist illegal or manipulative activity. If context lacks live price data, say that clearly. " +
      "Keep responses crisp: max 3 short bullet points or 2 short sentences.";

    let reply = "";

    if (env.LLM_PROVIDER === "ollama") {
      const response = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.OLLAMA_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          options: {
            num_predict: 160,
            temperature: 0.2,
          },
          stream: false,
        }),
      });

      const data = (await response.json()) as OllamaChatResponse;
      if (!response.ok) {
        throw new Error(data?.error || "Ollama request failed");
      }
      reply = (data?.message?.content?.trim() || "").slice(0, 2000);
    } else {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          max_tokens: 180,
          temperature: 0.2,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
      });

      const data = (await response.json()) as OpenAIChatResponse;
      if (!response.ok) {
        throw new Error(data?.error?.message || "OpenAI request failed");
      }

      reply = (data?.choices?.[0]?.message?.content?.trim() || "").slice(0, 600);
    }

    reply = reply.slice(0, 600);

    auditLog({
      event: "chat.request",
      outcome: "success",
      resource: "chat",
      metadata: { clientKey, provider: env.LLM_PROVIDER, usedPageContext: Boolean(parsed.data.use_page_context) },
    });
    return chatOk(reply);
  } catch (err: any) {
    logger.error("chat.provider_failed", err, { provider: env.LLM_PROVIDER, clientKey });
    auditLog({
      event: "chat.request",
      outcome: "failure",
      resource: "chat",
      metadata: { clientKey, provider: env.LLM_PROVIDER, error: err?.message || "Chat provider failed" },
    });
    return apiError({
      status: 502,
      error: "chat_provider_error",
      message: err?.message || "Chat provider failed",
    });
  }
}
