CREATE TABLE IF NOT EXISTS "payment_account_creation_operations" (
  "id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "environment" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "provider_account_id" TEXT,
  "failure_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_account_creation_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_account_creation_operations_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_account_creation_operations_teacher_environment_key"
  ON "payment_account_creation_operations"("teacher_id", "environment");
DROP INDEX IF EXISTS "payment_account_creation_operations_environment_status_updated_";

CREATE INDEX IF NOT EXISTS "payment_account_creation_ops_state_idx"
  ON "payment_account_creation_operations"("environment", "status", "updated_at");
