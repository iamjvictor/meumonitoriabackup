-- Existing outbox records cannot be safely assigned to sandbox or production.
-- Quarantine them so neither environment worker can claim or update them.
ALTER TABLE "email_outbox_messages"
ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'QUARANTINED';

ALTER TABLE "email_outbox_messages"
ALTER COLUMN "environment" DROP DEFAULT;

UPDATE "email_outbox_messages"
SET "status" = 'FAILED',
    "encrypted_payload" = '',
    "last_error" = 'Environment missing during environment-isolation migration; manual reconciliation required'
WHERE "status" IN ('PENDING', 'RETRY', 'PROCESSING');

CREATE INDEX "email_outbox_messages_environment_status_next_attempt_at_idx"
ON "email_outbox_messages"("environment", "status", "next_attempt_at");

DROP INDEX "email_outbox_messages_idempotency_key_key";

CREATE UNIQUE INDEX "email_outbox_messages_environment_idempotency_key_key"
ON "email_outbox_messages"("environment", "idempotency_key");

ALTER TABLE "email_webhook_events"
ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'QUARANTINED';

ALTER TABLE "email_webhook_events"
ALTER COLUMN "environment" DROP DEFAULT;

ALTER TABLE "email_webhook_events"
DROP CONSTRAINT "email_webhook_events_pkey";

ALTER TABLE "email_webhook_events"
ADD CONSTRAINT "email_webhook_events_pkey" PRIMARY KEY ("environment", "event_id");

CREATE INDEX "email_webhook_events_environment_provider_message_id_provider_created_at_idx"
ON "email_webhook_events"("environment", "provider_message_id", "provider_created_at");
