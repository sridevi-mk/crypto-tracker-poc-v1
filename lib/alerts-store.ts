import { randomUUID } from "crypto";
import { AlertCondition, AlertRule, getOrCreateUser, listUsers, updateUser } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { AlertDispatchResult } from "@/lib/alerts-dispatch";

function nowIso() {
  return new Date().toISOString();
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function usePostgres() {
  return Boolean(process.env.DATABASE_URL) && process.env.ALERTS_STORE_BACKEND !== "file";
}

async function withPgFallback<T>(op: string, pgFn: () => Promise<T>, fallbackFn: () => Promise<T>): Promise<T> {
  if (!usePostgres()) return fallbackFn();
  try {
    return await pgFn();
  } catch (err) {
    logger.warn("alerts_store.pg_fallback", { op, reason: err instanceof Error ? err.message : "unknown" });
    return fallbackFn();
  }
}

async function pgRepo() {
  return import("@/lib/alerts-repo-postgres");
}

const fileRunState = new Map<
  string,
  { status: "running" | "ok" | "failed"; processed: number; sent: number; failed: number; skipped: number; results: AlertDispatchResult[] }
>();

export type AlertRunSummary = {
  runKey: string;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  status: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
};

export async function listAlertRules(username: string): Promise<AlertRule[]> {
  return withPgFallback(
    "listAlertRules",
    async () => {
      const repo = await pgRepo();
      return repo.pgListAlertRulesByUsername(username);
    },
    async () => {
      const user = await getOrCreateUser(username);
      return [...(user.alerts || [])];
    }
  );
}

export async function createAlertRule(
  username: string,
  input: { symbol: string; condition: AlertCondition; threshold: number }
): Promise<AlertRule> {
  return withPgFallback(
    "createAlertRule",
    async () => {
      const repo = await pgRepo();
      const created = await repo.pgCreateAlertRuleByUsername({
        username,
        symbol: normalizeSymbol(input.symbol),
        condition: input.condition,
        threshold: input.threshold,
      });
      if (!created) throw new Error("User not found");
      return created;
    },
    async () => {
      const now = nowIso();
      const rule: AlertRule = {
        id: randomUUID(),
        symbol: normalizeSymbol(input.symbol),
        condition: input.condition,
        threshold: input.threshold,
        enabled: true,
        createdAt: now,
        updatedAt: now,
        lastDeliveryStatus: "skipped",
        lastDeliveryMessage: "Not evaluated yet",
      };

      const updatedUser = await updateUser(username, (user) => ({
        ...user,
        alerts: [...(user.alerts || []), rule],
      }));

      const created = updatedUser.alerts.find((a) => a.id === rule.id);
      return created || rule;
    }
  );
}

export async function deleteAlertRule(username: string, id: string): Promise<boolean> {
  return withPgFallback(
    "deleteAlertRule",
    async () => {
      const repo = await pgRepo();
      return repo.pgDeleteAlertRuleByUsername({ username, id });
    },
    async () => {
      let deleted = false;
      await updateUser(username, (user) => {
        const before = (user.alerts || []).length;
        const nextAlerts = (user.alerts || []).filter((a) => a.id !== id);
        deleted = nextAlerts.length < before;
        return {
          ...user,
          alerts: nextAlerts,
        };
      });
      return deleted;
    }
  );
}

export async function listEnabledAlertRulesAcrossUsers(): Promise<Array<{ username: string; userId?: string; rule: AlertRule }>> {
  return withPgFallback(
    "listEnabledAlertRulesAcrossUsers",
    async () => {
      const repo = await pgRepo();
      return repo.pgListEnabledAlertRulesWithUsernames();
    },
    async () => {
      const users = await listUsers();
      return users.flatMap((u) =>
        (u.alerts || []).filter((a) => a.enabled).map((rule) => ({ username: u.username, rule }))
      );
    }
  );
}

export async function recordAlertEvaluation(input: {
  username: string;
  alertId: string;
  updates: {
    lastEvaluatedAt?: string;
    lastTriggeredAt?: string;
    lastDeliveryStatus?: "sent" | "failed" | "skipped";
    lastDeliveryMessage?: string;
  };
}) {
  return withPgFallback(
    "recordAlertEvaluation",
    async () => {
      const repo = await pgRepo();
      await repo.pgUpdateAlertEvaluation({
        alertId: input.alertId,
        updates: input.updates,
      });
    },
    async () => {
      await updateUser(input.username, (user) => ({
        ...user,
        alerts: (user.alerts || []).map((a) =>
          a.id === input.alertId
            ? {
                ...a,
                ...input.updates,
                updatedAt: nowIso(),
              }
            : a
        ),
      }));
    }
  );
}

export async function recordAlertDelivery(input: {
  username: string;
  userId?: string;
  alertId: string;
  dedupeKey?: string;
  status: "sent" | "failed" | "skipped";
  triggered: boolean;
  message: string;
  provider?: string;
  recipient?: string;
}) {
  if (!usePostgres()) return;
  try {
    if (!input.userId) return;
    const repo = await pgRepo();
    await repo.pgCreateAlertDelivery({
      alertId: input.alertId,
      userId: input.userId,
      dedupeKey: input.dedupeKey,
      status: input.status,
      triggered: input.triggered,
      message: input.message,
      provider: input.provider,
      recipient: input.recipient,
    });
  } catch (err) {
    logger.warn("alerts_store.record_delivery_failed", {
      username: input.username,
      alertId: input.alertId,
      reason: err instanceof Error ? err.message : "unknown",
    });
  }
}

export async function recordAlertRun(input: {
  runKey?: string;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  status: "ok" | "failed";
  errorMessage?: string;
}) {
  if (!input.runKey) return;
  if (!usePostgres()) {
    fileRunState.set(input.runKey, {
      status: input.status,
      processed: input.processed,
      sent: input.sent,
      failed: input.failed,
      skipped: input.skipped,
      results: [],
    });
    return;
  }
  try {
    const repo = await pgRepo();
    await repo.pgCompleteAlertRun({
      runKey: input.runKey,
      processed: input.processed,
      sent: input.sent,
      failed: input.failed,
      skipped: input.skipped,
      status: input.status,
      errorMessage: input.errorMessage,
    });
  } catch (err) {
    logger.warn("alerts_store.record_run_failed", {
      reason: err instanceof Error ? err.message : "unknown",
    });
  }
}

export async function startAlertRun(runKey: string): Promise<{
  created: boolean;
  existing?: {
    status: string;
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
  };
}> {
  if (!usePostgres()) {
    const existing = fileRunState.get(runKey);
    if (existing) {
      return {
        created: false,
        existing: {
          status: existing.status,
          processed: existing.processed,
          sent: existing.sent,
          failed: existing.failed,
          skipped: existing.skipped,
        },
      };
    }
    fileRunState.set(runKey, {
      status: "running",
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      results: [],
    });
    return { created: true };
  }

  const repo = await pgRepo();
  const { created, run } = await repo.pgStartAlertRun({ runKey });
  if (created) return { created: true };
  return {
    created: false,
    existing: {
      status: run.status,
      processed: run.processed,
      sent: run.sent,
      failed: run.failed,
      skipped: run.skipped,
    },
  };
}

export async function listRecentAlertRuns(limit = 20): Promise<AlertRunSummary[]> {
  return withPgFallback(
    "listRecentAlertRuns",
    async () => {
      const repo = await pgRepo();
      return repo.pgListRecentAlertRuns(limit);
    },
    async () => {
      return Array.from(fileRunState.entries())
        .slice(-Math.max(1, Math.min(limit, 100)))
        .reverse()
        .map(([runKey, state]) => ({
          runKey,
          processed: state.processed,
          sent: state.sent,
          failed: state.failed,
          skipped: state.skipped,
          status: state.status,
        }));
    }
  );
}
