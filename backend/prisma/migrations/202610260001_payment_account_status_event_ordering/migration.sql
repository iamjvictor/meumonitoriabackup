ALTER TABLE "payment_accounts"
  ADD COLUMN "general_status_event_at" TIMESTAMP(3),
  ADD COLUMN "commercial_info_status_event_at" TIMESTAMP(3),
  ADD COLUMN "bank_account_status_event_at" TIMESTAMP(3),
  ADD COLUMN "documentation_status_event_at" TIMESTAMP(3);

UPDATE "payment_accounts"
SET "general_status_event_at" = "last_event_at"
WHERE "general_status" IS NOT NULL AND "last_event_at" IS NOT NULL;

UPDATE "payment_accounts"
SET "commercial_info_status_event_at" = "last_event_at"
WHERE "commercial_info_status" IS NOT NULL AND "last_event_at" IS NOT NULL;

UPDATE "payment_accounts"
SET "bank_account_status_event_at" = "last_event_at"
WHERE "bank_account_status" IS NOT NULL AND "last_event_at" IS NOT NULL;

UPDATE "payment_accounts"
SET "documentation_status_event_at" = "last_event_at"
WHERE "documentation_status" IS NOT NULL AND "last_event_at" IS NOT NULL;
