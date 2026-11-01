ALTER TABLE "payment_orders"
ADD COLUMN "billing_interval" TEXT NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN "service_months" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "split_policy" TEXT NOT NULL DEFAULT 'TEACHER_ELIGIBLE';

CREATE TABLE "sponsored_seat_batches" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "monitor_id" UUID NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'SANDBOX',
    "billing_interval" TEXT NOT NULL,
    "service_months" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "seat_count" INTEGER NOT NULL,
    "gross_price_cents" INTEGER NOT NULL,
    "platform_amount_cents" INTEGER NOT NULL,
    "teacher_percentage" DECIMAL(7,4) NOT NULL,
    "total_amount_cents" INTEGER NOT NULL,
    "external_reference" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "provider_checkout_id" TEXT,
    "checkout_url" TEXT,
    "checkout_expires_at" TIMESTAMP(3),
    "provider_subscription_id" TEXT,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsored_seat_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sponsored_seat_batches_seat_count_check" CHECK ("seat_count" > 0),
    CONSTRAINT "sponsored_seat_batches_amounts_check" CHECK (
        "gross_price_cents" > 0 AND "platform_amount_cents" >= 0 AND "total_amount_cents" >= 0
    ),
    CONSTRAINT "sponsored_seat_batches_interval_check" CHECK (
        ("billing_interval" = 'MONTHLY' AND "service_months" = 1) OR
        ("billing_interval" = 'ANNUAL' AND "service_months" = 12)
    )
);

CREATE TABLE "sponsored_seats" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "student_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "access_revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsored_seats_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sponsored_seats_email_normalized_check" CHECK ("email_normalized" = lower(trim("email_normalized")))
);

CREATE TABLE "sponsored_seat_payments" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'SANDBOX',
    "provider_payment_id" TEXT NOT NULL,
    "provider_checkout_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "gross_cents" INTEGER NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "service_period_start" TIMESTAMP(3),
    "service_period_end" TIMESTAMP(3),
    "last_provider_event_at" TIMESTAMP(3),
    "last_provider_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sponsored_seat_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sponsored_seat_payments_gross_cents_check" CHECK ("gross_cents" >= 0)
);

CREATE UNIQUE INDEX "sponsored_seat_batches_environment_external_reference_key"
ON "sponsored_seat_batches"("environment", "external_reference");
CREATE UNIQUE INDEX "sponsored_seat_batches_environment_provider_checkout_id_key"
ON "sponsored_seat_batches"("environment", "provider_checkout_id");
CREATE UNIQUE INDEX "sponsored_seat_batches_environment_provider_subscription_id_key"
ON "sponsored_seat_batches"("environment", "provider_subscription_id");
CREATE UNIQUE INDEX "sponsored_seat_batches_teacher_id_idempotency_key_key"
ON "sponsored_seat_batches"("teacher_id", "idempotency_key");
CREATE INDEX "sponsored_seat_batches_teacher_id_status_created_at_idx"
ON "sponsored_seat_batches"("teacher_id", "status", "created_at");
CREATE INDEX "sponsored_seat_batches_monitor_id_status_idx"
ON "sponsored_seat_batches"("monitor_id", "status");

CREATE UNIQUE INDEX "sponsored_seats_batch_id_email_normalized_key"
ON "sponsored_seats"("batch_id", "email_normalized");
CREATE INDEX "sponsored_seats_email_normalized_status_idx"
ON "sponsored_seats"("email_normalized", "status");
CREATE INDEX "sponsored_seats_student_id_status_idx"
ON "sponsored_seats"("student_id", "status");
CREATE INDEX "sponsored_seats_batch_id_status_idx"
ON "sponsored_seats"("batch_id", "status");

CREATE UNIQUE INDEX "sponsored_seat_payments_environment_provider_payment_id_key"
ON "sponsored_seat_payments"("environment", "provider_payment_id");
CREATE INDEX "sponsored_seat_payments_batch_id_status_idx"
ON "sponsored_seat_payments"("batch_id", "status");
CREATE INDEX "sponsored_seat_payments_provider_checkout_id_idx"
ON "sponsored_seat_payments"("provider_checkout_id");

ALTER TABLE "sponsored_seat_batches"
ADD CONSTRAINT "sponsored_seat_batches_teacher_id_fkey"
FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sponsored_seat_batches"
ADD CONSTRAINT "sponsored_seat_batches_monitor_id_fkey"
FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sponsored_seats"
ADD CONSTRAINT "sponsored_seats_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "sponsored_seat_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sponsored_seats"
ADD CONSTRAINT "sponsored_seats_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sponsored_seat_payments"
ADD CONSTRAINT "sponsored_seat_payments_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "sponsored_seat_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
