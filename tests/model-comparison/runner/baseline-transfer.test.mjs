import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  BASELINE_DOCUMENT_IDS, INCLUDED_TABLES, EXCLUDED_GENERATED_TABLES,
  cloneSnapshotWithNewIds, expectedTargetDatabaseName, sha256,
  validateLocalTargetUrl, validateSnapshot, rowsInParentOrder, validateRunId,
  importBaselineGraph,
} from './baseline-transfer.mjs';

const uuid = () => randomUUID();

function makeSnapshot() {
  const teacher = uuid(), user = uuid(), monitor = uuid(), subject = uuid(), topic = uuid();
  const docs = BASELINE_DOCUMENT_IDS.map((id, index) => ({ id, teacher_id: teacher, monitor_id: monitor, subject_id: subject, topic_id: topic, original_name: ['Quimica-3.pdf','Estequiometria.pdf','pH e pOH.pdf'][index], storage_path: `baseline/${index}.pdf` }));
  const visualIds = Array.from({ length: 31 }, () => uuid());
  const parseRunId = uuid(), textId = uuid();
  const pdfObjects = docs.map((doc) => {
    const content = Buffer.from(`pdf-${doc.original_name}`);
    return { documentId: doc.id, fileName: doc.original_name, sourcePath: doc.storage_path, sha256: sha256(content), byteLength: content.length, bytesBase64: content.toString('base64') };
  });
  const visualBytesById = new Map(visualIds.map((id, index) => [id, Buffer.from(`visual-${index}`)]));
  const tables = Object.fromEntries(INCLUDED_TABLES.map((table) => [table, []]));
  tables.teachers = [{ id: teacher, user_id: user, current_payment_account_id: uuid(), username: 'baseline-user', full_name: 'Private Teacher', email: 'private@example.com', phone: '+5511999999999', page_slug: 'private-teacher', bio: 'private bio' }];
  tables.monitors = [{ id: monitor, teacher_id: teacher, name: 'private monitor', description: 'private description' }];
  tables.monitor_subjects = [{ id: subject, monitor_id: monitor, name: 'Química' }];
  tables.monitor_topics = [{ id: topic, subject_id: subject, name: 'Equilíbrio', ai_definition_sources: [{ source: 'fixture', pages: [1, 2] }] }];
  tables.monitor_documents = docs;
  tables.document_texts = [{ id: textId, document_id: docs[0].id, raw_content: 'body', extraction_version: 'v1' }];
  tables.document_parse_runs = [{ id: parseRunId, document_id: docs[0].id, idempotency_key: 'baseline:parse', raw_output_path: 'old/path', artifact_manifest_path: 'old/manifest' }];
  tables.document_pages = [{ id: uuid(), document_text_id: textId, page_number: 1, raw_content: 'body' }];
  const layoutElementId = uuid();
  tables.document_layout_elements = [{ id: layoutElementId, document_id: docs[0].id, parse_run_id: parseRunId, parent_element_id: null, asset_ids: visualIds }];
  const questionBlocks = Array.from({ length: 10 }, (_, index) => ({ id: uuid(), document_id: docs[0].id, document_text_id: textId, parent_block_id: null, question_number: String(index + 1).padStart(2, '0'), page_start: index + 1, page_end: index + 1, raw_content: `Question source content ${index + 1}`, content_hash: sha256(`Question source content ${index + 1}`) }));
  tables.document_blocks = questionBlocks;
  tables.document_block_elements = [{ block_id: questionBlocks[0].id, layout_element_id: tables.document_layout_elements[0].id }];
  tables.document_visual_assets = visualIds.map((id, index) => ({ id, document_id: docs[0].id, parse_run_id: parseRunId, layout_element_id: layoutElementId, source_key: `baseline-asset-${index}`, storage_path: `old/asset-${index}.png`, checksum: sha256(visualBytesById.get(id)), mime_type: 'image/png' }));
  const chunkRows = Array.from({ length: 22 }, (_, index) => {
    const id = uuid();
    const content = `equilibrio químico ${index + 1}`;
    const embedding = `[0.${index + 1},0.25,-0.5]`;
    return { id, document_id: docs[0].id, teacher_id: teacher, monitor_id: monitor, subject_id: subject, block_id: questionBlocks[index % 10].id, content, content_hash: sha256(content), embedding, embedding_sha256: sha256(embedding), embedding_model: 'qwen/qwen3-embedding-8b', embedding_version: 'test-v1', chunker_version: null, source_key: `source:${docs[0].id}:${index}`, provenance: { documentId: docs[0].id } };
  });
  tables.document_chunks = chunkRows;
  tables.document_chunk_visual_assets = [{ chunk_id: chunkRows[0].id, visual_asset_id: visualIds[0], role: 'INLINE' }];
  tables.monitor_document_topics = [{ document_id: docs[0].id, topic_id: topic }];
  tables.document_evidence_relations = [{ document_id: docs[0].id, source_entity_type: 'VISUAL_ASSET', source_entity_id: visualIds[0], target_entity_type: 'DOCUMENT_BLOCK', target_entity_id: questionBlocks[0].id }];
  return {
    format: 'model-comparison-baseline-graph-v1', testName: 'e2e_so_qwen235b', round: 1,
    tables, pdfObjects,
    visualObjects: visualIds.map((id, index) => ({ visualAssetId: id, documentId: docs[0].id, fileName: `asset-${index}.png`, sourcePath: `old/asset-${index}.png`, mimeType: 'image/png', sha256: sha256(visualBytesById.get(id)), byteLength: visualBytesById.get(id).length, bytesBase64: visualBytesById.get(id).toString('base64') })),
    omittedGeneratedTables: EXCLUDED_GENERATED_TABLES,
    sourceProof: {
      chunkProofs: chunkRows.map((chunk) => ({ chunkId: chunk.id, documentId: docs[0].id, contentHash: chunk.content_hash, contentSha256: sha256(chunk.content), embeddingSha256: chunk.embedding_sha256, embeddingModel: chunk.embedding_model, embeddingVersionValue: chunk.embedding_version, embeddingVersion: chunk.embedding_version, chunkerVersionValue: null, chunkerVersion: 'NAO_VERIFICADO', equivalenceStatus: 'NAO_VERIFICADO' })),
      visualProofs: visualIds.map((id) => ({ visualAssetId: id, documentId: docs[0].id, sha256: sha256(visualBytesById.get(id)), byteLength: visualBytesById.get(id).length })),
      questionEvidence: questionBlocks.map((block, index) => ({ sourceTable: 'document_blocks', questionNumber: index + 1, blockId: block.id, documentId: docs[0].id, pageStart: block.page_start, pageEnd: block.page_end, contentSha256: block.content_hash })),
    },
  };
}

function makeSafeSnapshot() {
  const snapshot = makeSnapshot();
  const safe = cloneSnapshotWithNewIds(snapshot, { testName: snapshot.testName, round: snapshot.round, runId: 'fixture-run-12345678' });
  safe.format = snapshot.format;
  return safe;
}

test('valida hashes de PDF, chunks, vetores e assets; proíbe incluir outputs gerados', () => {
  const snapshot = makeSafeSnapshot();
  assert.deepEqual(validateSnapshot(snapshot), []);
  snapshot.format = 'unknown';
  assert.ok(validateSnapshot(snapshot).some((error) => error.includes('snapshot format')));
  snapshot.format = 'model-comparison-baseline-graph-v1';
  snapshot.tables.questions = [{ id: uuid() }];
  assert.ok(validateSnapshot(snapshot).some((error) => error.includes('unexpected table questions')));
  delete snapshot.tables.questions;
  snapshot.visualObjects[0].bytesBase64 = Buffer.from('altered').toString('base64');
  assert.ok(validateSnapshot(snapshot).some((error) => error.includes('visual checksum mismatch')));
  snapshot.visualObjects[0].bytesBase64 = Buffer.from('visual-q03-p5').toString('base64');
  snapshot.tables.document_chunks[0].embedding = '';
  assert.ok(validateSnapshot(snapshot).some((error) => error.includes('embedding')));
  snapshot.tables.document_chunks[0].embedding = '[0.125,0.25,-0.5]';
  snapshot.tables.document_chunks[0].embedding_model = null;
  assert.ok(validateSnapshot(snapshot).some((error) => error.includes('embedding model')));
  snapshot.tables.document_chunks[0].embedding_model = 'other/model';
  assert.ok(validateSnapshot(snapshot).some((error) => error.includes('required qwen')));
  snapshot.tables.document_chunks[0].embedding_model = 'qwen/qwen3-embedding-8b';
  snapshot.sourceProof.chunkProofs[0].embeddingVersion = 'mismatch';
  assert.ok(validateSnapshot(snapshot).some((error) => error.includes('chunk version proof')));
  snapshot.sourceProof.chunkProofs[0].embeddingVersion = 'test-v1';
  snapshot.sourceProof.questionEvidence[0].pageStart = 99;
  assert.ok(validateSnapshot(snapshot).some((error) => error.includes('question evidence does not match')));
  snapshot.sourceProof.questionEvidence[0].pageStart = 1;
  snapshot.sourceProof.questionEvidence.pop();
  assert.ok(validateSnapshot(snapshot).some((error) => error.includes('exactly questions 1..10')));
});

test('import execute direto recusa baseline incompleto antes de conectar ao destino', async () => {
  const snapshot = makeSafeSnapshot();
  snapshot.tables.document_chunks = snapshot.tables.document_chunks.slice(0, 1);
  snapshot.sourceProof.chunkProofs = snapshot.sourceProof.chunkProofs.slice(0, 1);
  snapshot.tables.document_visual_assets = snapshot.tables.document_visual_assets.slice(0, 1);
  snapshot.visualObjects = snapshot.visualObjects.slice(0, 1);
  snapshot.sourceProof.visualProofs = snapshot.sourceProof.visualProofs.slice(0, 1);
  const failures = validateSnapshot(snapshot, { requireExpectedBaselineCounts: true });
  assert.ok(failures.some((failure) => failure.includes('exactly 22 reusable chunks')));
  assert.ok(failures.some((failure) => failure.includes('exactly 31 visual assets')));
  assert.ok(!failures.some((failure) => failure.includes('exact three baseline PDFs')));
  const runId = 'strict-import-123456';
  const databaseName = expectedTargetDatabaseName(snapshot.testName, 1, runId);
  const previous = process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE;
  process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE = '1';
  let connected = false;
  try {
    await assert.rejects(importBaselineGraph({
      snapshot, targetDatabaseUrl: `postgresql://postgres:postgres@127.0.0.1:56322/${databaseName}`,
      testName: snapshot.testName, round: 1, runId, execute: true,
      targetClient: { async connect() { connected = true; } },
      storageClient: { from() { throw new Error('strict rejection must precede Storage'); } },
    }), /expected exactly 22 reusable chunks/u);
    assert.equal(connected, false);
  } finally {
    if (previous === undefined) delete process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE;
    else process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE = previous;
  }
});

test('valida que chunks, assets e relações permaneçam no documento de origem', () => {
  const snapshot = makeSafeSnapshot();
  snapshot.sourceProof.chunkProofs[0].documentId = uuid();
  snapshot.sourceProof.visualProofs[0].documentId = uuid();
  snapshot.tables.document_chunk_visual_assets[0].visual_asset_id = uuid();
  const errors = validateSnapshot(snapshot);
  assert.ok(errors.some((error) => error.includes('chunk/vector/document')));
  assert.ok(errors.some((error) => error.includes('visual asset/document')));
  assert.ok(errors.some((error) => error.includes('chunk-to-asset')));
});

test('clona allowlist com UUIDs novos, paths runId e vetores preservados', () => {
  const snapshot = makeSnapshot();
  const cloned = cloneSnapshotWithNewIds(snapshot, { testName: snapshot.testName, round: 1, runId: 'run-test-12345678' });
  assert.equal(cloned.tables.monitor_documents.length, 3);
  assert.ok(cloned.tables.monitor_documents.every((doc) => !BASELINE_DOCUMENT_IDS.includes(doc.id)));
  assert.equal(cloned.tables.document_chunks[0].embedding, snapshot.tables.document_chunks[0].embedding);
  assert.equal(cloned.tables.document_chunks[0].content_hash, snapshot.tables.document_chunks[0].content_hash);
  assert.equal(cloned.tables.document_chunks[0].embedding_sha256, snapshot.tables.document_chunks[0].embedding_sha256);
  assert.equal(cloned.tables.teachers[0].current_payment_account_id, null);
  assert.notEqual(cloned.tables.teachers[0].user_id, snapshot.tables.teachers[0].user_id);
  assert.equal(cloned.tables.teachers[0].full_name, 'Model Comparison Teacher');
  assert.match(cloned.tables.teachers[0].email, /example\.invalid$/u);
  assert.equal(cloned.tables.teachers[0].phone, null);
  assert.equal(cloned.tables.monitors[0].description, null);
  assert.equal(cloned.sourceProof.chunkProofs[0].chunkerVersion, 'NAO_VERIFICADO');
  assert.equal(cloned.sourceProof.chunkerEquivalenceStatus, 'NAO_VERIFICADO');
  assert.equal(cloned.sourceProof.questionEvidence.length, 10);
  assert.ok(cloned.sourceProof.questionEvidence.every((proof) => !('statement' in proof) && !('rawContent' in proof)));
  assert.ok(!('idMap' in cloned));
  assert.match(cloned.tables.monitor_documents[0].storage_path, /^model-comparison\/e2e_so_qwen235b\/round-1\/run-test-12345678\//u);
  assert.match(cloned.tables.document_visual_assets[0].storage_path, /^model-comparison\/e2e_so_qwen235b\/round-1\/run-test-12345678\//u);
  assert.equal(cloned.tables.document_parse_runs[0].raw_output_path, null);
  assert.equal(cloned.sourceProof.chunkProofs[0].chunkId, cloned.tables.document_chunks[0].id);
  assert.ok(!Object.keys(cloned.tables).some((table) => EXCLUDED_GENERATED_TABLES.includes(table)));
});

test('import dry-run usa transação READ ONLY, exige destino vazio e não faz upload', async () => {
  const snapshot = makeSafeSnapshot();
  const runId = 'dry-run-12345678';
  const databaseName = expectedTargetDatabaseName(snapshot.testName, 1, runId);
  const calls = [];
  const targetClient = {
    async connect() { throw new Error('targetClient injetado não deve reconectar'); },
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql === 'SELECT current_database() AS database_name') return { rows: [{ database_name: databaseName }] };
      if (sql.startsWith('SELECT to_regclass')) return { rows: [{ relation: INCLUDED_TABLES.includes(values[0].replace('public.', '')) ? values[0] : null }] };
      if (sql.startsWith('SELECT count(*)')) return { rows: [{ count: 0 }] };
      return { rows: [], rowCount: 0 };
    },
    async end() { calls.push({ sql: 'END' }); },
  };
  const storageClient = { from() { throw new Error('dry-run tentou usar Storage'); } };
  const plan = await importBaselineGraph({ snapshot, targetDatabaseUrl: `postgresql://postgres:postgres@127.0.0.1:56322/${databaseName}`, testName: snapshot.testName, round: 1, runId, targetClient, storageClient });
  assert.equal(plan.status, 'DRY_RUN_ONLY');
  assert.equal(plan.writesExecuted, false);
  assert.equal(plan.pdfObjects, 3);
  assert.equal(plan.visualObjects, 31);
  assert.equal(plan.chunkerEquivalenceStatus, 'NAO_VERIFICADO');
  assert.ok(calls.some((call) => call.sql === 'BEGIN READ ONLY'));
  assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
  assert.ok(!calls.some((call) => call.sql.startsWith('INSERT')));
});

test('import fake qualifica INSERTs em public e comprova hashes/modelo/versões sem tocar recursos externos', async () => {
  const snapshot = makeSafeSnapshot();
  const runId = 'fake-import-123456';
  const databaseName = expectedTargetDatabaseName(snapshot.testName, 1, runId);
  const statements = [];
  const insertCalls = [];
  const inserted = new Map();
  const uploaded = new Map();
  const targetClient = {
    async query(sql, values = []) {
      statements.push(sql);
      if (sql === 'SELECT current_database() AS database_name') return { rows: [{ database_name: databaseName }] };
      if (sql.startsWith('SELECT to_regclass')) return { rows: [{ relation: INCLUDED_TABLES.includes(values[0].replace('public.', '')) ? values[0] : null }] };
      if (sql.startsWith('SELECT count(*)')) return { rows: [{ count: 0 }] };
      if (sql.startsWith('INSERT INTO')) {
        insertCalls.push({ sql, values });
        const table = sql.match(/^INSERT INTO "public"\."([^"]+)"/u)?.[1];
        assert.ok(table, `INSERT must explicitly target public: ${sql}`);
        const columnMatch = sql.match(/^INSERT INTO "public"\."[^"]+" \((.*?)\) VALUES/u);
        const columns = [...(columnMatch?.[1] ?? '').matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
        const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
        const rows = inserted.get(table) ?? [];
        rows.push(row);
        inserted.set(table, rows);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('FROM "public"."monitor_documents"')) {
        const wanted = new Set(values[0]);
        const rows = (inserted.get('monitor_documents') ?? []).filter((row) => wanted.has(row.id));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('FROM "public"."document_chunks"')) {
        const wanted = new Set(values[0]);
        const rows = (inserted.get('document_chunks') ?? []).filter((row) => wanted.has(row.id)).map((row) => ({ ...row, embedding_text: row.embedding }));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('FROM "public"."document_visual_assets"')) {
        const wanted = new Set(values[0]);
        const rows = (inserted.get('document_visual_assets') ?? []).filter((row) => wanted.has(row.id));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('FROM "public"."document_blocks"')) {
        const wanted = new Set(values[0]);
        const rows = (inserted.get('document_blocks') ?? []).filter((row) => wanted.has(row.id));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('FROM "public"."document_chunk_visual_assets"')) {
        const wanted = new Set(values[0]);
        const rows = (inserted.get('document_chunk_visual_assets') ?? []).filter((row) => wanted.has(row.chunk_id));
        return { rows, rowCount: rows.length };
      }
      if (sql.includes('FROM "public"."document_evidence_relations"')) {
        const wanted = new Set(values[0]);
        const rows = (inserted.get('document_evidence_relations') ?? []).filter((row) => wanted.has(row.document_id));
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    async end() {},
  };
  const storageClient = {
    from(bucket) {
      return {
        async upload(path, bytes) { uploaded.set(`${bucket}:${path}`, Buffer.from(bytes)); return { error: null }; },
        async download(path) {
          const bytes = uploaded.get(`${bucket}:${path}`);
          return bytes ? { data: { arrayBuffer: async () => bytes }, error: null } : { data: null, error: { statusCode: 404 } };
        },
        async remove(paths) { for (const path of paths) uploaded.delete(`${bucket}:${path}`); return { error: null }; },
      };
    },
  };
  const previous = process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE;
  process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE = '1';
  try {
    const result = await importBaselineGraph({
      snapshot, targetDatabaseUrl: `postgresql://postgres:local@127.0.0.1:56322/${databaseName}`,
      testName: snapshot.testName, round: 1, runId, execute: true,
      targetClient, storageClient,
    });
    assert.equal(result.status, 'IMPORTED_CHUNKER_VERSION_UNVERIFIED');
    assert.equal(result.comparisonEligible, false);
    assert.equal(result.writesExecuted, true);
    assert.equal(result.chunkerEquivalenceStatus, 'NAO_VERIFICADO');
    assert.equal(result.targetVerification.chunksAndVectorsVerified, 22);
    assert.equal(result.targetVerification.visualRowsAndObjectsVerified, 31);
    assert.equal(result.targetVerification.questionBlocksVerified, 10);
    assert.equal(result.targetVerification.chunkVisualRelationsVerified, 1);
    assert.equal(result.targetVerification.evidenceRelationsVerified, 1);
    assert.ok(statements.includes('COMMIT'));
    assert.ok(statements.filter((sql) => sql.startsWith('INSERT INTO')).every((sql) => sql.startsWith('INSERT INTO "public"."')));
    assert.ok(!statements.some((sql) => sql.includes('questions')));
    const topicInsert = insertCalls.find(({ sql }) => sql.startsWith('INSERT INTO "public"."monitor_topics"'));
    const topicColumns = [...topicInsert.sql.match(/^INSERT INTO "public"\."monitor_topics" \((.*?)\) VALUES/u)[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
    assert.equal(topicInsert.values[topicColumns.indexOf('ai_definition_sources')], JSON.stringify([{ source: 'fixture', pages: [1, 2] }]));
    const chunkInsert = insertCalls.find(({ sql }) => sql.startsWith('INSERT INTO "public"."document_chunks"'));
    const chunkColumns = [...chunkInsert.sql.match(/^INSERT INTO "public"\."document_chunks" \((.*?)\) VALUES/u)[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
    const chunkProvenance = JSON.parse(chunkInsert.values[chunkColumns.indexOf('provenance')]);
    assert.equal(chunkProvenance.documentId, chunkInsert.values[chunkColumns.indexOf('document_id')]);
    const layoutInsert = insertCalls.find(({ sql }) => sql.startsWith('INSERT INTO "public"."document_layout_elements"'));
    const layoutColumns = [...layoutInsert.sql.match(/^INSERT INTO "public"\."document_layout_elements" \((.*?)\) VALUES/u)[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
    const layoutAssetIds = JSON.parse(layoutInsert.values[layoutColumns.indexOf('asset_ids')]);
    assert.equal(layoutAssetIds.length, 31);
    assert.ok(layoutAssetIds.every((id) => /^[0-9a-f-]{36}$/iu.test(id)));
  } finally {
    if (previous === undefined) delete process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE;
    else process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE = previous;
  }
});

test('import com execução solicitada bloqueia antes de conectar sem a guarda local explícita', async () => {
  const snapshot = makeSafeSnapshot();
  const runId = 'blocked-run-12345678';
  const databaseName = expectedTargetDatabaseName(snapshot.testName, 1, runId);
  const previous = process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE;
  delete process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE;
  let connected = false;
  try {
    await assert.rejects(importBaselineGraph({
      snapshot, targetDatabaseUrl: `postgresql://postgres:postgres@127.0.0.1:56322/${databaseName}`,
      testName: snapshot.testName, round: 1, runId, execute: true,
      targetClient: { async connect() { connected = true; } },
    }), /Import real bloqueado/u);
    assert.equal(connected, false);
  } finally {
    if (previous !== undefined) process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE = previous;
  }
});

test('nome e URL de destino exigem banco loopback exclusivo para teste, rodada e runId', () => {
  const runId = 'run-isolation-123456';
  const name = expectedTargetDatabaseName('e2e_revisao_cruzada_qwen_gera_deepseek_revisa', 2, runId);
  const otherRunName = expectedTargetDatabaseName('e2e_revisao_cruzada_qwen_gera_deepseek_revisa', 2, 'other-isolation-123456');
  assert.ok(name.length <= 63);
  assert.notEqual(name, otherRunName);
  assert.deepEqual(validateLocalTargetUrl(`postgresql://postgres:postgres@127.0.0.1:56322/${name}`, 'e2e_revisao_cruzada_qwen_gera_deepseek_revisa', 2, runId), { hostname: '127.0.0.1', port: 56322, databaseName: name });
  assert.throws(() => validateLocalTargetUrl(`postgresql://postgres:pw@db.example:5432/${name}`, 'e2e_revisao_cruzada_qwen_gera_deepseek_revisa', 2, runId), /Destino recusado/u);
  assert.throws(() => expectedTargetDatabaseName('other', 1), /allowlist/u);
  assert.throws(() => validateLocalTargetUrl(`postgresql://postgres:pw@127.0.0.1:56322/${name}?options=-csearch_path%3Dother`, 'e2e_revisao_cruzada_qwen_gera_deepseek_revisa', 2, runId), /URL recusada/u);
  assert.throws(() => validateLocalTargetUrl(`https://postgres:pw@127.0.0.1:56322/${name}`, 'e2e_revisao_cruzada_qwen_gera_deepseek_revisa', 2, runId), /URL recusada/u);
  assert.throws(() => validateRunId('../escape-path'), /runId inválido/u);
  assert.equal(validateRunId('run-test-12345678'), 'run-test-12345678');
});

test('ordena rows auto-referenciais e rejeita ciclos', () => {
  const parent = { id: 'p', parent: null }, child = { id: 'c', parent: 'p' };
  assert.deepEqual(rowsInParentOrder([child, parent], 'parent').map((row) => row.id), ['p', 'c']);
  assert.throws(() => rowsInParentOrder([{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }], 'parent'), /Ciclo/u);
});
