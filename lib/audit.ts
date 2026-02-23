import { logger } from "@/lib/logger";

export function auditLog(params: {
  event: string;
  actor?: string | null;
  outcome: "success" | "failure";
  resource?: string;
  metadata?: Record<string, unknown>;
}) {
  logger.info("audit.event", {
    event: params.event,
    actor: params.actor || "anonymous",
    outcome: params.outcome,
    resource: params.resource || "unknown",
    ...(params.metadata || {}),
  });
}
