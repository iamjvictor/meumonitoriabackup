ALTER TABLE "document_chunks"
  ADD COLUMN "pages" JSONB,
  ADD COLUMN "headings" JSONB,
  ADD COLUMN "chunk_type" TEXT,
  ADD COLUMN "engine" TEXT,
  ADD COLUMN "tokenizer_id" TEXT,
  ADD COLUMN "chunker_version" TEXT,
  ADD COLUMN "provenance" JSONB,
  ADD COLUMN "doc_hash" VARCHAR(64),
  ADD COLUMN "source_key" VARCHAR(255);

CREATE UNIQUE INDEX "document_chunks_source_key_key"
  ON "document_chunks"("source_key");
