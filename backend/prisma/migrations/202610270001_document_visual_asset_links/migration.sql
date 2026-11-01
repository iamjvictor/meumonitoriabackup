ALTER TABLE "document_visual_assets"
  ADD COLUMN "source_key" TEXT;

UPDATE "document_visual_assets"
SET "source_key" = 'legacy:' || "id"::text
WHERE "source_key" IS NULL;

ALTER TABLE "document_visual_assets"
  ALTER COLUMN "source_key" SET NOT NULL;

CREATE UNIQUE INDEX "document_visual_assets_document_id_parse_run_id_source_key_key"
  ON "document_visual_assets"("document_id", "parse_run_id", "source_key");

CREATE TABLE "document_chunk_visual_assets" (
  "chunk_id" UUID NOT NULL,
  "visual_asset_id" UUID NOT NULL,
  "association_method" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'INLINE',
  "confidence" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_chunk_visual_assets_pkey" PRIMARY KEY ("chunk_id", "visual_asset_id"),
  CONSTRAINT "document_chunk_visual_assets_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "document_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_chunk_visual_assets_visual_asset_id_fkey" FOREIGN KEY ("visual_asset_id") REFERENCES "document_visual_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "document_chunk_visual_assets_visual_asset_id_idx"
  ON "document_chunk_visual_assets"("visual_asset_id");

CREATE TABLE "question_visual_assets" (
  "question_id" UUID NOT NULL,
  "visual_asset_id" UUID NOT NULL,
  "association_method" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'STATEMENT',
  "confidence" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "question_visual_assets_pkey" PRIMARY KEY ("question_id", "visual_asset_id"),
  CONSTRAINT "question_visual_assets_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "question_visual_assets_visual_asset_id_fkey" FOREIGN KEY ("visual_asset_id") REFERENCES "document_visual_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "question_visual_assets_visual_asset_id_idx"
  ON "question_visual_assets"("visual_asset_id");

CREATE TABLE "question_span_visual_assets" (
  "question_span_id" UUID NOT NULL,
  "visual_asset_id" UUID NOT NULL,
  "association_method" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'STATEMENT',
  "confidence" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "question_span_visual_assets_pkey" PRIMARY KEY ("question_span_id", "visual_asset_id"),
  CONSTRAINT "question_span_visual_assets_question_span_id_fkey" FOREIGN KEY ("question_span_id") REFERENCES "question_spans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "question_span_visual_assets_visual_asset_id_fkey" FOREIGN KEY ("visual_asset_id") REFERENCES "document_visual_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "question_span_visual_assets_visual_asset_id_idx"
  ON "question_span_visual_assets"("visual_asset_id");

ALTER TABLE "document_chunk_visual_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_visual_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "question_span_visual_assets" ENABLE ROW LEVEL SECURITY;
