CREATE TABLE "document_visual_asset_indexes" (
  "visual_asset_id" UUID NOT NULL,
  "description" TEXT,
  "description_status" TEXT NOT NULL DEFAULT 'PENDING',
  "description_model" TEXT,
  "description_version" TEXT,
  "embedding_model" TEXT,
  "embedding_version" TEXT,
  "error_code" TEXT,
  "embedding" extensions.vector(2048),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_visual_asset_indexes_pkey" PRIMARY KEY ("visual_asset_id"),
  CONSTRAINT "document_visual_asset_indexes_visual_asset_id_fkey" FOREIGN KEY ("visual_asset_id") REFERENCES "document_visual_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "document_visual_asset_indexes_description_status_idx"
  ON "document_visual_asset_indexes"("description_status");

ALTER TABLE "document_visual_asset_indexes" ENABLE ROW LEVEL SECURITY;
