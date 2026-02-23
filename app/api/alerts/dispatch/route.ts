import { runAlertsWorker } from "@/lib/alerts-worker";
import { checkRateLimit, getRequestClientKey } from "@/lib/rate-limit";
import { getAppEnv, validateAlertsDispatchEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { verifySchedulerSignature } from "@/lib/scheduler-auth";
import { apiError, apiOk } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";

const bodySchema = z.object({
  run_key: z.string().min(3).max(120).optional(),
  dry_run: z.boolean().optional(),
});

async function isAuthorized(req: Request, body: string) {
  const env = getAppEnv();
  const secret = env.ALERTS_CRON_SECRET || "";
  if (!secret) return { ok: false, reason: "missing_secret" };

  // Legacy compatibility: plain secret header/bearer.
  const headerSecret = req.headers.get("x-alerts-cron-secret") || "";
  const authHeader = req.headers.get("authorization") || "";
  const bearerSecret = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (headerSecret === secret || bearerSecret === secret) {
    return { ok: true, mode: "legacy_secret" as const };
  }

  // Preferred mode: HMAC signature over body with ts+nonce.
  const signed = await verifySchedulerSignature({
    secret,
    timestampHeader: req.headers.get("x-alerts-ts"),
    nonceHeader: req.headers.get("x-alerts-nonce"),
    signatureHeader: req.headers.get("x-alerts-signature"),
    body,
  });
  if (!signed.ok) {
    return { ok: false, reason: signed.reason };
  }
  return { ok: true, mode: "signed_hmac" as const };
}

export async function POST(req: Request) {
  let env;
  try {
    env = getAppEnv();
    validateAlertsDispatchEnv(env);
  } catch (err) {
    logger.error("alerts.dispatch.env_validation_failed", err);
    return apiError({
      status: 500,
      error: "server_config_error",
      message: err instanceof Error ? err.message : "Invalid env",
    });
  }

  const clientKey = getRequestClientKey(req);
  const rl = checkRateLimit({
    bucket: "alerts_dispatch",
    key: clientKey,
    limit: env.RATE_LIMIT_ALERTS_DISPATCH_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return apiError({
      status: 429,
      error: "rate_limited",
      message: "Too many requests",
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    return apiError({
      status: 400,
      error: "invalid_body",
      message: "Body could not be read.",
    });
  }

  const auth = await isAuthorized(req, rawBody);
  if (!auth.ok) {
    logger.warn("alerts.dispatch.unauthorized", { clientKey, reason: auth.reason });
    auditLog({
      event: "alerts.dispatch",
      outcome: "failure",
      resource: "alerts_dispatch",
      metadata: { reason: auth.reason, clientKey },
    });
    return apiError({
      status: 401,
      error: "unauthorized",
      message: "Unauthorized",
    });
  }

  let runKey: string | undefined;
  let dryRun = false;
  try {
    if (rawBody.trim()) {
      const parsed = bodySchema.safeParse(JSON.parse(rawBody));
      if (!parsed.success) {
        return apiError({
          status: 400,
          error: "invalid_body",
          message: parsed.error.message,
        });
      }
      runKey = parsed.data.run_key;
      dryRun = Boolean(parsed.data.dry_run);
    }
  } catch {
    return apiError({
      status: 400,
      error: "invalid_body",
      message: "Body must be valid JSON.",
    });
  }

  if (dryRun) {
    auditLog({
      event: "alerts.dispatch.dry_run",
      outcome: "success",
      resource: "alerts_dispatch",
      metadata: { authMode: auth.mode, clientKey, runKey: runKey || null },
    });
    return apiOk(
      {
        ok: true,
        dry_run: true,
        run_key: runKey || null,
        auth_mode: auth.mode,
        checked_at: new Date().toISOString(),
      },
      200,
      {
        "X-Dispatch-Auth-Mode": auth.mode,
      }
    );
  }

  try {
    const summary = await runAlertsWorker(runKey);
    auditLog({
      event: "alerts.dispatch",
      outcome: "success",
      resource: "alerts_dispatch",
      metadata: { authMode: auth.mode, clientKey, runKey: runKey || null },
    });
    return apiOk(summary, 200, {
        "Content-Type": "application/json",
        "X-Dispatch-Auth-Mode": auth.mode,
    });
  } catch (err: any) {
    logger.error("alerts.dispatch.failed", err, { clientKey });
    auditLog({
      event: "alerts.dispatch",
      outcome: "failure",
      resource: "alerts_dispatch",
      metadata: { clientKey, error: err?.message || "Unknown error" },
    });
    return apiError({
      status: 502,
      error: "dispatch_failed",
      message: err?.message || "Unknown error",
    });
  }
}

export async function GET(req: Request) {
  let env;
  try {
    env = getAppEnv();
    validateAlertsDispatchEnv(env);
  } catch (err) {
    logger.error("alerts.dispatch.env_validation_failed", err);
    return apiError({
      status: 500,
      error: "server_config_error",
      message: err instanceof Error ? err.message : "Invalid env",
    });
  }

  const clientKey = getRequestClientKey(req);
  const rl = checkRateLimit({
    bucket: "alerts_dispatch",
    key: clientKey,
    limit: env.RATE_LIMIT_ALERTS_DISPATCH_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return apiError({
      status: 429,
      error: "rate_limited",
      message: "Too many requests",
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  const auth = await isAuthorized(req, "");
  if (!auth.ok) {
    logger.warn("alerts.dispatch.unauthorized", { clientKey, reason: auth.reason });
    auditLog({
      event: "alerts.dispatch.health",
      outcome: "failure",
      resource: "alerts_dispatch",
      metadata: { reason: auth.reason, clientKey },
    });
    return apiError({
      status: 401,
      error: "unauthorized",
      message: "Unauthorized",
    });
  }

  auditLog({
    event: "alerts.dispatch.health",
    outcome: "success",
    resource: "alerts_dispatch",
    metadata: { authMode: auth.mode, clientKey },
  });
  return apiOk(
    {
      ok: true,
      service: "alerts_dispatch",
      auth_mode: auth.mode,
      checked_at: new Date().toISOString(),
    },
    200,
    { "X-Dispatch-Auth-Mode": auth.mode }
  );
}
