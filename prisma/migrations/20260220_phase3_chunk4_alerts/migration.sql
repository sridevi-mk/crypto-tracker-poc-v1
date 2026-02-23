-- Phase 3 Chunk 4: alert persistence schema

DO $$ BEGIN
  CREATE TYPE "AlertCondition" AS ENUM ('price_above', 'price_below', 'change_24h_above', 'change_24h_below');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DeliveryStatus" AS ENUM ('sent', 'failed', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "alert_rules" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "condition" "AlertCondition" NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastEvaluatedAt" TIMESTAMP(3),
  "lastTriggeredAt" TIMESTAMP(3),
  "lastDeliveryStatus" "DeliveryStatus",
  "lastDeliveryMessage" TEXT,
  "nextRunAt" TIMESTAMP(3),
  CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alert_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "alert_rules_userId_enabled_idx" ON "alert_rules"("userId", "enabled");
CREATE INDEX IF NOT EXISTS "alert_rules_nextRunAt_idx" ON "alert_rules"("nextRunAt");

CREATE TABLE IF NOT EXISTS "alert_deliveries" (
  "id" TEXT NOT NULL,
  "alertRuleId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "DeliveryStatus" NOT NULL,
  "triggered" BOOLEAN NOT NULL,
  "message" TEXT NOT NULL,
  "provider" TEXT,
  "recipient" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alert_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alert_deliveries_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "alert_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "alert_deliveries_alertRuleId_createdAt_idx" ON "alert_deliveries"("alertRuleId", "createdAt");
CREATE INDEX IF NOT EXISTS "alert_deliveries_userId_createdAt_idx" ON "alert_deliveries"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "alert_runs" (
  "id" TEXT NOT NULL,
  "processed" INTEGER NOT NULL,
  "sent" INTEGER NOT NULL,
  "failed" INTEGER NOT NULL,
  "skipped" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "errorMessage" TEXT,
  CONSTRAINT "alert_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "alert_runs_startedAt_idx" ON "alert_runs"("startedAt");
