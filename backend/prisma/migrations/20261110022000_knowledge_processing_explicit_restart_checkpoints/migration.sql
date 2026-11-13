ALTER TABLE public.knowledge_processing_runs
  ADD COLUMN explicit_restart_key varchar(255);

ALTER TABLE public.knowledge_processing_runs
  ADD COLUMN schema_version varchar(64) NOT NULL DEFAULT 'knowledge-batch-v1';

CREATE UNIQUE INDEX knowledge_processing_runs_document_tenant_restart_key_key
  ON public.knowledge_processing_runs(document_id, teacher_id, monitor_id, explicit_restart_key);

ALTER TABLE public.knowledge_processing_batches
  DROP CONSTRAINT knowledge_processing_batches_batch_key_key;

ALTER TABLE public.knowledge_processing_batches
  ADD COLUMN checkpoint_source_run_id uuid;

ALTER TABLE public.knowledge_processing_batches
  ADD CONSTRAINT knowledge_processing_batches_run_batch_key_key
    UNIQUE(run_id, batch_key),
  ADD CONSTRAINT knowledge_processing_batches_source_tenant_fkey
    FOREIGN KEY(checkpoint_source_run_id, document_id, teacher_id, monitor_id)
    REFERENCES public.knowledge_processing_runs(id, document_id, teacher_id, monitor_id)
    ON DELETE RESTRICT;

CREATE INDEX knowledge_processing_batches_checkpoint_source_run_idx
  ON public.knowledge_processing_batches(checkpoint_source_run_id, batch_key);
