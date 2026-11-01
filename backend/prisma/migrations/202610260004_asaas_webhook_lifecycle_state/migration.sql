ALTER TABLE "payment_charges"
ADD COLUMN "last_provider_event_at" TIMESTAMP(3),
ADD COLUMN "last_provider_event_id" TEXT;

ALTER TABLE "payment_subscriptions"
ADD COLUMN "split_status" TEXT,
ADD COLUMN "last_provider_event_at" TIMESTAMP(3),
ADD COLUMN "last_provider_event_id" TEXT,
ADD COLUMN "split_status_event_at" TIMESTAMP(3),
ADD COLUMN "access_revocation_reason" TEXT;
