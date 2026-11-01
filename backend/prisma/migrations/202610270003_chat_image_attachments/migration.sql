CREATE TABLE "chat_image_attachments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "monitor_id" UUID NOT NULL,
  "subject_id" UUID NOT NULL,
  "storage_path" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_image_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_image_attachments_storage_path_key" UNIQUE ("storage_path"),
  CONSTRAINT "chat_image_attachments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_image_attachments_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "chat_image_attachments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "monitor_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "chat_image_attachments_student_id_monitor_id_subject_id_expires_at_idx" ON "chat_image_attachments"("student_id", "monitor_id", "subject_id", "expires_at");
CREATE INDEX "chat_image_attachments_expires_at_idx" ON "chat_image_attachments"("expires_at");

ALTER TABLE "chat_image_attachments" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('chat-attachments', 'chat-attachments', false, 5242880, ARRAY['image/png','image/jpeg','image/webp']::text[])
    ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;
