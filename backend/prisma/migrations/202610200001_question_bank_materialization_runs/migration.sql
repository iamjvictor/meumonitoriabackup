CREATE TYPE "QuestionBankMaterializationStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'RETRYING',
  'COMPLETED',
  'COMPLETED_WITH_WARNINGS',
  'FAILED'
);

CREATE TABLE "question_bank_materialization_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "monitor_id" UUID NOT NULL,
  "status" "QuestionBankMaterializationStatus" NOT NULL DEFAULT 'QUEUED',
  "total_selected" INTEGER NOT NULL DEFAULT 0,
  "total_eligible" INTEGER,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "created" INTEGER NOT NULL DEFAULT 0,
  "updated" INTEGER NOT NULL DEFAULT 0,
  "skipped" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "question_bank_materialization_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "question_bank_materialization_runs_monitor_id_key"
  ON "question_bank_materialization_runs"("monitor_id");

CREATE INDEX "question_bank_materialization_runs_status_updated_at_idx"
  ON "question_bank_materialization_runs"("status", "updated_at");

ALTER TABLE "question_bank_materialization_runs"
  ADD CONSTRAINT "question_bank_materialization_runs_monitor_id_fkey"
  FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
