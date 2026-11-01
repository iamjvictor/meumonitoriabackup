ALTER TABLE "payment_accounts"
  ADD COLUMN IF NOT EXISTS "webhook_sync_state" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "webhook_sync_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "webhook_sync_next_attempt_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "webhook_sync_lease_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "webhook_sync_error_code" TEXT;

UPDATE "payment_accounts"
SET "webhook_sync_state" = CASE WHEN "provider_webhook_id" IS NOT NULL THEN 'ACTIVE' ELSE 'PENDING' END,
    "webhook_sync_next_attempt_at" = CASE WHEN "provider_webhook_id" IS NOT NULL THEN NULL ELSE COALESCE("webhook_sync_next_attempt_at", CURRENT_TIMESTAMP) END;

DROP INDEX IF EXISTS "payment_accounts_environment_webhook_sync_state_next_attempt_id";

CREATE INDEX IF NOT EXISTS "payment_accounts_webhook_sync_due_idx"
  ON "payment_accounts"("environment", "webhook_sync_state", "webhook_sync_next_attempt_at");

CREATE INDEX IF NOT EXISTS "payment_accounts_webhook_sync_lease_idx"
  ON "payment_accounts"("environment", "webhook_sync_state", "webhook_sync_lease_until");
