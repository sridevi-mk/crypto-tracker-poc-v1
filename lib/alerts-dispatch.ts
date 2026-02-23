import { AlertCondition, AlertRule } from "@/lib/db";
import { fetchCoinGecko } from "@/lib/coingecko";
import { sendAlertEmail, resolveAlertRecipient } from "@/lib/alerts-notifier";
import { SYMBOL_TO_ID, toCoinGeckoId } from "@/lib/prices";
import {
  listEnabledAlertRulesAcrossUsers,
  recordAlertDelivery,
  recordAlertEvaluation,
  recordAlertRun,
  startAlertRun,
} from "@/lib/alerts-store";

type MarketRow = {
  id: string;
  symbol: string;
  current_price: number | null;
  price_change_percentage_24h: number | null;
};

export type AlertDispatchResult = {
  username: string;
  alert_id: string;
  symbol: string;
  triggered: boolean;
  delivery_status: "sent" | "failed" | "skipped";
  message: string;
};

export type AlertDispatchSummary = {
  run_key: string;
  idempotent: boolean;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  results: AlertDispatchResult[];
};

function shouldTrigger(condition: AlertCondition, threshold: number, market: MarketRow): boolean {
  if (condition === "price_above") return (market.current_price ?? Number.NEGATIVE_INFINITY) >= threshold;
  if (condition === "price_below") return (market.current_price ?? Number.POSITIVE_INFINITY) <= threshold;
  if (condition === "change_24h_above") {
    return (market.price_change_percentage_24h ?? Number.NEGATIVE_INFINITY) >= threshold;
  }
  return (market.price_change_percentage_24h ?? Number.POSITIVE_INFINITY) <= threshold;
}

function toAlertMessage(rule: AlertRule, market: MarketRow): string {
  const price = market.current_price ?? null;
  const change = market.price_change_percentage_24h ?? null;
  return [
    `Alert triggered for ${rule.symbol}`,
    `Condition: ${rule.condition} ${rule.threshold}`,
    `Current price: ${price !== null ? `$${price}` : "N/A"}`,
    `24h change: ${change !== null ? `${change}%` : "N/A"}`,
  ].join("\n");
}

export async function dispatchAlertsNow(runKey: string): Promise<AlertDispatchSummary> {
  const run = await startAlertRun(runKey);
  if (!run.created) {
    return {
      run_key: runKey,
      idempotent: true,
      processed: run.existing?.processed || 0,
      sent: run.existing?.sent || 0,
      failed: run.existing?.failed || 0,
      skipped: run.existing?.skipped || 0,
      results: [],
    };
  }

  const now = new Date().toISOString();
  const results: AlertDispatchResult[] = [];

  const enabledRules = await listEnabledAlertRulesAcrossUsers();
  const ids = Array.from(
    new Set(
      enabledRules
        .map(({ rule }) => rule.symbol.toUpperCase())
        .map((symbol) => SYMBOL_TO_ID[symbol] || toCoinGeckoId(symbol))
    )
  );

  const marketMap = new Map<string, MarketRow>();
  if (ids.length > 0) {
    const marketRows = await fetchCoinGecko<MarketRow[]>("/coins/markets", {
      vs_currency: "usd",
      ids: ids.join(","),
      per_page: ids.length,
      page: 1,
      sparkline: "false",
    });
    for (const row of marketRows) marketMap.set(row.id, row);
  }

  for (const item of enabledRules) {
    const recipient = resolveAlertRecipient(item.username);
    const rule = item.rule;
    const id = SYMBOL_TO_ID[rule.symbol.toUpperCase()] || toCoinGeckoId(rule.symbol);
    const market = marketMap.get(id);

    if (!market) {
      await recordAlertEvaluation({
        username: item.username,
        alertId: rule.id,
        updates: {
          lastEvaluatedAt: now,
          lastDeliveryStatus: "skipped",
          lastDeliveryMessage: "No market data for symbol",
        },
      });
      await recordAlertDelivery({
        username: item.username,
        userId: item.userId,
        alertId: rule.id,
        dedupeKey: `${runKey}:${rule.id}:no-market`,
        status: "skipped",
        triggered: false,
        message: "No market data for symbol",
      });
      results.push({
        username: item.username,
        alert_id: rule.id,
        symbol: rule.symbol,
        triggered: false,
        delivery_status: "skipped",
        message: "No market data for symbol",
      });
      continue;
    }

    const triggered = shouldTrigger(rule.condition, rule.threshold, market);
    if (!triggered) {
      await recordAlertEvaluation({
        username: item.username,
        alertId: rule.id,
        updates: {
          lastEvaluatedAt: now,
          lastDeliveryStatus: "skipped",
          lastDeliveryMessage: "Condition not met",
        },
      });
      await recordAlertDelivery({
        username: item.username,
        userId: item.userId,
        alertId: rule.id,
        dedupeKey: `${runKey}:${rule.id}:condition-not-met`,
        status: "skipped",
        triggered: false,
        message: "Condition not met",
      });
      results.push({
        username: item.username,
        alert_id: rule.id,
        symbol: rule.symbol,
        triggered: false,
        delivery_status: "skipped",
        message: "Condition not met",
      });
      continue;
    }

    if (!recipient) {
      await recordAlertEvaluation({
        username: item.username,
        alertId: rule.id,
        updates: {
          lastEvaluatedAt: now,
          lastTriggeredAt: now,
          lastDeliveryStatus: "failed",
          lastDeliveryMessage: "No recipient configured",
        },
      });
      await recordAlertDelivery({
        username: item.username,
        userId: item.userId,
        alertId: rule.id,
        dedupeKey: `${runKey}:${rule.id}:no-recipient`,
        status: "failed",
        triggered: true,
        message: "No recipient configured",
      });
      results.push({
        username: item.username,
        alert_id: rule.id,
        symbol: rule.symbol,
        triggered: true,
        delivery_status: "failed",
        message: "No recipient configured",
      });
      continue;
    }

    const delivery = await sendAlertEmail({
      to: recipient,
      subject: `CryptoTracker Alert: ${rule.symbol}`,
      text: toAlertMessage(rule, market),
    });

    await recordAlertEvaluation({
      username: item.username,
      alertId: rule.id,
      updates: {
        lastEvaluatedAt: now,
        lastTriggeredAt: now,
        lastDeliveryStatus: delivery.ok ? "sent" : "failed",
        lastDeliveryMessage: delivery.message,
      },
    });
    await recordAlertDelivery({
      username: item.username,
      userId: item.userId,
      alertId: rule.id,
      dedupeKey: `${runKey}:${rule.id}:triggered`,
      status: delivery.ok ? "sent" : "failed",
      triggered: true,
      message: delivery.message,
      provider: delivery.provider,
      recipient,
    });
    results.push({
      username: item.username,
      alert_id: rule.id,
      symbol: rule.symbol,
      triggered: true,
      delivery_status: delivery.ok ? "sent" : "failed",
      message: delivery.message,
    });
  }

  const sent = results.filter((r) => r.delivery_status === "sent").length;
  const failed = results.filter((r) => r.delivery_status === "failed").length;
  const skipped = results.filter((r) => r.delivery_status === "skipped").length;

  await recordAlertRun({
    runKey,
    processed: results.length,
    sent,
    failed,
    skipped,
    status: "ok",
  });

  return {
    run_key: runKey,
    idempotent: false,
    processed: results.length,
    sent,
    failed,
    skipped,
    results,
  };
}
