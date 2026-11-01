import { createHash, randomUUID } from 'node:crypto';

export type DocChunkerChunk = {
  index: number;
  text: string;
  raw_text: string;
  headings: string[];
  pages: number[];
  type: 'text' | 'table' | 'formula' | 'mixed';
  tokens: number;
  provenance: Array<Record<string, unknown>>;
};

export type DocChunkerResponse = {
  schema_version: 'doc-chunker/v1';
  request_id: string;
  status: 'completed';
  doc_hash: string;
  engine: 'docling';
  parser_version: string;
  tokenizer_id: string;
  chunker_version: string;
  page_count: number;
  chunks: DocChunkerChunk[];
};

export type DocChunkerInput = {
  documentId: string;
  expectedSha256: string;
  fileName: string;
  mimeType: string;
  fileBytes: Uint8Array;
  requestId?: string;
};

export class DocChunkerClientError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode?: number) {
    super(message);
    this.name = 'DocChunkerClientError';
  }
}

export type DocChunkerClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  requestIdFactory?: () => string;
  maxResponseBytes?: number;
  logger?: (event: string, payload: Record<string, unknown>) => void;
};

export class DocChunkerClient {
  private readonly fetchImpl: typeof fetch;
  private readonly requestIdFactory: () => string;

  constructor(private readonly options: DocChunkerClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestIdFactory = options.requestIdFactory ?? randomUUID;
  }

  async chunk(input: DocChunkerInput): Promise<DocChunkerResponse> {
    const actualHash = createHash('sha256').update(input.fileBytes).digest('hex');
    if (actualHash !== input.expectedSha256) {
      throw new DocChunkerClientError('DOC_CHUNKER_HASH_MISMATCH', 'O arquivo mudou antes do envio ao Doc-chunker.');
    }

    const requestId = input.requestId ?? this.requestIdFactory();
    const startedAt = performance.now();
    this.log('doc_chunker_client.request_started', {
      request_id: requestId, document_id: input.documentId, doc_hash: actualHash,
      request_bytes: input.fileBytes.byteLength,
    });
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(input.fileBytes)], { type: input.mimeType }), input.fileName);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs ?? 600_000);
    const timeoutError = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new DocChunkerClientError('DOC_CHUNKER_TIMEOUT', 'Tempo limite do Doc-chunker excedido.')), { once: true });
    });
    let response: Response;
    try {
      response = await Promise.race([this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, '')}/chunk`, {
        method: 'POST',
        headers: {
          'X-Document-Id': input.documentId,
          'X-Request-Id': requestId,
          'X-Expected-SHA256': input.expectedSha256,
        },
        body: form,
        signal: controller.signal,
      }), timeoutError]);
      this.log('doc_chunker_client.headers_received', {
        request_id: requestId, document_id: input.documentId, status_code: response.status,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      clearTimeout(timeout);
      this.options.logger?.('doc_chunker_client.request_failed', {
        request_id: requestId, document_id: input.documentId,
        error_code: error instanceof DocChunkerClientError ? error.code : 'DOC_CHUNKER_NETWORK_ERROR',
        duration_ms: Math.round(performance.now() - startedAt),
      });
      if (error instanceof DocChunkerClientError) throw error;
      if (controller.signal.aborted) {
        throw new DocChunkerClientError('DOC_CHUNKER_TIMEOUT', 'Tempo limite do Doc-chunker excedido.');
      }
      throw new DocChunkerClientError('DOC_CHUNKER_NETWORK_ERROR', 'Não foi possível conectar ao Doc-chunker.');
    }

    let bodyText: string;
    try {
      bodyText = await Promise.race([response.text(), timeoutError]);
      this.log('doc_chunker_client.body_received', {
        request_id: requestId, document_id: input.documentId,
        response_bytes: Buffer.byteLength(bodyText), duration_ms: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      clearTimeout(timeout);
      this.options.logger?.('doc_chunker_client.request_failed', {
        request_id: requestId, document_id: input.documentId,
        error_code: error instanceof DocChunkerClientError ? error.code : 'DOC_CHUNKER_BODY_INTERRUPTED',
        duration_ms: Math.round(performance.now() - startedAt),
      });
      if (error instanceof DocChunkerClientError) throw error;
      throw new DocChunkerClientError('DOC_CHUNKER_BODY_INTERRUPTED', 'A resposta do Doc-chunker foi interrompida.', response.status);
    }
    clearTimeout(timeout);
    if (Buffer.byteLength(bodyText) > (this.options.maxResponseBytes ?? 20 * 1024 * 1024)) {
      this.logFailure(input, requestId, 'DOC_CHUNKER_RESPONSE_TOO_LARGE', startedAt, response.status);
      throw new DocChunkerClientError('DOC_CHUNKER_RESPONSE_TOO_LARGE', 'A resposta do Doc-chunker excede o limite permitido.', response.status);
    }

    let value: unknown;
    try {
      value = JSON.parse(bodyText);
    } catch {
      this.logFailure(input, requestId, 'DOC_CHUNKER_INVALID_JSON', startedAt, response.status);
      throw new DocChunkerClientError('DOC_CHUNKER_INVALID_JSON', 'O Doc-chunker retornou JSON inválido.', response.status);
    }
    if (!response.ok) {
      const code = isRecord(value) && isRecord(value.error) && typeof value.error.code === 'string'
        ? value.error.code
        : 'DOC_CHUNKER_HTTP_ERROR';
      this.logFailure(input, requestId, code, startedAt, response.status);
      throw new DocChunkerClientError(code, 'O Doc-chunker recusou a solicitação.', response.status);
    }
    if (response.headers.get('X-Request-Id') !== requestId || !isRecord(value) || value.request_id !== requestId) {
      this.logFailure(input, requestId, 'DOC_CHUNKER_REQUEST_ID_MISMATCH', startedAt, response.status);
      throw new DocChunkerClientError('DOC_CHUNKER_REQUEST_ID_MISMATCH', 'A correlação da resposta do Doc-chunker não corresponde à solicitação.', response.status);
    }
    if (!isValidResponse(value)) {
      this.logFailure(input, requestId, 'DOC_CHUNKER_INVALID_CONTRACT', startedAt, response.status);
      throw new DocChunkerClientError('DOC_CHUNKER_INVALID_CONTRACT', 'A resposta do Doc-chunker não corresponde ao contrato esperado.', response.status);
    }
    if (value.doc_hash !== input.expectedSha256) {
      this.logFailure(input, requestId, 'DOC_CHUNKER_HASH_MISMATCH', startedAt, response.status);
      throw new DocChunkerClientError('DOC_CHUNKER_HASH_MISMATCH', 'O hash da resposta do Doc-chunker diverge do arquivo enviado.', response.status);
    }
    this.log('doc_chunker_client.request_completed', {
      request_id: requestId, document_id: input.documentId, doc_hash: value.doc_hash,
      status_code: response.status, chunk_count: value.chunks.length,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    return value;
  }

  private logFailure(input: DocChunkerInput, requestId: string, errorCode: string, startedAt: number, statusCode?: number) {
    this.log('doc_chunker_client.request_failed', {
      request_id: requestId, document_id: input.documentId,
      error_code: errorCode, status_code: statusCode ?? null,
      duration_ms: Math.round(performance.now() - startedAt),
    });
  }

  private log(event: string, payload: Record<string, unknown>) {
    this.options.logger?.(event, { timestamp: new Date().toISOString(), service: 'worker', ...payload });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidResponse(value: Record<string, unknown>): value is DocChunkerResponse {
  return value.schema_version === 'doc-chunker/v1'
    && value.status === 'completed'
    && typeof value.doc_hash === 'string'
    && value.engine === 'docling'
    && typeof value.parser_version === 'string'
    && typeof value.tokenizer_id === 'string'
    && typeof value.chunker_version === 'string'
    && Number.isInteger(value.page_count)
    && (value.page_count as number) >= 0
    && Array.isArray(value.chunks)
    && value.chunks.length > 0
    && value.chunks.every((chunk, index) => isRecord(chunk)
      && chunk.index === index
      && typeof chunk.text === 'string' && chunk.text.trim().length > 0
      && typeof chunk.raw_text === 'string' && chunk.raw_text.trim().length > 0
      && Array.isArray(chunk.headings) && chunk.headings.every((heading) => typeof heading === 'string')
      && Array.isArray(chunk.pages) && chunk.pages.every((page) => Number.isInteger(page) && page >= 1 && page <= (value.page_count as number))
      && ['text', 'table', 'formula', 'mixed'].includes(String(chunk.type))
      && Number.isInteger(chunk.tokens) && (chunk.tokens as number) > 0
      && Array.isArray(chunk.provenance));
}
