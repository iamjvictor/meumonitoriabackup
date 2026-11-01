ALTER TABLE "payment_webhook_events" ADD COLUMN IF NOT EXISTS "source_provider_account_id" TEXT;

UPDATE "payment_webhook_events"
SET "source_provider_account_id" = COALESCE(
  "provider_account_id",
  NULLIF("payload" #>> '{account,id}', ''),
  NULLIF("payload" ->> 'accountId', '')
);

-- Keep every pre-existing duplicate for audit before enforcing event identity.
CREATE TABLE IF NOT EXISTS "payment_webhook_event_duplicates_archive" AS
SELECT event.*, CURRENT_TIMESTAMP AS "archived_at"
FROM "payment_webhook_events" AS event
WHERE FALSE;

WITH ranked AS (
  SELECT event."id",
    ROW_NUMBER() OVER (
      PARTITION BY event."environment", event."provider_event_id"
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1 FROM "payment_outbox_events" AS outbox
          WHERE outbox."aggregate_id" = event."id"
        ) THEN 0 ELSE 1 END,
        CASE WHEN event."processed_at" IS NOT NULL THEN 0 ELSE 1 END,
        event."created_at", event."id"
    ) AS row_number
  FROM "payment_webhook_events" AS event
)
INSERT INTO "payment_webhook_event_duplicates_archive"
SELECT event.*, CURRENT_TIMESTAMP
FROM "payment_webhook_events" AS event
JOIN ranked ON ranked."id" = event."id"
WHERE ranked.row_number > 1;

DELETE FROM "payment_webhook_events" AS event
USING "payment_webhook_event_duplicates_archive" AS archived
WHERE event."id" = archived."id";

DROP INDEX IF EXISTS "payment_webhook_events_environment_provider_account_id_provider_event_id_key";
DROP INDEX IF EXISTS "payment_webhook_events_environment_provider_account_id_prov_key";
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_environment_provider_event_id_key"
ON "payment_webhook_events"("environment", "provider_event_id");
