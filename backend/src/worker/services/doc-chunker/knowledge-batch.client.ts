import { createHash, randomUUID } from 'node:crypto';
import { Agent } from 'undici';

export const LONG_LIVED_PARSER_DISPATCHER_OPTIONS = {
  headersTimeout: 0,
  bodyTimeout: 0,
  connectTimeout: 0,
} as const;

export type KnowledgeBatchRequest = {
  documentId: string;
  runId: string;
  contentHash: string;
  configurationHash: string;
  pageStart: number;
  pageEnd: number;
  profile: Record<string, unknown>;
  fileName: string;
  mimeType: string;
  fileBytes: Uint8Array;
  signal?: AbortSignal;
};

export type KnowledgeBatchPage = {
  pageNumber: number;
  status: 'CONVERTED' | 'VERIFIED_BLANK' | 'FAILED';
  characterCount: number;
  layoutItemCount: number;
  imageCount: number;
  errors: string[];
  blankEvidence?: string;
};

export type KnowledgeBatchManifest = {
  schemaVersion: string;
  documentId: string;
  runId: string;
  contentHash: string;
  configurationHash: string;
  parserVersion: string;
  pageStart: number;
  pageEnd: number;
  pages: KnowledgeBatchPage[];
  files: Array<{ path: string; sha256: string; contentBase64: string }>;
};

export type KnowledgeBatchResponse = {
  manifest: KnowledgeBatchManifest;
  artifact: Buffer;
  artifactChecksum: string;
  durationMs: number;
};

export class KnowledgeBatchClientError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode?: number, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'KnowledgeBatchClientError';
  }
}

export type KnowledgeBatchClientOptions = {
  baseUrl: string;
  serviceToken: string;
  requestTimeoutMs: number;
  maxResponseBytes?: number;
  fetchImpl?: typeof fetch;
  requestIdFactory?: () => string;
  createDispatcher?: (options: typeof LONG_LIVED_PARSER_DISPATCHER_OPTIONS) => Agent;
};

/** Calls the versioned parser endpoint and rejects partial or unverifiable results. */
export class KnowledgeBatchClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: KnowledgeBatchClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async convert(input: KnowledgeBatchRequest): Promise<KnowledgeBatchResponse> {
    validateRequest(input);
    const actualHash = createHash('sha256').update(input.fileBytes).digest('hex');
    if (actualHash !== input.contentHash) throw new KnowledgeBatchClientError('CONTENT_HASH_MISMATCH', 'O PDF mudou antes da conversão em lote.');

    const requestId = (this.options.requestIdFactory ?? randomUUID)();
    const form = new FormData();
    form.append('request', JSON.stringify({
      documentId: input.documentId, runId: input.runId, contentHash: input.contentHash,
      configurationHash: input.configurationHash, pageStart: input.pageStart, pageEnd: input.pageEnd,
      profile: input.profile,
    }));
    form.append('file', new Blob([Buffer.from(input.fileBytes)], { type: input.mimeType }), input.fileName);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);
    const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
    const dispatcher = this.options.createDispatcher?.(LONG_LIVED_PARSER_DISPATCHER_OPTIONS)
      ?? new Agent(LONG_LIVED_PARSER_DISPATCHER_OPTIONS);
    let requestCompleted = false;
    try {
      const requestInit: RequestInit & { dispatcher: Agent } = {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.options.serviceToken}`, 'X-Request-Id': requestId },
        body: form,
        signal,
        dispatcher,
      };
      const response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, '')}/knowledge/batch/v1`, requestInit);
      if (!response.ok) throw new KnowledgeBatchClientError('PARSER_HTTP_ERROR', 'O parser recusou a conversão em lote.', response.status);
      if (response.headers.get('X-Request-Id') !== requestId) throw new KnowledgeBatchClientError('REQUEST_ID_MISMATCH', 'A resposta do parser não corresponde à solicitação.', response.status);
      const mediaType = response.headers.get('Content-Type')?.split(';')[0]?.trim();
      if (mediaType !== 'application/vnd.knowledge-batch.v1+json') throw new KnowledgeBatchClientError('INVALID_CONTENT_TYPE', 'O parser retornou um formato inesperado.', response.status);
      const bytes = await readBounded(response, this.options.maxResponseBytes ?? 64 * 1024 * 1024);
      let decoded: unknown;
      try { decoded = JSON.parse(bytes.toString('utf8')); }
      catch (error) { throw new KnowledgeBatchClientError('INVALID_JSON', 'O resultado do parser não é JSON válido.', response.status, error); }
      const parsed = validateResponse(decoded, input);
      requestCompleted = true;
      return parsed;
    } catch (error) {
      if (error instanceof KnowledgeBatchClientError) throw error;
      if (controller.signal.aborted) throw new KnowledgeBatchClientError('PARSER_TIMEOUT_OR_ABORT', 'A conversão em lote expirou ou foi cancelada.', undefined, error);
      throw new KnowledgeBatchClientError('PARSER_NETWORK_ERROR', 'Falha de comunicação com o parser.', undefined, error);
    } finally {
      clearTimeout(timeout);
      try {
        if (requestCompleted) await dispatcher.close();
        else await dispatcher.destroy();
      } catch {
        // Dispatcher cleanup must not replace the parser result or its original error.
      }
    }
  }
}

function validateRequest(input: KnowledgeBatchRequest) {
  if (!isUuid(input.documentId) || !isUuid(input.runId)) throw new Error('IDs inválidos para conversão em lote.');
  if (!/^[a-f0-9]{64}$/i.test(input.contentHash) || !/^[a-f0-9]{64}$/i.test(input.configurationHash)) throw new Error('Hashes inválidos para conversão em lote.');
  if (!Number.isInteger(input.pageStart) || input.pageStart < 1 || !Number.isInteger(input.pageEnd) || input.pageEnd < input.pageStart) throw new Error('Intervalo de páginas inválido.');
  if (!input.fileBytes.byteLength || !input.fileName.trim() || !input.mimeType) throw new Error('Arquivo inválido para conversão em lote.');
}

function validateResponse(value: unknown, input: KnowledgeBatchRequest): KnowledgeBatchResponse {
  if (!isRecord(value) || !isRecord(value.manifest) || typeof value.durationMs !== 'number' || value.durationMs < 0) throw new KnowledgeBatchClientError('INVALID_MANIFEST', 'O resultado do parser não contém manifest válido.');
  const manifest = value.manifest as unknown as KnowledgeBatchManifest;
  if (manifest.schemaVersion !== 'knowledge-batch-v1') {
    throw new KnowledgeBatchClientError('UNSUPPORTED_MANIFEST_SCHEMA', 'A versão do manifest do parser não é suportada.');
  }
  if (manifest.documentId !== input.documentId || manifest.runId !== input.runId || manifest.contentHash !== input.contentHash || manifest.configurationHash !== input.configurationHash || manifest.pageStart !== input.pageStart || manifest.pageEnd !== input.pageEnd || typeof manifest.schemaVersion !== 'string' || typeof manifest.parserVersion !== 'string' || !Array.isArray(manifest.pages) || !Array.isArray(manifest.files)) {
    throw new KnowledgeBatchClientError('MANIFEST_IDENTITY_MISMATCH', 'A identidade ou o intervalo do manifest não corresponde à solicitação.');
  }
  const expectedCount = input.pageEnd - input.pageStart + 1;
  if (manifest.pages.length !== expectedCount) throw new KnowledgeBatchClientError('INCOMPLETE_PAGE_COVERAGE', 'O parser não contabilizou todas as páginas solicitadas.');
  const pages = new Map<number, KnowledgeBatchPage>();
  for (const page of manifest.pages) {
    if (!isRecord(page) || !Number.isInteger(page.pageNumber) || page.pageNumber < input.pageStart || page.pageNumber > input.pageEnd || pages.has(page.pageNumber)
      || !['CONVERTED', 'VERIFIED_BLANK', 'FAILED'].includes(page.status)
      || !Number.isInteger(page.characterCount) || !Number.isInteger(page.layoutItemCount) || !Number.isInteger(page.imageCount)
      || !Array.isArray(page.errors) || page.errors.some((entry) => typeof entry !== 'string')) {
      throw new KnowledgeBatchClientError('INVALID_PAGE_MANIFEST', 'O manifest contém dados de página inválidos.');
    }
    if (page.status === 'FAILED') throw new KnowledgeBatchClientError('PARTIAL_BATCH', 'O parser marcou uma ou mais páginas como falhas.');
    if (page.status === 'VERIFIED_BLANK' && (typeof page.blankEvidence !== 'string' || !page.blankEvidence.trim())) throw new KnowledgeBatchClientError('UNVERIFIED_BLANK_PAGE', 'Uma página vazia não possui evidência verificável.');
    pages.set(page.pageNumber, page);
  }
  for (let page = input.pageStart; page <= input.pageEnd; page++) if (!pages.has(page)) throw new KnowledgeBatchClientError('INCOMPLETE_PAGE_COVERAGE', 'Há lacunas no intervalo de páginas do manifest.');
  const artifactFiles: Array<{ path: string; sha256: string; content: Buffer }> = [];
  for (const file of manifest.files) {
    if (!isRecord(file) || typeof file.path !== 'string' || !/^[a-f0-9]{64}$/i.test(file.sha256) || typeof file.contentBase64 !== 'string') throw new KnowledgeBatchClientError('INVALID_ARTIFACT_ENTRY', 'O pacote contém um artefato inválido.');
    const decoded = Buffer.from(file.contentBase64, 'base64');
    if (decoded.toString('base64') !== file.contentBase64 || createHash('sha256').update(decoded).digest('hex') !== file.sha256.toLowerCase()) throw new KnowledgeBatchClientError('ARTIFACT_CHECKSUM_MISMATCH', 'O checksum de um artefato não confere.');
    artifactFiles.push({ path: file.path, sha256: file.sha256.toLowerCase(), content: decoded });
  }
  const artifact = Buffer.from(JSON.stringify(artifactFiles.map(({ path, sha256, content }) => ({ path, sha256, contentBase64: content.toString('base64') }))));
  const artifactChecksum = createHash('sha256').update(artifact).digest('hex');
  if (typeof value.artifactChecksum !== 'string' || value.artifactChecksum.toLowerCase() !== artifactChecksum) throw new KnowledgeBatchClientError('PACKAGE_CHECKSUM_MISMATCH', 'O checksum do pacote do parser não confere.');
  return { manifest, artifact, artifactChecksum, durationMs: value.durationMs };
}

async function readBounded(response: Response, maxBytes: number) {
  if (!response.body) throw new KnowledgeBatchClientError('EMPTY_RESPONSE', 'O parser retornou resposta vazia.');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new KnowledgeBatchClientError('RESPONSE_TOO_LARGE', 'O resultado do parser excede o limite permitido.'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
