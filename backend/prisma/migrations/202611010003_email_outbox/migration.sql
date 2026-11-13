CREATE TABLE "email_outbox_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idempotency_key" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "recipient_hash" TEXT NOT NULL,
    "encrypted_payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_until" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "email_outbox_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_outbox_messages_idempotency_key_key" ON "email_outbox_messages"("idempotency_key");
CREATE INDEX "email_outbox_messages_status_next_attempt_at_idx" ON "email_outbox_messages"("status", "next_attempt_at");
CREATE INDEX "email_outbox_messages_recipient_hash_idx" ON "email_outbox_messages"("recipient_hash");

ALTER TABLE "email_outbox_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "email_outbox_messages" FROM anon, authenticated;
