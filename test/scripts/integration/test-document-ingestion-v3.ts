import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryParseRunStore } from '../../../backend/src/worker/services/document-parser/document-parse-orchestrator.service.js';
import type { DocumentParserAdapter } from '../../../backend/src/worker/services/document-parser/document-parser.adapter.js';
import type {
  LayoutDocument,
  ParseInput,
  ParseRunRecord,
  ParseStatus,
  ParseSubmission,
} from '../../../backend/src/worker/services/document-parser/document-parser.types.js';
import { DocumentIngestionV3Service } from '../../../backend/src/worker/services/document-parser/document-ingestion-v3.service.js';

function makeLayout(parseRunId: string): LayoutDocument {
  return {
    schemaVersion: 'layout-v1',
    documentId: 'document-1',
    parseRunId,
    parser: {
      name: 'DOCLING',
      version: '2.122.0',
      backend: 'pipeline',
      modelVersion: 'docling-layout-model-1',
      configurationHash: 'cfg-1',
    },
    pages: [
      {
        pageNumber: 1,
        width: 200,
        height: 100,
        elements: [
          {
            id: 'layout-element-1',
            pageNumber: 1,
            readingOrder: 0,
            category: 'TEXT',
            rawText: '1. Quanto e 2 + 2?',
            normalizedText: '1. Quanto e 2 + 2?',
            bbox: {
              x0: 0,
              y0: 0,
              x1: 100,
              y1: 50,
              coordinateSpace: 'NORMALIZED_1000',
            },
            assetIds: ['layout-asset-1'],
          },
        ],
      },
    ],
    assets: [
      {
        id: 'layout-asset-1',
        type: 'FIGURE',
        pageNumber: 1,
        storagePath: 'document-1/parse-run-1/layout-asset-1.png',
        mimeType: 'image/png',
        width: 200,
        height: 100,
        bbox: {
          x0: 0,
          y0: 0,
          x1: 100,
          y1: 50,
          coordinateSpace: 'NORMALIZED_1000',
        },
      },
    ],
    warnings: [],
  };
}

function makeAdapter(implementation: {
  parse?: (input: ParseInput) => Promise<ParseSubmission>;
  getStatus?: (parseRunId: string, statusUrl?: string) => Promise<ParseStatus>;
  getResult?: (parseRunId: string) => Promise<LayoutDocument>;
}): DocumentParserAdapter {
  return {
    name: 'DOCLING',
    parse: implementation.parse ?? (async () => ({
      parseRunId: 'parse-run-1',
      status: 'COMPLETED',
      statusUrl: 'http://parser.test/v1/parse/parse-run-1',
      resultUrl: 'http://parser.test/v1/parse/parse-run-1/result',
      idempotencyKey: 'document-1:hash-1:DOCLING:2.122.0:pipeline:docling-layout-model-1:cfg-1:layout-v1',
    })),
    getStatus: implementation.getStatus ?? (async (parseRunId) => ({
      parseRunId,
      status: 'COMPLETED',
      progress: 100,
    })),
    getResult: implementation.getResult ?? (async (parseRunId) => makeLayout(parseRunId)),
  };
}

test('V3 persiste o parse e o layout quando o parser conclui', async () => {
  const parseCalls: ParseInput[] = [];
  const layoutPersistCalls: Array<{ documentId: string; parseRunId: string; layout: LayoutDocument }> = [];
  const parseRunStore = new MemoryParseRunStore();

  const service = new DocumentIngestionV3Service({
    parser: makeAdapter({
      parse: async (input) => {
        parseCalls.push(input);
        return {
          parseRunId: 'parse-run-1',
          status: 'COMPLETED',
          statusUrl: 'http://parser.test/v1/parse/parse-run-1',
          resultUrl: 'http://parser.test/v1/parse/parse-run-1/result',
      idempotencyKey: 'document-1:hash-1:DOCLING:2.122.0:pipeline:docling-layout-model-1:cfg-1:layout-v1',
        };
      },
      getResult: async (parseRunId) => makeLayout(parseRunId),
    }),
    parseRunStore,
    featureEnabled: true,
    buildFileUrl: async () => 'https://signed.test/document-1.pdf',
    persistLayoutDocument: async (input) => {
      layoutPersistCalls.push(input);
      return { parseRunId: input.parseRunId, elementCount: input.layout.pages[0]?.elements.length ?? 0, assetCount: input.layout.assets.length };
    },
    createDocumentParseRun: async () => undefined,
    updateDocumentParseRun: async () => undefined,
  });

  const result = await service.processDocument({
    documentId: 'document-1',
    storagePath: 'documents/document-1.pdf',
    originalName: 'document-1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12345,
    contentHash: 'hash-1',
    parserVersion: '2.122.0',
    modelVersion: 'docling-layout-model-1',
    configurationHash: 'cfg-1',
    backend: 'pipeline',
  });

  assert.equal(parseCalls.length, 1);
  assert.equal(parseCalls[0]?.fileUrl, 'https://signed.test/document-1.pdf');
  assert.equal(parseCalls[0]?.documentId, 'document-1');
  assert.equal(parseCalls[0]?.parser, 'DOCLING');
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.parseRunId, 'parse-run-1');
  assert.equal(result.parserName, 'DOCLING');
  assert.equal(layoutPersistCalls.length, 1);
  assert.equal(layoutPersistCalls[0]?.parseRunId, 'parse-run-1');
  assert.equal(layoutPersistCalls[0]?.layout.pages[0]?.elements[0]?.category, 'TEXT');
});

test('V3 usa o layout inline do Docling sem chamar GET /result', async () => {
  const parseCalls: ParseInput[] = [];
  const layoutPersistCalls: Array<{ documentId: string; parseRunId: string; layout: LayoutDocument }> = [];
  const getResultCalls: string[] = [];
  const parseRunStore = new MemoryParseRunStore();

  const service = new DocumentIngestionV3Service({
    parser: makeAdapter({
      parse: async (input) => {
        parseCalls.push(input);
        return {
          parseRunId: 'parse-run-inline',
          status: 'COMPLETED',
      idempotencyKey: 'document-1:hash-1:DOCLING:2.122.0:pipeline:docling-layout-model-1:cfg-1:layout-v1',
          result: makeLayout('parse-run-inline'),
        } as ParseSubmission & { result: LayoutDocument };
      },
      getResult: async (parseRunId) => {
        getResultCalls.push(parseRunId);
        throw new Error('nao deveria buscar resultado em modo inline');
      },
    }),
    parseRunStore,
    featureEnabled: true,
    buildFileUrl: async () => 'https://signed.test/document-1.pdf',
    persistLayoutDocument: async (input) => {
      layoutPersistCalls.push(input);
      return { parseRunId: input.parseRunId, elementCount: input.layout.pages[0]?.elements.length ?? 0, assetCount: input.layout.assets.length };
    },
    createDocumentParseRun: async () => undefined,
    updateDocumentParseRun: async () => undefined,
  });

  const result = await service.processDocument({
    documentId: 'document-1',
    storagePath: 'documents/document-1.pdf',
    originalName: 'document-1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12345,
    contentHash: 'hash-1',
    parserVersion: '2.122.0',
    modelVersion: 'docling-layout-model-1',
    configurationHash: 'cfg-1',
    backend: 'pipeline',
  });

  assert.equal(parseCalls.length, 1);
  assert.equal(parseCalls[0]?.fileUrl, 'https://signed.test/document-1.pdf');
  assert.equal(getResultCalls.length, 0);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.parseRunId, 'parse-run-inline');
  assert.equal(result.layoutPersisted, true);
  assert.equal(layoutPersistCalls.length, 1);
  assert.equal(layoutPersistCalls[0]?.layout.pages[0]?.elements[0]?.category, 'TEXT');
});

test('V3 fica em fallback quando a feature flag esta desativada', async () => {
  let parseCalls = 0;
  const service = new DocumentIngestionV3Service({
    parser: makeAdapter({
      parse: async () => {
        parseCalls += 1;
        return {
          parseRunId: 'parse-run-disabled',
          status: 'COMPLETED',
          statusUrl: 'http://parser.test/v1/parse/parse-run-disabled',
          resultUrl: 'http://parser.test/v1/parse/parse-run-disabled/result',
          idempotencyKey: 'disabled',
        };
      },
    }),
    parseRunStore: new MemoryParseRunStore(),
    featureEnabled: false,
    buildFileUrl: async () => 'https://signed.test/document-1.pdf',
    persistLayoutDocument: async () => {
      throw new Error('nao deveria persistir');
    },
    createDocumentParseRun: async () => undefined,
    updateDocumentParseRun: async () => undefined,
  });

  const result = await service.processDocument({
    documentId: 'document-1',
    storagePath: 'documents/document-1.pdf',
    originalName: 'document-1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12345,
    contentHash: 'hash-1',
    parserVersion: '2.122.0',
    modelVersion: 'docling-layout-model-1',
    configurationHash: 'cfg-1',
    backend: 'pipeline',
  });

  assert.equal(parseCalls, 0);
  assert.equal(result.status, 'FALLBACK_REQUIRED');
});
