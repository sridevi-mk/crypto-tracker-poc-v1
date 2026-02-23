import { z } from "zod";
import { cookies } from "next/headers";
import { getAuthCookieName, getAuthenticatedUsername } from "@/lib/auth";
import { createAlertRule, deleteAlertRule, listAlertRules } from "@/lib/alerts-store";
import { checkRateLimit, getRequestClientKey } from "@/lib/rate-limit";
import { getAppEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { apiError, apiOk } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";

const createAlertSchema = z.object({
  symbol: z.string().trim().min(1).max(20).regex(/^[a-zA-Z0-9._-]+$/, "Invalid symbol format"),
  condition: z.enum(["price_above", "price_below", "change_24h_above", "change_24h_below"]),
  threshold: z.number().finite(),
});

const deleteAlertSchema = z.object({
  id: z.string().uuid(),
});

async function resolveUsername() {
  const jar = await cookies();
  const token = jar.get(getAuthCookieName())?.value;
  return await getAuthenticatedUsername(token);
}

export async function GET(req: Request) {
  const env = getAppEnv();
  const clientKey = getRequestClientKey(req);
  const rl = checkRateLimit({
    bucket: "alerts",
    key: clientKey,
    limit: env.RATE_LIMIT_ALERTS_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return apiError({
      status: 429,
      error: "rate_limited",
      message: "Too many requests.",
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  const username = await resolveUsername();
  if (!username) {
    return apiError({
      status: 401,
      error: "unauthorized",
      message: "Authentication required.",
    });
  }

  const alerts = await listAlertRules(username);
  return apiOk({ alerts });
}

export async function POST(req: Request) {
  const env = getAppEnv();
  const clientKey = getRequestClientKey(req);
  const rl = checkRateLimit({
    bucket: "alerts",
    key: clientKey,
    limit: env.RATE_LIMIT_ALERTS_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return apiError({
      status: 429,
      error: "rate_limited",
      message: "Too many requests.",
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  const username = await resolveUsername();
  if (!username) {
    return apiError({
      status: 401,
      error: "unauthorized",
      message: "Authentication required.",
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError({
      status: 400,
      error: "invalid_json",
      message: "Body must be valid JSON.",
    });
  }

  const parsed = createAlertSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      error: "invalid_payload",
      message: "Invalid payload.",
      details: parsed.error.flatten(),
    });
  }

  const threshold = parsed.data.threshold;
  if ((parsed.data.condition === "price_above" || parsed.data.condition === "price_below") && threshold <= 0) {
    return apiError({
      status: 400,
      error: "invalid_threshold",
      message: "Price threshold must be greater than 0.",
    });
  }

  try {
    const alert = await createAlertRule(username, parsed.data);
    auditLog({
      event: "alerts.create",
      actor: username,
      outcome: "success",
      resource: "alert_rule",
      metadata: { symbol: parsed.data.symbol.toUpperCase() },
    });
    return apiOk({ alert }, 201);
  } catch (err) {
    logger.error("alerts.create_failed", err, { username, clientKey });
    auditLog({
      event: "alerts.create",
      actor: username,
      outcome: "failure",
      resource: "alert_rule",
    });
    return apiError({
      status: 502,
      error: "alert_create_failed",
      message: "Failed to create alert rule.",
    });
  }
}

export async function DELETE(req: Request) {
  const env = getAppEnv();
  const clientKey = getRequestClientKey(req);
  const rl = checkRateLimit({
    bucket: "alerts",
    key: clientKey,
    limit: env.RATE_LIMIT_ALERTS_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return apiError({
      status: 429,
      error: "rate_limited",
      message: "Too many requests.",
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  const username = await resolveUsername();
  if (!username) {
    return apiError({
      status: 401,
      error: "unauthorized",
      message: "Authentication required.",
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError({
      status: 400,
      error: "invalid_json",
      message: "Body must be valid JSON.",
    });
  }

  const parsed = deleteAlertSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      error: "invalid_payload",
      message: "Invalid payload.",
      details: parsed.error.flatten(),
    });
  }

  const deleted = await deleteAlertRule(username, parsed.data.id);
  if (!deleted) {
    return apiError({
      status: 404,
      error: "not_found",
      message: "Alert rule not found.",
    });
  }

  auditLog({
    event: "alerts.delete",
    actor: username,
    outcome: "success",
    resource: "alert_rule",
    metadata: { alert_id: parsed.data.id },
  });
  return apiOk({ ok: true });
}
