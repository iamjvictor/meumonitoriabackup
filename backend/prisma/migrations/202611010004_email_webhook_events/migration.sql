CREATE TABLE "email_webhook_events" (
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "provider_message_id" TEXT NOT NULL,
    "provider_created_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_webhook_events_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "email_webhook_events_provider_message_id_provider_created_at_idx"
ON "email_webhook_events"("provider_message_id", "provider_created_at");

ALTER TABLE "email_webhook_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "email_webhook_events" FROM anon, authenticated;
