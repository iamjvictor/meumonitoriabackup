import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { CheckpointListOptions, CheckpointTuple } from '@langchain/langgraph-checkpoint';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { ChannelVersions, Checkpoint, CheckpointMetadata, PendingWrite } from '@langchain/langgraph-checkpoint';
import type { Pool } from 'pg';
import { DurableQuestionGraphCheckpointBackend } from './checkpoint.js';

const DEFAULT_SCHEMA = 'question_graph_checkpoints';
const QUESTION_GRAPH_THREAD_ID = /^qgraph-v1-[a-f0-9]{64}$/;
const ROOT_CHECKPOINT_NAMESPACE = '';

export type PostgresQuestionGraphCheckpointOptions = {
  /** PostgreSQL schema dedicated to LangGraph checkpoints; never defaults to public. */
  schema?: string;
};

function validateSchemaName(schema: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) {
    throw new Error('Nome de schema de checkpoint inválido. Use letras minúsculas, números e underscore.');
  }
  return schema;
}

function assertQuestionGraphConfig(config: RunnableConfig, requireCheckpoint = false): void {
  const configurable = config.configurable;
  const threadId = configurable?.thread_id;
  const checkpointNamespace = configurable?.checkpoint_ns;
  if (typeof threadId !== 'string' || !QUESTION_GRAPH_THREAD_ID.test(threadId)) {
    throw new Error('Thread de checkpoint fora do namespace autorizado do grafo de questões.');
  }
  if (checkpointNamespace !== ROOT_CHECKPOINT_NAMESPACE) {
    throw new Error('Namespace de checkpoint fora do escopo autorizado do grafo de questões.');
  }
  if (requireCheckpoint && (typeof configurable?.checkpoint_id !== 'string' || configurable.checkpoint_id.length === 0)) {
    throw new Error('Configuração sem checkpoint_id para gravar pending writes.');
  }
}

/**
 * Durable PostgreSQL implementation of the LangGraph checkpoint contract.
 *
 * The constructor only wraps the caller-owned Pool. It never runs DDL. Call
 * `setup()` explicitly once for a newly provisioned isolated schema, or run
 * the proposed SQL in specs/.../checkpoint-schema-proposta.sql through the
 * project's reviewed database initialization process. The injected Pool stays
 * owned by the caller and must be closed by the caller during shutdown.
 */
export class PostgresQuestionGraphCheckpointBackend extends DurableQuestionGraphCheckpointBackend {
  private readonly pool: Pool;
  private readonly saver: PostgresSaver;
  readonly schema: string;

  constructor(pool: Pool, options: PostgresQuestionGraphCheckpointOptions = {}) {
    const schema = validateSchemaName(options.schema ?? DEFAULT_SCHEMA);
    const saver = new PostgresSaver(pool, undefined, { schema });
    super(saver.serde);
    this.schema = schema;
    this.pool = pool;
    this.saver = saver;
  }

  /**
   * Explicitly invokes the official saver migrations for this isolated schema.
   * This method is never called by construction or worker wiring.
   */
  async setup(): Promise<void> {
    await this.saver.setup();
  }

  /** Read-only readiness check. It never creates or alters database objects. */
  async assertSchemaReady(): Promise<void> {
    const relationNames = ['checkpoints', 'checkpoint_blobs', 'checkpoint_migrations', 'checkpoint_writes'];
    const [row] = (await this.pool.query(
      `SELECT ${relationNames.map((_, index) => `to_regclass($${index + 1}) AS table_${index}`).join(', ')}`,
      relationNames.map((name) => `${this.schema}.${name}`),
    )).rows as Array<Record<string, string | null>>;

    if (!row || relationNames.some((_, index) => !row[`table_${index}`])) {
      throw new Error(`Schema de checkpoints LangGraph indisponível ou incompleto: ${this.schema}. Inicialize o schema dedicado antes de ativar a extração.`);
    }
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    assertQuestionGraphConfig(config);
    return this.saver.getTuple(config);
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    assertQuestionGraphConfig(config);
    if (options?.before) {
      assertQuestionGraphConfig(options.before);
      if (options.before.configurable?.thread_id !== config.configurable?.thread_id) {
        throw new Error('Cursor de listagem pertence a outra execução/documento/versão.');
      }
    }
    for await (const tuple of this.saver.list(config, options)) yield tuple;
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    assertQuestionGraphConfig(config);
    return this.saver.put(config, checkpoint, metadata, newVersions);
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string, taskPath?: string): Promise<void> {
    assertQuestionGraphConfig(config, true);
    await this.saver.putWrites(config, writes, taskId, taskPath);
  }

  async deleteThread(threadId: string): Promise<void> {
    if (!QUESTION_GRAPH_THREAD_ID.test(threadId)) {
      throw new Error('Recusa excluir thread de checkpoint fora do namespace do grafo de questões.');
    }
    await this.saver.deleteThread(threadId);
  }
}

