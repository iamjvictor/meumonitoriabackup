CREATE TABLE public.knowledge_document_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  monitor_id uuid NOT NULL,
  run_id uuid,
  status text NOT NULL DEFAULT 'STAGING',
  page_count integer CHECK (page_count IS NULL OR page_count > 0),
  chunk_count integer CHECK (chunk_count IS NULL OR chunk_count >= 0),
  asset_count integer CHECK (asset_count IS NULL OR asset_count >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CONSTRAINT knowledge_document_generations_id_document_id_key UNIQUE (id, document_id),
  CONSTRAINT knowledge_document_generations_document_tenant_fkey
    FOREIGN KEY (document_id, teacher_id, monitor_id)
    REFERENCES public.monitor_documents(id, teacher_id, monitor_id) ON DELETE CASCADE
);
CREATE INDEX knowledge_document_generations_document_id_status_created_at_idx
  ON public.knowledge_document_generations(document_id, status, created_at);
CREATE UNIQUE INDEX knowledge_document_generations_run_id_key
  ON public.knowledge_document_generations(run_id);
ALTER TABLE public.knowledge_document_generations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.monitor_documents
  ADD COLUMN active_generation_id uuid,
  ADD CONSTRAINT monitor_documents_active_generation_fkey
    FOREIGN KEY (active_generation_id, id)
    REFERENCES public.knowledge_document_generations(id, document_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX monitor_documents_active_generation_id_id_key
  ON public.monitor_documents(active_generation_id, id);

ALTER TABLE public.document_chunks ADD COLUMN generation_id uuid;
ALTER TABLE public.document_chunks
  ADD CONSTRAINT document_chunks_generation_document_fkey
    FOREIGN KEY (generation_id, document_id)
    REFERENCES public.knowledge_document_generations(id, document_id) ON DELETE RESTRICT;
DROP INDEX IF EXISTS public.document_chunks_document_id_chunk_index_key;
CREATE UNIQUE INDEX document_chunks_document_id_generation_id_chunk_index_key
  ON public.document_chunks(document_id, generation_id, chunk_index);
CREATE UNIQUE INDEX document_chunks_legacy_document_id_chunk_index_key
  ON public.document_chunks(document_id, chunk_index)
  WHERE generation_id IS NULL;
DROP INDEX IF EXISTS public.document_chunks_block_id_chunk_index_in_block_key;
CREATE UNIQUE INDEX document_chunks_block_id_generation_id_chunk_index_in_block_key
  ON public.document_chunks(block_id, generation_id, chunk_index_in_block);
CREATE UNIQUE INDEX document_chunks_legacy_block_id_chunk_index_in_block_key
  ON public.document_chunks(block_id, chunk_index_in_block)
  WHERE generation_id IS NULL;
CREATE INDEX document_chunks_document_id_generation_id_status_idx
  ON public.document_chunks(document_id, generation_id, status);

ALTER TABLE public.document_visual_assets ADD COLUMN generation_id uuid;
ALTER TABLE public.document_visual_assets
  ADD CONSTRAINT document_visual_assets_generation_document_fkey
    FOREIGN KEY (generation_id, document_id)
    REFERENCES public.knowledge_document_generations(id, document_id) ON DELETE RESTRICT;
CREATE INDEX document_visual_assets_document_id_generation_id_page_number_idx
  ON public.document_visual_assets(document_id, generation_id, page_number);
