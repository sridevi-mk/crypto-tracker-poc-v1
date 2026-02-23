-- Phase 3 Chunk 5: worker idempotency keys

ALTER TABLE "alert_runs"
ADD COLUMN IF NOT EXISTS "runKey" TEXT;

UPDATE "alert_runs"
SET "runKey" = CONCAT('legacy-', "id")
WHERE "runKey" IS NULL;

ALTER TABLE "alert_runs"
ALTER COLUMN "runKey" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "alert_runs_runKey_key" ON "alert_runs"("runKey");

ALTER TABLE "alert_deliveries"
ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "alert_deliveries_dedupeKey_key" ON "alert_deliveries"("dedupeKey");
