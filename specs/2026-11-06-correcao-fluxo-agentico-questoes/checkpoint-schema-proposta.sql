-- PROPOSTA, NAO EXECUTAR AUTOMATICAMENTE.
-- Schema compatível com @langchain/langgraph-checkpoint-postgres@1.1.2.
-- Criado isoladamente para o saver do grafo de questões; não usa public e não
-- modifica tabelas do produto. Para novos ambientes, prefira chamar setup()
-- explicitamente no PostgresQuestionGraphCheckpointBackend apenas após aprovar
-- e provisionar um banco/schema isolado.

BEGIN;

CREATE SCHEMA IF NOT EXISTS "question_graph_checkpoints";

CREATE TABLE IF NOT EXISTS "question_graph_checkpoints".checkpoint_migrations (
  v INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS "question_graph_checkpoints".checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT,
  checkpoint JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS "question_graph_checkpoints".checkpoint_blobs (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT NOT NULL,
  blob BYTEA,
  PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

CREATE TABLE IF NOT EXISTS "question_graph_checkpoints".checkpoint_writes (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT,
  blob BYTEA NOT NULL,
  task_path TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

-- Marca as seis etapas de schema do pacote oficial como aplicadas, pois este
-- arquivo representa o estado final equivalente às migrations v0..v5.
INSERT INTO "question_graph_checkpoints".checkpoint_migrations (v)
VALUES (0), (1), (2), (3), (4), (5)
ON CONFLICT (v) DO NOTHING;

COMMIT;
