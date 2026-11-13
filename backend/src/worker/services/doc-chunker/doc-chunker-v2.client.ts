import { createHash, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { Agent } from 'undici';

const DEFAULT_MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const MAX_ENTRIES = 501;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export type DocChunkerV2Asset = {
  assetKind: 'FIGURE' | 'PAGE';
  assetKey: string;
  sourceItemRef: string;
  readingOrder: number;
  pageNumber: number;
  bbox: number[] | null;
  coordOrigin: string | null;
  caption: string | null;
  mimeType: 'image/png';
  width: number;
  height: number;
  sha256: string;
  content: Buffer;
};

export type DocChunkerV2Response = {
  docHash: string;
  engine: 'docling'; parserVersion: string; tokenizerId: string; chunkerVersion: string; pageCount: number;
  chunks: DocChunkerV2Chunk[];
  assets: DocChunkerV2Asset[];
  warnings: Array<Record<string, unknown>>;
};

export type DocChunkerV2Chunk = {
  index: number; text: string; raw_text: string; headings: string[]; pages: number[];
  type: 'text' | 'table' | 'formula' | 'mixed'; tokens: number; provenance: Array<Record<string, unknown>>;
  formulaEvidence?: Array<{ pageNumber: number; itemRef: string; bbox: number[] | null; originalText: string | null; enrichedText: string }>;
  inlineFormulaEvidence?: Array<{ pageNumber: number; itemRef: string; bbox: number[] | null; baseText: string; raisedText: string; normalizedText: string; sourceText: string; evidenceSource: 'PDF_CHARACTER_GEOMETRY'; heightRatio: number; raiseRatio: number }>;
};

export class DocChunkerV2ClientError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode?: number, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DocChunkerV2ClientError';
  }
}

export type DocChunkerV2ClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Defaults to 600s for backwards compatibility; null disables the client-side deadline. */
  requestTimeoutMs?: number | null;
  requestIdFactory?: () => string;
  maxResponseBytes?: number;
  logger?: (event: string, fields: Record<string, unknown>) => void;
};

export class DocChunkerV2Client {
  private readonly fetchImpl: typeof fetch;
  private readonly requestIdFactory: () => string;

  constructor(private readonly options: DocChunkerV2ClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestIdFactory = options.requestIdFactory ?? randomUUID;
  }

  async chunkWithAssets(input: {
    documentId: string; expectedSha256: string; fileName: string; mimeType: string;
    fileBytes: Uint8Array; requestId?: string; signal?: AbortSignal;
  }): Promise<DocChunkerV2Response> {
    const actualHash = createHash('sha256').update(input.fileBytes).digest('hex');
    if (actualHash !== input.expectedSha256) {
      throw new DocChunkerV2ClientError('DOC_CHUNKER_HASH_MISMATCH', 'O arquivo mudou antes do envio ao Doc-chunker.');
    }
    const requestId = input.requestId ?? this.requestIdFactory();
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(input.fileBytes)], { type: input.mimeType }), input.fileName);
    const controller = new AbortController();
    const timeoutMs = this.options.requestTimeoutMs === undefined ? 600_000 : this.options.requestTimeoutMs;
    let timedOut = false;
    const timeout = timeoutMs === null ? undefined : setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
    const startedAt = performance.now();
    const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 0 });
    let requestCompleted = false;
    this.log('doc_chunker_v2.request_started', {
      request_id: requestId, document_id: input.documentId,
      doc_hash: actualHash, request_bytes: input.fileBytes.byteLength,
    });
    try {
      const requestInit: RequestInit & { dispatcher: Agent } = {
        method: 'POST',
        headers: {
          'X-Document-Id': input.documentId,
          'X-Request-Id': requestId,
          'X-Expected-SHA256': input.expectedSha256,
        },
        body: form,
        signal,
        dispatcher,
      };
      const response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, '')}/chunk/v2`, requestInit);
      if (response.headers.get('X-Request-Id') !== requestId) {
        throw new DocChunkerV2ClientError('DOC_CHUNKER_REQUEST_ID_MISMATCH', 'A correlação da resposta do Doc-chunker diverge da solicitação.', response.status);
      }
      if (!response.ok) {
        throw new DocChunkerV2ClientError('DOC_CHUNKER_HTTP_ERROR', 'O Doc-chunker recusou a solicitação.', response.status);
      }
      const contentType = response.headers.get('Content-Type');
      if (!contentType || contentType.split(';')[0]?.trim() !== 'application/vnd.doc-chunker.v2+zip') {
        throw new DocChunkerV2ClientError('DOC_CHUNKER_INVALID_CONTENT_TYPE', 'O Doc-chunker retornou um tipo de conteúdo inesperado.', response.status);
      }
      const packageBytes = await readBounded(response, this.options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);
      let parsed: DocChunkerV2Response;
      try {
        parsed = parsePackage(packageBytes, actualHash, requestId, this.options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);
      } catch (error) {
        if (error instanceof DocChunkerV2ClientError) throw error;
        throw new DocChunkerV2ClientError('DOC_CHUNKER_INVALID_PACKAGE', 'Não foi possível validar o pacote visual do Doc-chunker.', undefined, error);
      }
      this.log('doc_chunker_v2.request_completed', {
        request_id: requestId, document_id: input.documentId, doc_hash: parsed.docHash,
        chunk_count: parsed.chunks.length, asset_count: parsed.assets.length,
        warning_count: parsed.warnings.length, response_bytes: packageBytes.length,
        duration_ms: Math.round(performance.now() - startedAt),
      });
      requestCompleted = true;
      return parsed;
    } catch (error) {
      const normalized = timedOut
        ? new DocChunkerV2ClientError('DOC_CHUNKER_TIMEOUT', 'Tempo limite do Doc-chunker excedido.', undefined, error)
        : input.signal?.aborted
          ? new DocChunkerV2ClientError('DOC_CHUNKER_ABORTED', 'A solicitação ao Doc-chunker foi cancelada.', undefined, error)
        : error instanceof DocChunkerV2ClientError ? error
          : new DocChunkerV2ClientError('DOC_CHUNKER_NETWORK_ERROR', 'Falha de comunicação com o Doc-chunker.', undefined, error);
      this.log('doc_chunker_v2.request_failed', {
        request_id: requestId, document_id: input.documentId, error_code: normalized.code,
        status_code: normalized.statusCode ?? null, duration_ms: Math.round(performance.now() - startedAt),
      });
      throw normalized;
    } finally {
      if (timeout) clearTimeout(timeout);
      try {
        if (requestCompleted) await dispatcher.close();
        else await dispatcher.destroy();
      } catch (error) {
        this.log('doc_chunker_v2.dispatcher_cleanup_failed', {
          request_id: requestId, document_id: input.documentId,
          error_code: safeErrorCode(error),
        });
      }
    }
  }

  private log(event: string, fields: Record<string, unknown>) {
    this.options.logger?.(event, { timestamp: new Date().toISOString(), service: 'worker', ...fields });
  }
}

async function readBounded(response: Response, maxBytes: number): Promise<Buffer> {
  const length = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > maxBytes) {
    throw new DocChunkerV2ClientError('DOC_CHUNKER_RESPONSE_TOO_LARGE', 'O pacote visual excede o limite permitido.', response.status);
  }
  if (!response.body) throw new DocChunkerV2ClientError('DOC_CHUNKER_INVALID_PACKAGE', 'O Doc-chunker retornou um corpo vazio.', response.status);
  const reader = response.body.getReader();
  const parts: Buffer[] = [];
  let size = 0;
  while (true) {
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await reader.read();
    } catch (error) {
      throw new DocChunkerV2ClientError('DOC_CHUNKER_RESPONSE_READ_ERROR', 'A leitura da resposta do Doc-chunker foi interrompida.', response.status, error);
    }
    const { done, value } = result;
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new DocChunkerV2ClientError('DOC_CHUNKER_RESPONSE_TOO_LARGE', 'O pacote visual excede o limite permitido.', response.status);
    }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts, size);
}

function parsePackage(bytes: Buffer, expectedHash: string, expectedRequestId: string, maxExpandedBytes: number): DocChunkerV2Response {
  const entries = readZip(bytes, maxExpandedBytes);
  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes || manifestBytes.length > MAX_MANIFEST_BYTES) invalidPackage();
  let manifest: unknown;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); } catch { invalidPackage(); }
  if (!isRecord(manifest) || manifest.schema_version !== 'doc-chunker/v2'
      || manifest.engine !== 'docling' || manifest.doc_hash !== expectedHash
      || typeof manifest.parser_version !== 'string' || typeof manifest.tokenizer_id !== 'string'
      || typeof manifest.chunker_version !== 'string' || !Number.isInteger(manifest.page_count)
      || (manifest.page_count as number) < 0
      || manifest.request_id !== expectedRequestId || !Array.isArray(manifest.chunks)
      || manifest.chunks.length === 0 || !manifest.chunks.every((chunk, index) => isValidChunk(chunk, index))
      || !Array.isArray(manifest.visual_assets)
      || !Array.isArray(manifest.warnings)) {
    if (isRecord(manifest) && manifest.doc_hash !== expectedHash) {
      throw new DocChunkerV2ClientError('DOC_CHUNKER_HASH_MISMATCH', 'O hash do documento no manifesto diverge do arquivo enviado.');
    }
    invalidPackage();
  }

  const assets: DocChunkerV2Asset[] = [];
  const expectedPaths = new Set(['manifest.json']);
  for (const raw of manifest.visual_assets) {
    if (!isRecord(raw) || !['FIGURE', 'PAGE'].includes(String(raw.asset_kind))
        || typeof raw.asset_key !== 'string' || !/^[a-f0-9]{32}$/.test(raw.asset_key)
        || typeof raw.source_item_ref !== 'string' || !Number.isInteger(raw.reading_order)
        || (raw.reading_order as number) < 0 || !Number.isInteger(raw.page_number)
        || (raw.page_number as number) < 1 || (raw.bbox !== null && (!Array.isArray(raw.bbox)
          || raw.bbox.length !== 4 || !raw.bbox.every((part) => typeof part === 'number' && Number.isFinite(part))))
        || typeof raw.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(raw.sha256)
        || raw.mime_type !== 'image/png' || !Number.isInteger(raw.width) || !Number.isInteger(raw.height)
        || (raw.width as number) < 1 || (raw.width as number) > 4096
        || (raw.height as number) < 1 || (raw.height as number) > 4096
        || (raw.caption !== null && typeof raw.caption !== 'string')) invalidPackage();
    const path = `assets/${raw.asset_key}.png`;
    const content = entries.get(path);
    if (!content || content.length > MAX_ASSET_BYTES) invalidPackage();
    expectedPaths.add(path);
    if (sha256(content) !== raw.sha256) {
      throw new DocChunkerV2ClientError('DOC_CHUNKER_ASSET_HASH_MISMATCH', 'O hash de uma imagem diverge do manifesto.');
    }
    if (!isPng(content) || content.readUInt32BE(16) !== raw.width || content.readUInt32BE(20) !== raw.height) invalidPackage();
    assets.push({
      assetKind: raw.asset_kind as 'FIGURE' | 'PAGE',
      assetKey: raw.asset_key, sourceItemRef: raw.source_item_ref,
      readingOrder: raw.reading_order as number,
      pageNumber: raw.page_number as number, bbox: raw.bbox as number[] | null,
      coordOrigin: typeof raw.coord_origin === 'string' ? raw.coord_origin : null,
      caption: typeof raw.caption === 'string' ? raw.caption : null,
      mimeType: 'image/png', width: raw.width as number, height: raw.height as number,
      sha256: raw.sha256, content,
    });
  }
  if (expectedPaths.size !== entries.size || [...entries.keys()].some((path) => !expectedPaths.has(path))) invalidPackage();
  if ((manifest.chunks as DocChunkerV2Chunk[]).some((chunk) => chunk.pages.some((page) => page > (manifest.page_count as number)))) invalidPackage();
  return { docHash: expectedHash, engine: 'docling', parserVersion: manifest.parser_version as string,
    tokenizerId: manifest.tokenizer_id as string, chunkerVersion: manifest.chunker_version as string,
    pageCount: manifest.page_count as number, chunks: manifest.chunks as DocChunkerV2Chunk[],
    assets, warnings: manifest.warnings.filter(isRecord) };
}

function readZip(bytes: Buffer, maxExpandedBytes: number): Map<string, Buffer> {
  if (bytes.length < 22) invalidPackage();
  const eocdMin = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= eocdMin; i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0 || bytes.readUInt16LE(eocd + 4) !== 0 || bytes.readUInt16LE(eocd + 6) !== 0) invalidPackage();
  const count = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (count < 1 || count > MAX_ENTRIES || centralOffset + centralSize > eocd) invalidPackage();
  const entries = new Map<string, Buffer>();
  let cursor = centralOffset;
  let totalExpanded = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) invalidPackage();
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const crc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const expandedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length || (flags & 1) !== 0 || (method !== 0 && method !== 8)) invalidPackage();
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (name.includes('\\') || name.startsWith('/') || name.includes('\0')
        || name.split('/').some((part) => part === '..' || part === '.')) invalidPackage();
    if (entries.has(name) || localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) invalidPackage();
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > centralOffset) invalidPackage();
    if (expandedSize > maxExpandedBytes - totalExpanded) {
      throw new DocChunkerV2ClientError('DOC_CHUNKER_RESPONSE_TOO_LARGE', 'O pacote expandido excede o limite permitido.');
    }
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let expanded: Buffer;
    try {
      expanded = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: Math.min(expandedSize, MAX_ASSET_BYTES * MAX_ENTRIES) });
    } catch { invalidPackage(); }
    if (expanded.length !== expandedSize || crc32(expanded) !== crc) invalidPackage();
    totalExpanded += expanded.length;
    if (totalExpanded > maxExpandedBytes) {
      throw new DocChunkerV2ClientError('DOC_CHUNKER_RESPONSE_TOO_LARGE', 'O pacote expandido excede o limite permitido.');
    }
    entries.set(name, expanded);
    cursor = end;
  }
  if (cursor !== centralOffset + centralSize) invalidPackage();
  return entries;
}

function isPng(data: Buffer): boolean {
  return data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && data.toString('ascii', 12, 16) === 'IHDR';
}

function isValidChunk(value: unknown, index: number): value is DocChunkerV2Chunk {
  if (!isRecord(value) || value.index !== index || typeof value.text !== 'string' || !value.text.trim()
      || typeof value.raw_text !== 'string' || !value.raw_text.trim()
      || !Array.isArray(value.headings) || !value.headings.every((heading) => typeof heading === 'string')
      || !Array.isArray(value.pages) || !value.pages.every((page) => Number.isInteger(page) && page >= 1)
      || !['text', 'table', 'formula', 'mixed'].includes(String(value.type))
      || !Number.isInteger(value.tokens) || (value.tokens as number) < 1 || !Array.isArray(value.provenance)
      || !value.provenance.every(isRecord)) return false;
  if (value.formulaEvidence !== undefined && (!Array.isArray(value.formulaEvidence)
      || !value.formulaEvidence.every((entry) => isRecord(entry)
        && Number.isInteger(entry.pageNumber) && (entry.pageNumber as number) >= 1
        && typeof entry.itemRef === 'string'
        && (entry.bbox === null || (Array.isArray(entry.bbox) && entry.bbox.length === 4
          && entry.bbox.every((part) => typeof part === 'number' && Number.isFinite(part))))
        && (entry.originalText === null || typeof entry.originalText === 'string')
        && typeof entry.enrichedText === 'string'))) return false;
  if (value.inlineFormulaEvidence !== undefined && (!Array.isArray(value.inlineFormulaEvidence)
      || !value.inlineFormulaEvidence.every((entry) => isRecord(entry)
        && Number.isInteger(entry.pageNumber) && (entry.pageNumber as number) >= 1
        && typeof entry.itemRef === 'string' && entry.itemRef.length > 0
        && (entry.bbox === null || (Array.isArray(entry.bbox) && entry.bbox.length === 4
          && entry.bbox.every((part) => typeof part === 'number' && Number.isFinite(part))))
        && typeof entry.baseText === 'string' && entry.baseText.length > 0
        && typeof entry.raisedText === 'string' && entry.raisedText.length > 0
        && typeof entry.normalizedText === 'string' && entry.normalizedText.length > 0
        && typeof entry.sourceText === 'string' && entry.sourceText.length > 0
        && entry.evidenceSource === 'PDF_CHARACTER_GEOMETRY'
        && typeof entry.heightRatio === 'number' && Number.isFinite(entry.heightRatio) && entry.heightRatio > 0 && entry.heightRatio < 1
        && typeof entry.raiseRatio === 'number' && Number.isFinite(entry.raiseRatio) && entry.raiseRatio > 0))) return false;
  return true;
}

function sha256(data: Buffer): string { return createHash('sha256').update(data).digest('hex'); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function invalidPackage(): never { throw new DocChunkerV2ClientError('DOC_CHUNKER_INVALID_PACKAGE', 'O pacote ZIP do Doc-chunker é inválido ou não corresponde ao contrato v2.'); }
function safeErrorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)) return error.code;
  if (error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)) return error.name;
  return 'UNKNOWN_ERROR';
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
