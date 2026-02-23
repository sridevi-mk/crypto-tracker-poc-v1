import { AlertCondition, DeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AlertConditionInput = "price_above" | "price_below" | "change_24h_above" | "change_24h_below";
type DeliveryStatusInput = "sent" | "failed" | "skipped";

function toCondition(condition: AlertConditionInput): AlertCondition {
  return condition as AlertCondition;
}

function toDeliveryStatus(status: DeliveryStatusInput): DeliveryStatus {
  return status as DeliveryStatus;
}

function mapRule(rule: any) {
  return {
    id: rule.id,
    symbol: rule.symbol,
    condition: rule.condition as AlertConditionInput,
    threshold: rule.threshold,
    enabled: rule.enabled,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
    lastEvaluatedAt: rule.lastEvaluatedAt?.toISOString(),
    lastTriggeredAt: rule.lastTriggeredAt?.toISOString(),
    lastDeliveryStatus: rule.lastDeliveryStatus as DeliveryStatusInput | undefined,
    lastDeliveryMessage: rule.lastDeliveryMessage || undefined,
  };
}

export async function pgListAlertRulesByUsername(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      alertRules: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return (user?.alertRules || []).map(mapRule);
}

export async function pgCreateAlertRuleByUsername(input: {
  username: string;
  symbol: string;
  condition: AlertConditionInput;
  threshold: number;
}) {
  const user = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
  if (!user) return null;
  const created = await prisma.alertRule.create({
    data: {
      userId: user.id,
      symbol: input.symbol,
      condition: toCondition(input.condition),
      threshold: input.threshold,
      enabled: true,
      lastDeliveryStatus: toDeliveryStatus("skipped"),
      lastDeliveryMessage: "Not evaluated yet",
    },
  });
  return mapRule(created);
}

export async function pgDeleteAlertRuleByUsername(input: { username: string; id: string }) {
  const user = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
  if (!user) return false;
  const result = await prisma.alertRule.deleteMany({
    where: {
      id: input.id,
      userId: user.id,
    },
  });
  return result.count > 0;
}

export async function pgListEnabledAlertRulesWithUsernames() {
  const rows = await prisma.alertRule.findMany({
    where: { enabled: true },
    include: {
      user: { select: { username: true, id: true } },
    },
  });

  return rows.map((row) => ({
    username: row.user.username,
    userId: row.user.id,
    rule: mapRule(row),
  }));
}

export async function pgUpdateAlertEvaluation(input: {
  alertId: string;
  updates: {
    lastEvaluatedAt?: string;
    lastTriggeredAt?: string;
    lastDeliveryStatus?: DeliveryStatusInput;
    lastDeliveryMessage?: string;
  };
}) {
  const payload: any = {};
  if (input.updates.lastEvaluatedAt) payload.lastEvaluatedAt = new Date(input.updates.lastEvaluatedAt);
  if (input.updates.lastTriggeredAt) payload.lastTriggeredAt = new Date(input.updates.lastTriggeredAt);
  if (input.updates.lastDeliveryStatus) payload.lastDeliveryStatus = toDeliveryStatus(input.updates.lastDeliveryStatus);
  if (typeof input.updates.lastDeliveryMessage === "string") payload.lastDeliveryMessage = input.updates.lastDeliveryMessage;

  if (Object.keys(payload).length === 0) return;

  await prisma.alertRule.update({
    where: { id: input.alertId },
    data: payload,
  });
}

export async function pgCreateAlertDelivery(input: {
  alertId: string;
  userId: string;
  dedupeKey?: string;
  status: DeliveryStatusInput;
  triggered: boolean;
  message: string;
  provider?: string;
  recipient?: string;
}) {
  if (input.dedupeKey) {
    await prisma.alertDelivery.upsert({
      where: { dedupeKey: input.dedupeKey },
      create: {
        alertRuleId: input.alertId,
        userId: input.userId,
        dedupeKey: input.dedupeKey,
        status: toDeliveryStatus(input.status),
        triggered: input.triggered,
        message: input.message,
        provider: input.provider,
        recipient: input.recipient,
      },
      update: {},
    });
    return;
  }
  await prisma.alertDelivery.create({
    data: {
      alertRuleId: input.alertId,
      userId: input.userId,
      status: toDeliveryStatus(input.status),
      triggered: input.triggered,
      message: input.message,
      provider: input.provider,
      recipient: input.recipient,
    },
  });
}

export async function pgStartAlertRun(input: { runKey: string }) {
  const existing = await prisma.alertRun.findUnique({ where: { runKey: input.runKey } });
  if (existing) return { created: false, run: existing };

  const run = await prisma.alertRun.create({
    data: {
      runKey: input.runKey,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      status: "running",
    },
  });
  return { created: true, run };
}

export async function pgCompleteAlertRun(input: {
  runKey: string;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  status: string;
  errorMessage?: string;
}) {
  await prisma.alertRun.update({
    where: { runKey: input.runKey },
    data: {
      processed: input.processed,
      sent: input.sent,
      failed: input.failed,
      skipped: input.skipped,
      completedAt: new Date(),
      status: input.status,
      errorMessage: input.errorMessage,
    },
  });
}

export async function pgListRecentAlertRuns(limit = 20) {
  const rows = await prisma.alertRun.findMany({
    orderBy: { startedAt: "desc" },
    take: Math.max(1, Math.min(limit, 100)),
  });
  return rows.map((r) => ({
    runKey: r.runKey,
    processed: r.processed,
    sent: r.sent,
    failed: r.failed,
    skipped: r.skipped,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString(),
    errorMessage: r.errorMessage || undefined,
  }));
}
