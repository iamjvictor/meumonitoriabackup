ALTER TABLE public.monitor_documents
  ADD CONSTRAINT monitor_documents_id_teacher_monitor_key UNIQUE (id, teacher_id, monitor_id);

CREATE TYPE public."KnowledgeProcessingRunStatus" AS ENUM (
  'QUEUED', 'RUNNING', 'PAUSED_TIMEOUT', 'FAILED', 'READY_TO_PUBLISH', 'COMPLETED', 'CANCELLED'
);
CREATE TYPE public."KnowledgeProcessingBatchStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE public.knowledge_processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  monitor_id uuid NOT NULL,
  content_hash varchar(64) NOT NULL,
  configuration_hash varchar(64) NOT NULL,
  parser_version text NOT NULL,
  profile jsonb NOT NULL,
  page_count integer NOT NULL CHECK (page_count > 0),
  page_budget_seconds integer NOT NULL CHECK (page_budget_seconds > 0),
  consumed_seconds integer NOT NULL DEFAULT 0 CHECK (consumed_seconds >= 0),
  status public."KnowledgeProcessingRunStatus" NOT NULL DEFAULT 'QUEUED',
  generation integer NOT NULL DEFAULT 1 CHECK (generation > 0),
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_processing_runs_id_document_tenant_key UNIQUE (id, document_id, teacher_id, monitor_id),
  CONSTRAINT knowledge_processing_runs_document_tenant_fkey FOREIGN KEY (document_id, teacher_id, monitor_id)
    REFERENCES public.monitor_documents(id, teacher_id, monitor_id) ON DELETE CASCADE
);
CREATE INDEX knowledge_processing_runs_document_status_updated_idx
  ON public.knowledge_processing_runs(document_id, status, updated_at);

CREATE TABLE public.knowledge_processing_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  document_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  monitor_id uuid NOT NULL,
  page_start integer NOT NULL CHECK (page_start > 0),
  page_end integer NOT NULL CHECK (page_end >= page_start),
  batch_key varchar(64) NOT NULL UNIQUE,
  status public."KnowledgeProcessingBatchStatus" NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  artifact_path text,
  artifact_checksum varchar(64),
  manifest jsonb,
  duration_ms integer CHECK (duration_ms >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_processing_batches_run_pages_key UNIQUE(run_id, page_start, page_end),
  CONSTRAINT knowledge_processing_batches_run_tenant_fkey FOREIGN KEY (run_id, document_id, teacher_id, monitor_id)
    REFERENCES public.knowledge_processing_runs(id, document_id, teacher_id, monitor_id) ON DELETE CASCADE
);
CREATE INDEX knowledge_processing_batches_run_status_page_idx
  ON public.knowledge_processing_batches(run_id, status, page_start);
ALTER TABLE public.knowledge_processing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_processing_batches ENABLE ROW LEVEL SECURITY;
