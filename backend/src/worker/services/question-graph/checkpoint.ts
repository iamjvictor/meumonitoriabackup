import { createHash } from 'node:crypto';
import { BaseCheckpointSaver } from '@langchain/langgraph';
import type { QuestionGraphState } from './state.js';

export type QuestionGraphCheckpointScope = {
  executionId: string;
  documentId: string;
  documentVersion: string;
};

/**
 * Runtime marker for an explicitly implemented persistent backend. Volatile
 * savers such as LangGraph's MemorySaver cannot satisfy this contract by
 * setting a caller-provided boolean.
 */
export abstract class DurableQuestionGraphCheckpointBackend extends BaseCheckpointSaver {}

type SaverConfig = Parameters<BaseCheckpointSaver['getTuple']>[0];
type SaverCheckpoint = Parameters<BaseCheckpointSaver['put']>[1];
type SaverMetadata = Parameters<BaseCheckpointSaver['put']>[2];
type SaverVersions = Parameters<BaseCheckpointSaver['put']>[3];
type SaverWrites = Parameters<BaseCheckpointSaver['putWrites']>[1];
type SaverTuple = NonNullable<Awaited<ReturnType<BaseCheckpointSaver['getTuple']>>>;
type SaverListOptions = Parameters<BaseCheckpointSaver['list']>[1];

// LangGraph 1.7 normalizes the root graph checkpoint namespace to the empty
// string. The versioned thread id supplies the graph namespace and scope.
const CHECKPOINT_NAMESPACE = '';
const SENSITIVE_KEY = /(?:api[-_ ]?key|authorization|(?:access|refresh|session|auth|bearer|jwt)[-_ ]?token|\btoken\b|\bjwt\b|password|credential|secret|base64|data[-_ ]?url|(?:image|pdf|binary)[-_ ]?(?:bytes|data))/i;
const SENSITIVE_VALUE = [
  /data:[^\s,;]+;base64,/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}/i,
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
  /\bsk-(?:or-)?v1-[A-Za-z0-9_-]{12,}/i,
  /(?:^|[\s=:])(?:[A-Za-z0-9+/]{160,}={0,2})(?=$|[\s,;])/,
];

function requiredScopeValue(label: string, value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`Escopo de checkpoint inválido: ${label}.`);
  }
  return normalized;
}

function threadIdForScope(scope: QuestionGraphCheckpointScope): string {
  const identity = [scope.executionId, scope.documentId, scope.documentVersion].join('\u0000');
  return `qgraph-v1-${createHash('sha256').update(identity).digest('hex')}`;
}

export function createQuestionGraphCheckpointConfig(scopeInput: QuestionGraphCheckpointScope) {
  const scope = {
    executionId: requiredScopeValue('executionId', scopeInput.executionId),
    documentId: requiredScopeValue('documentId', scopeInput.documentId),
    documentVersion: requiredScopeValue('documentVersion', scopeInput.documentVersion),
  };
  return {
    configurable: {
      thread_id: threadIdForScope(scope),
      checkpoint_ns: CHECKPOINT_NAMESPACE,
      question_execution_id: scope.executionId,
      question_document_id: scope.documentId,
      question_document_version: scope.documentVersion,
    },
  };
}

function scopeFromConfig(config: SaverConfig): QuestionGraphCheckpointScope {
  const values = config.configurable ?? {};
  const scope = {
    executionId: typeof values.question_execution_id === 'string' ? values.question_execution_id : '',
    documentId: typeof values.question_document_id === 'string' ? values.question_document_id : '',
    documentVersion: typeof values.question_document_version === 'string' ? values.question_document_version : '',
  };
  const expected = createQuestionGraphCheckpointConfig(scope).configurable;
  if (values.thread_id !== expected.thread_id || values.checkpoint_ns !== CHECKPOINT_NAMESPACE) {
    throw new Error('Escopo do checkpoint não corresponde à execução, documento e versão autorizados.');
  }
  return scope;
}

function assertSameCheckpointScope(config: SaverConfig, other: SaverConfig): void {
  const scope = scopeFromConfig(config);
  const otherConfig = other.configurable ?? {};
  if (otherConfig.thread_id !== threadIdForScope(scope) || otherConfig.checkpoint_ns !== CHECKPOINT_NAMESPACE) {
    throw new Error('Checkpoint cursor pertence a outra execução/documento/versão.');
  }
}

function assertSafeValue(value: unknown, path = 'checkpoint', seen = new WeakSet<object>()): void {
  if (typeof value === 'string') {
    if (SENSITIVE_VALUE.some((pattern) => pattern.test(value))) {
      throw new Error(`Checkpoint contém conteúdo sensível ou binário em ${path}; grave apenas referências duráveis.`);
    }
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return;
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    throw new Error(`Checkpoint contém valor não serializável em ${path}.`);
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    throw new Error(`Checkpoint contém bytes em ${path}; grave apenas IDs e referências.`);
  }
  if (typeof value !== 'object') return;
  if (seen.has(value)) throw new Error(`Checkpoint contém referência circular em ${path}.`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertSafeValue(child, `${path}[${index}]`, seen));
    seen.delete(value);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) throw new Error(`Checkpoint contém campo sensível em ${path}.${key}.`);
    assertSafeValue(child, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

function assertSafeTuple(tuple: SaverTuple): void {
  assertSafeValue(tuple.checkpoint, 'checkpoint');
  assertSafeValue(tuple.metadata ?? {}, 'metadata');
  assertSafeValue(tuple.pendingWrites ?? [], 'pendingWrites');
}

/**
 * Scope and payload guard around a LangGraph saver. Durability comes from the
 * injected saver: this adapter deliberately does not choose a database or add
 * a schema. The installed stack exposes LangGraph's BaseCheckpointSaver and
 * volatile MemorySaver, but no Postgres/SQLite saver package is installed.
 * Therefore MemorySaver tests verify API compatibility and restart logic only;
 * they do not prove durable storage. Production must inject an approved
 * persistent BaseCheckpointSaver before enabling the graph path.
 */
export class QuestionGraphCheckpointSaver extends BaseCheckpointSaver {
  constructor(private readonly delegate: BaseCheckpointSaver) {
    super(delegate.serde);
  }

  hasDurableBackend(): boolean {
    return isDurableQuestionGraphCheckpointBackend(this.delegate);
  }

  async getTuple(config: SaverConfig): Promise<SaverTuple | undefined> {
    scopeFromConfig(config);
    const tuple = await this.delegate.getTuple(config);
    if (!tuple) return undefined;
    assertSameCheckpointScope(config, tuple.config);
    assertSafeTuple(tuple);
    return { ...tuple, config: mergeScopedConfig(config, tuple.config) };
  }

  async *list(config: SaverConfig, options?: SaverListOptions): AsyncGenerator<SaverTuple> {
    scopeFromConfig(config);
    if (options?.before) assertSameCheckpointScope(config, options.before);
    for await (const tuple of this.delegate.list(config, options)) {
      assertSameCheckpointScope(config, tuple.config);
      assertSafeTuple(tuple);
      yield { ...tuple, config: mergeScopedConfig(config, tuple.config) };
    }
  }

  async put(config: SaverConfig, checkpoint: SaverCheckpoint, metadata: SaverMetadata, newVersions: SaverVersions): Promise<SaverConfig> {
    scopeFromConfig(config);
    assertSafeValue(checkpoint, 'checkpoint');
    assertSafeValue(metadata ?? {}, 'metadata');
    const savedConfig = await this.delegate.put(config, checkpoint, metadata, newVersions);
    return mergeScopedConfig(config, savedConfig);
  }

  async putWrites(config: SaverConfig, writes: SaverWrites, taskId: string, taskPath?: string): Promise<void> {
    scopeFromConfig(config);
    assertSafeValue(writes, 'pendingWrites');
    await this.delegate.putWrites(config, writes, taskId, taskPath);
  }

  async deleteThread(threadId: string): Promise<void> {
    if (!/^qgraph-v1-[a-f0-9]{64}$/.test(threadId)) {
      throw new Error('Recusa excluir thread de checkpoint fora do namespace do grafo de questões.');
    }
    await this.delegate.deleteThread(threadId);
  }
}

export function isDurableQuestionGraphCheckpointBackend(saver: BaseCheckpointSaver | undefined): saver is DurableQuestionGraphCheckpointBackend {
  if (!saver) return false;
  if (saver instanceof QuestionGraphCheckpointSaver) {
    return saver.hasDurableBackend();
  }
  return saver instanceof DurableQuestionGraphCheckpointBackend;
}

function mergeScopedConfig(original: SaverConfig, saved: SaverConfig): SaverConfig {
  const scoped = original.configurable ?? {};
  const returned = saved.configurable ?? {};
  if (returned.thread_id !== scoped.thread_id || returned.checkpoint_ns !== CHECKPOINT_NAMESPACE) {
    throw new Error('Backend de checkpoint retornou configuração fora do escopo autorizado.');
  }
  return { ...saved, configurable: { ...scoped, ...returned } };
}

type GraphSnapshot = { values?: unknown; next?: string[]; config?: SaverConfig };
export type ResumableQuestionGraph = {
  getState(config: SaverConfig): Promise<GraphSnapshot>;
  invoke(input: unknown, config?: SaverConfig & { recursionLimit?: number }): Promise<unknown>;
};

function isCompletedSnapshot(snapshot: GraphSnapshot, scope: QuestionGraphCheckpointScope): snapshot is GraphSnapshot & { values: QuestionGraphState } {
  if (!snapshot.values || typeof snapshot.values !== 'object' || (snapshot.next?.length ?? 0) > 0) return false;
  const values = snapshot.values as Partial<QuestionGraphState>;
  return values.executionId === scope.executionId
    && values.documentId === scope.documentId
    && values.documentVersion === scope.documentVersion
    && values.nextNode === 'end'
    && typeof values.stage === 'string'
    && Array.isArray(values.backendOutput);
}

/** Returns the terminal checkpoint for an already completed run instead of rerunning side effects. */
export async function invokeQuestionGraphIdempotently(
  graph: ResumableQuestionGraph,
  input: QuestionGraphState,
  options: { recursionLimit?: number } = {},
): Promise<QuestionGraphState> {
  const scope = { executionId: input.executionId, documentId: input.documentId, documentVersion: input.documentVersion };
  const config = { ...createQuestionGraphCheckpointConfig(scope), ...options } as SaverConfig & { recursionLimit?: number };
  const snapshot = await graph.getState(config);
  if (isCompletedSnapshot(snapshot, scope)) return snapshot.values;
  const hasCheckpoint = Boolean(snapshot.config?.configurable?.checkpoint_id);
  return await graph.invoke(hasCheckpoint ? null : input, config) as QuestionGraphState;
}
