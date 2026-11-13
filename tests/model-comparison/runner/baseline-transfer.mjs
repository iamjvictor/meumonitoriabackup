import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SOURCE_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:56322/postgres';
export const BASELINE_DOCUMENT_IDS = [
  '9ff3a570-9c14-42a6-8a89-ed9a53fa58bc',
  '5796b615-8eea-498a-ad44-8690d3af0ee9',
  '06fdb700-1039-4214-b856-170e75c17338',
];
export const INCLUDED_TABLES = [
  'teachers', 'monitors', 'monitor_subjects', 'monitor_topics', 'monitor_documents',
  'monitor_document_topics', 'document_texts', 'document_pages', 'document_parse_runs',
  'document_layout_elements', 'document_blocks', 'document_block_elements',
  'document_visual_assets', 'document_chunks', 'document_chunk_visual_assets',
  'document_evidence_relations',
];
export const EXCLUDED_GENERATED_TABLES = [
  'questions', 'question_spans', 'question_candidates', 'question_sources',
  'question_span_chunks', 'question_span_visual_assets', 'question_visual_assets',
  'question_ai_generations', 'document_block_topics', 'document_chunk_topics',
  'document_visual_asset_indexes', 'document_processing_jobs',
];
export const EXPECTED_BASELINE_GRAPH = Object.freeze({ documents: 3, chunks: 22, embeddedChunks: 22, visualAssets: 31 });

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const uuidSubstringPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu;
const testNames = new Set([
  'e2e_economica_qwen30b_deepseek', 'e2e_qualidade_kimi_gera_qwen_revisa',
  'e2e_so_qwen235b', 'e2e_revisao_cruzada_qwen_gera_deepseek_revisa',
]);
const runIdPattern = /^[a-z0-9][a-z0-9_-]{7,63}$/iu;

export function validateRunId(runId) {
  if (typeof runId !== 'string' || !runIdPattern.test(runId)) throw new Error('runId inválido; use 8–64 caracteres alfanuméricos, hífen ou underscore, sem separadores de caminho.');
  return runId;
}

export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

export function expectedTargetDatabaseName(testName, round, runId = 'default-run-12345678') {
  if (!testNames.has(testName) || ![1, 2].includes(Number(round))) throw new Error('Teste ou rodada fora da allowlist.');
  validateRunId(runId);
  const shortName = testName.replace(/^e2e_/, '').slice(0, 18);
  const discriminator = sha256(`${testName}:${round}:${runId}`).slice(0, 16);
  return `mc_${shortName}_r${round}_${discriminator}`;
}

export function validateLocalTargetUrl(targetUrl, testName, round, runId = 'default-run-12345678') {
  let parsed;
  try { parsed = new URL(targetUrl); } catch { throw new Error('URL recusada: formato inválido; nenhuma conexão foi aberta.'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.search || parsed.hash || parsed.pathname.includes('%') || !/^\/[a-zA-Z0-9_]+$/u.test(parsed.pathname)) {
    throw new Error('URL recusada: protocolo Postgres estrito, nome simples de banco e ausência de parâmetros/search_path são obrigatórios; nenhuma conexão foi aberta.');
  }
  const databaseName = parsed.pathname.slice(1);
  const hostnameIsLocal = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  const expectedName = expectedTargetDatabaseName(testName, round, runId);
  if (!hostnameIsLocal || parsed.port !== '56322' || databaseName !== expectedName) {
    throw new Error(`Destino recusado: exige Postgres local 127.0.0.1:56322/${expectedName}; nenhuma conexão foi aberta.`);
  }
  return { hostname: parsed.hostname, port: Number(parsed.port), databaseName };
}

function listIds(rows) { return [...new Set(rows.map((row) => row.id).filter((id) => typeof id === 'string'))]; }

export function cloneSnapshotWithNewIds(snapshot, { runId, testName, round }) {
  validateRunId(runId);
  if (!testNames.has(testName) || ![1, 2].includes(Number(round))) throw new Error('Teste/rodada fora da allowlist.');
  const idMap = new Map();
  for (const rows of Object.values(snapshot.tables)) {
    for (const row of rows) if (typeof row.id === 'string' && uuidPattern.test(row.id)) idMap.set(row.id, randomUUID());
  }
  // user_id is an identity boundary even though it is not a row PK in this graph.
  for (const teacher of snapshot.tables.teachers ?? []) {
    if (typeof teacher.user_id === 'string' && uuidPattern.test(teacher.user_id)) idMap.set(teacher.user_id, randomUUID());
  }
  const documentMap = new Map(snapshot.tables.monitor_documents.map((row) => [row.id, idMap.get(row.id)]));
  const visualMap = new Map(snapshot.tables.document_visual_assets.map((row) => [row.id, idMap.get(row.id)]));
  const assetPathMap = new Map();
  const objectPrefix = `model-comparison/${testName}/round-${round}/${runId}`;
  const remapText = (value) => value.replace(uuidSubstringPattern, (oldId) => idMap.get(oldId) ?? oldId);
  const remapJson = (value) => {
    if (Array.isArray(value)) return value.map(remapJson);
    if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, remapJson(nested)]));
    }
    if (typeof value === 'string') return uuidPattern.test(value) ? idMap.get(value) ?? value : remapText(value);
    return value;
  };
  const pdfObjects = snapshot.pdfObjects.map((object) => {
    const newDocumentId = documentMap.get(object.documentId);
    const newPath = `${objectPrefix}/${newDocumentId}/source/${basename(object.fileName)}`;
    const { sourcePath: _sourcePath, ...safeObject } = object;
    return { ...safeObject, documentId: newDocumentId, targetPath: newPath };
  });
  const visualObjects = snapshot.visualObjects.map((object) => {
    const newAssetId = visualMap.get(object.visualAssetId);
    const newDocumentId = documentMap.get(object.documentId);
    const extension = extname(object.fileName) || '.bin';
    const newPath = `${objectPrefix}/${newDocumentId}/assets/${newAssetId}-${object.sha256}${extension}`;
    assetPathMap.set(object.visualAssetId, newPath);
    const { sourcePath: _sourcePath, ...safeObject } = object;
    return { ...safeObject, visualAssetId: newAssetId, documentId: newDocumentId, targetPath: newPath };
  });
  const sourceProof = {
    ...snapshot.sourceProof,
    pdfProofs: snapshot.pdfObjects.map((object) => ({ documentId: documentMap.get(object.documentId), fileName: object.fileName, sha256: object.sha256, byteLength: object.byteLength, targetPath: pdfObjects.find((copy) => copy.fileName === object.fileName)?.targetPath })),
    visualProofs: snapshot.visualObjects.map((object) => ({ visualAssetId: visualMap.get(object.visualAssetId), documentId: documentMap.get(object.documentId), sha256: object.sha256, byteLength: object.byteLength, targetPath: assetPathMap.get(object.visualAssetId) })),
    chunkProofs: (snapshot.sourceProof.chunkProofs ?? []).map((proof) => ({ ...proof, chunkId: idMap.get(proof.chunkId), documentId: documentMap.get(proof.documentId) })),
    questionEvidence: (snapshot.sourceProof.questionEvidence ?? []).map((proof) => ({ ...proof, blockId: idMap.get(proof.blockId), documentId: documentMap.get(proof.documentId) })),
  };
  sourceProof.chunkerEquivalenceStatus = sourceProof.chunkProofs.some((proof) => proof.chunkerVersion === 'NAO_VERIFICADO') ? 'NAO_VERIFICADO' : 'VERIFIED';
  const tables = Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.map((row) => {
    const remapped = {};
    for (const [column, value] of Object.entries(row)) {
      if (table === 'teachers' && column === 'current_payment_account_id') { remapped[column] = null; continue; }
      if (table === 'teachers' && column === 'full_name') { remapped[column] = 'Model Comparison Teacher'; continue; }
      if (table === 'teachers' && column === 'email') { remapped[column] = `model-comparison-${runId}@example.invalid`; continue; }
      if (table === 'teachers' && column === 'phone') { remapped[column] = null; continue; }
      if (table === 'teachers' && column === 'username') { remapped[column] = `mc_${runId.slice(0, 48)}`; continue; }
      if (table === 'teachers' && column === 'page_slug') { remapped[column] = `mc-${runId.slice(0, 48)}`; continue; }
      if (table === 'teachers' && ['area', 'custom_area', 'bio', 'avatar_url', 'banner_url', 'instagram', 'tiktok', 'youtube'].includes(column)) { remapped[column] = column === 'area' ? 'Model Comparison' : null; continue; }
      if (table === 'monitors' && column === 'name') { remapped[column] = `Model Comparison ${runId.slice(0, 40)}`; continue; }
      if (table === 'monitors' && ['description', 'avatar_url', 'detailed_description'].includes(column)) { remapped[column] = null; continue; }
      if (column === 'id' && idMap.has(value)) remapped[column] = idMap.get(value);
      else if (table === 'monitor_documents' && column === 'storage_path') remapped[column] = pdfObjects.find((object) => object.documentId === documentMap.get(row.id))?.targetPath;
      else if (table === 'document_visual_assets' && column === 'storage_path') remapped[column] = assetPathMap.get(row.id);
      else if (table === 'document_parse_runs' && ['artifact_manifest_path', 'raw_output_path'].includes(column)) remapped[column] = null;
      else if (column === 'idempotency_key') remapped[column] = `${runId}:${String(value)}`;
      else if (column === 'source_key' && typeof value === 'string') remapped[column] = `mc-${runId.slice(0, 8)}:${remapText(value)}`;
      else if (value instanceof Date) remapped[column] = value.toISOString();
      else if (value && typeof value === 'object') remapped[column] = remapJson(value);
      else if (typeof value === 'string' && uuidPattern.test(value)) remapped[column] = idMap.get(value) ?? value;
      else remapped[column] = value;
    }
    return remapped;
  })]));
  return {
    runId, testName, round, tables, pdfObjects, visualObjects,
    omittedGeneratedTables: snapshot.omittedGeneratedTables,
    sourceProof,
  };
}

export function validateSnapshot(snapshot, { requireExpectedBaselineCounts = false } = {}) {
  const failures = [];
  if (!snapshot || !snapshot.tables || !Array.isArray(snapshot.pdfObjects) || !Array.isArray(snapshot.visualObjects)) return ['snapshot shape invalid'];
  if (snapshot.format !== 'model-comparison-baseline-graph-v1') failures.push('snapshot format invalid');
  const included = Object.keys(snapshot.tables);
  for (const table of included) if (!INCLUDED_TABLES.includes(table)) failures.push(`unexpected table ${table}`);
  for (const table of EXCLUDED_GENERATED_TABLES) if (included.includes(table)) failures.push(`generated table included: ${table}`);
  for (const table of INCLUDED_TABLES) if (!Array.isArray(snapshot.tables[table])) failures.push(`allowlisted table missing: ${table}`);
  if (JSON.stringify(snapshot.omittedGeneratedTables ?? []) !== JSON.stringify(EXCLUDED_GENERATED_TABLES)) failures.push('generated table omission declaration differs from allowlist');
  if (snapshot.tables.monitor_documents?.length !== 3) failures.push('expected exactly three baseline documents');
  if ((snapshot.tables.document_chunks?.length ?? 0) === 0) failures.push('no reusable document chunks');
  if ((snapshot.tables.document_visual_assets?.length ?? 0) !== snapshot.visualObjects.length) failures.push('visual asset row/object count differs');
  for (const pdf of snapshot.pdfObjects) {
    if (sha256(Buffer.from(pdf.bytesBase64, 'base64')) !== pdf.sha256) failures.push(`PDF checksum mismatch: ${pdf.fileName}`);
    if (Object.hasOwn(pdf, 'sourcePath')) failures.push(`source storage path must be removed: ${pdf.fileName}`);
  }
  for (const visual of snapshot.visualObjects) {
    if (sha256(Buffer.from(visual.bytesBase64, 'base64')) !== visual.sha256) failures.push(`visual checksum mismatch: ${visual.fileName}`);
    if (Object.hasOwn(visual, 'sourcePath')) failures.push(`source storage path must be removed: ${visual.fileName}`);
  }
  for (const chunk of snapshot.tables.document_chunks ?? []) {
    if (sha256(chunk.content) !== chunk.content_hash) failures.push(`chunk content hash mismatch: ${chunk.id}`);
    if (typeof chunk.embedding !== 'string' || chunk.embedding.trim().length === 0 || sha256(chunk.embedding) !== chunk.embedding_sha256) failures.push(`chunk embedding vector hash missing/mismatch: ${chunk.id}`);
    if (chunk.embedding_model !== 'qwen/qwen3-embedding-8b') failures.push(`chunk embedding model differs from required qwen/qwen3-embedding-8b: ${chunk.id}`);
  }
  if (requireExpectedBaselineCounts) {
    const docs = snapshot.tables.monitor_documents ?? [];
    const names = docs.map((document) => document.original_name).sort();
    const expectedNames = ['Estequiometria.pdf', 'Quimica-3.pdf', 'pH e pOH.pdf'].sort();
    if (docs.length !== EXPECTED_BASELINE_GRAPH.documents || JSON.stringify(names) !== JSON.stringify(expectedNames)) failures.push('expected the exact three baseline PDFs');
    if (snapshot.pdfObjects.length !== EXPECTED_BASELINE_GRAPH.documents || JSON.stringify(snapshot.pdfObjects.map((object) => object.fileName).sort()) !== JSON.stringify(expectedNames)) failures.push('expected exactly the three baseline PDF objects');
    if ((snapshot.tables.document_chunks?.length ?? 0) !== EXPECTED_BASELINE_GRAPH.chunks) failures.push(`expected exactly ${EXPECTED_BASELINE_GRAPH.chunks} reusable chunks`);
    const embeddedChunks = (snapshot.tables.document_chunks ?? []).filter((chunk) => typeof chunk.embedding === 'string' && chunk.embedding.trim().length > 0 && chunk.embedding_model === 'qwen/qwen3-embedding-8b').length;
    if (embeddedChunks !== EXPECTED_BASELINE_GRAPH.embeddedChunks) failures.push(`expected exactly ${EXPECTED_BASELINE_GRAPH.embeddedChunks} Qwen embedded chunks`);
    if ((snapshot.tables.document_visual_assets?.length ?? 0) !== EXPECTED_BASELINE_GRAPH.visualAssets || snapshot.visualObjects.length !== EXPECTED_BASELINE_GRAPH.visualAssets) failures.push(`expected exactly ${EXPECTED_BASELINE_GRAPH.visualAssets} visual assets and objects`);
  }
  const chunkProofs = snapshot.sourceProof?.chunkProofs ?? [];
  if (chunkProofs.length !== (snapshot.tables.document_chunks?.length ?? 0)) failures.push('chunk proof count differs from cloned chunk count');
  const proofsById = new Map(chunkProofs.map((proof) => [proof.chunkId, proof]));
  for (const chunk of snapshot.tables.document_chunks ?? []) {
    const proof = proofsById.get(chunk.id);
    if (!proof || proof.documentId !== chunk.document_id || proof.contentSha256 !== sha256(chunk.content) || proof.contentHash !== chunk.content_hash || proof.embeddingSha256 !== sha256(chunk.embedding) || proof.embeddingModel !== chunk.embedding_model) failures.push(`exact chunk/vector/document proof missing or differs: ${chunk.id}`);
    if (proof && (!proof.embeddingVersion || !proof.chunkerVersion || !proof.equivalenceStatus || proof.embeddingVersionValue !== (chunk.embedding_version ?? null) || proof.chunkerVersionValue !== (chunk.chunker_version ?? null) || proof.embeddingVersion !== (chunk.embedding_version ?? 'NAO_VERIFICADO') || proof.chunkerVersion !== (chunk.chunker_version ?? 'NAO_VERIFICADO'))) failures.push(`chunk version proof missing or differs: ${chunk.id}`);
    if (proof && proof.equivalenceStatus !== (chunk.chunker_version ? 'HASHES_AND_VERSION_VERIFIED' : 'NAO_VERIFICADO')) failures.push(`chunk equivalence status invalid: ${chunk.id}`);
  }
  const questionEvidence = snapshot.sourceProof?.questionEvidence ?? [];
  const questionNumbers = questionEvidence.map((proof) => proof.questionNumber).sort((a, b) => a - b);
  if (questionEvidence.length !== 10 || questionNumbers.some((number, index) => number !== index + 1)) failures.push('question evidence must derive exactly questions 1..10 from document blocks');
  const blocksById = new Map((snapshot.tables.document_blocks ?? []).map((block) => [block.id, block]));
  const questionDocId = (snapshot.tables.monitor_documents ?? []).find((document) => document.original_name === 'Quimica-3.pdf')?.id;
  for (const proof of questionEvidence) {
    const block = blocksById.get(proof.blockId);
    if (!block || proof.sourceTable !== 'document_blocks' || Number(block.question_number) !== proof.questionNumber || block.document_id !== proof.documentId || block.document_id !== questionDocId || block.content_hash !== proof.contentSha256 || sha256(block.normalized_content ?? block.raw_content ?? '') !== proof.contentSha256 || block.page_start !== proof.pageStart || block.page_end !== proof.pageEnd) failures.push(`question evidence does not match source block for question ${proof.questionNumber}`);
  }
  const assetsById = new Map((snapshot.tables.document_visual_assets ?? []).map((asset) => [asset.id, asset]));
  const visualProofs = snapshot.sourceProof?.visualProofs ?? [];
  if (visualProofs.length !== assetsById.size) failures.push('visual asset proof count differs from rows');
  for (const asset of assetsById.values()) {
    const proof = visualProofs.find((item) => item.visualAssetId === asset.id);
    const object = snapshot.visualObjects.find((item) => item.visualAssetId === asset.id);
    if (!proof || proof.documentId !== asset.document_id || !object || object.documentId !== asset.document_id || proof.sha256 !== asset.checksum || proof.sha256 !== object.sha256 || proof.byteLength !== object.byteLength) failures.push(`visual asset/document proof missing or differs: ${asset.id}`);
  }
  const chunkAssetEdges = snapshot.tables.document_chunk_visual_assets ?? [];
  for (const edge of chunkAssetEdges) {
    const chunk = (snapshot.tables.document_chunks ?? []).find((row) => row.id === edge.chunk_id);
    const asset = assetsById.get(edge.visual_asset_id);
    if (!chunk || !asset || chunk.document_id !== asset.document_id) failures.push(`chunk-to-asset document relation invalid: ${edge.chunk_id}`);
  }
  for (const relation of snapshot.tables.document_evidence_relations ?? []) {
    const source = relation.source_entity_type === 'VISUAL_ASSET' ? assetsById.get(relation.source_entity_id) : blocksById.get(relation.source_entity_id);
    const target = relation.target_entity_type === 'VISUAL_ASSET' ? assetsById.get(relation.target_entity_id) : blocksById.get(relation.target_entity_id);
    if (!source || !target || source.document_id !== relation.document_id || target.document_id !== relation.document_id) failures.push('document evidence relation crosses or omits its document graph');
  }
  for (const teacher of snapshot.tables.teachers ?? []) {
    if (teacher.full_name !== 'Model Comparison Teacher' || !/^model-comparison-[a-z0-9_-]+@example\.invalid$/iu.test(String(teacher.email ?? '')) || teacher.phone != null || teacher.bio != null || teacher.avatar_url != null || teacher.banner_url != null) failures.push('tenant profile PII remains in snapshot');
  }
  if (snapshot.sourceProof?.chunkerEquivalenceStatus !== (chunkProofs.some((proof) => proof.chunkerVersion === 'NAO_VERIFICADO') ? 'NAO_VERIFICADO' : 'VERIFIED')) failures.push('chunker equivalence must remain NAO_VERIFICADO when any version is missing');
  return failures;
}

export function rowsInParentOrder(rows, parentColumn) {
  const remaining = new Map(rows.map((row) => [row.id, row]));
  const result = [];
  while (remaining.size) {
    let progress = false;
    for (const [id, row] of remaining) {
      const parentId = row[parentColumn];
      if (parentId == null || !remaining.has(parentId)) {
        result.push(row); remaining.delete(id); progress = true;
      }
    }
    if (!progress) throw new Error(`Ciclo detectado em ${parentColumn}.`);
  }
  return result;
}

function quoteIdent(value) { return `"${value.replaceAll('"', '""')}"`; }
function quotePublicTable(value) {
  if (!INCLUDED_TABLES.includes(value) && !EXCLUDED_GENERATED_TABLES.includes(value)) throw new Error(`Tabela fora da allowlist public: ${value}`);
  return `"public".${quoteIdent(value)}`;
}

async function localSupabase() {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], { cwd: process.cwd(), encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw new Error('Supabase local dbtemp indisponível; nenhuma operação executada.');
  const values = Object.fromEntries(result.stdout.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/u);
    return match ? [[match[1], match[2].replace(/^"|"$/gu, '')]] : [];
  }));
  const url = new URL(values.API_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('Storage URL não local; operação recusada.');
  const { createRequire } = await import('node:module');
  const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
  const { createClient } = require('@supabase/supabase-js');
  return createClient(values.API_URL, values.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }).storage;
}

const INSERT_ORDER = [
  'teachers', 'monitors', 'monitor_subjects', 'monitor_topics', 'monitor_documents',
  'document_texts', 'document_parse_runs', 'document_pages', 'document_layout_elements',
  'document_blocks', 'document_visual_assets', 'document_chunks', 'monitor_document_topics',
  'document_block_elements', 'document_chunk_visual_assets', 'document_evidence_relations',
];

function orderRows(table, rows) {
  if (table === 'document_blocks') return rowsInParentOrder(rows, 'parent_block_id');
  if (table === 'document_layout_elements') return rowsInParentOrder(rows, 'parent_element_id');
  return rows;
}

async function targetDatabasePreflight(client, targetName) {
  const db = await client.query('SELECT current_database() AS database_name');
  if (db.rows[0]?.database_name !== targetName) throw new Error('Banco de destino conectado não corresponde ao nome validado.');
  for (const table of INCLUDED_TABLES) {
    const exists = await client.query('SELECT to_regclass($1) AS relation', [`public.${table}`]);
    if (!exists.rows[0]?.relation) throw new Error(`Destino não provisionado: falta public.${table}; migrations não serão executadas.`);
  }
  const emptyTables = [...new Set([...INCLUDED_TABLES, ...EXCLUDED_GENERATED_TABLES])];
  const nonEmpty = [];
  for (const table of emptyTables) {
    const exists = await client.query('SELECT to_regclass($1) AS relation', [`public.${table}`]);
    if (!exists.rows[0]?.relation) continue;
    const result = await client.query(`SELECT count(*)::int AS count FROM ${quotePublicTable(table)}`);
    if (result.rows[0].count > 0) nonEmpty.push({ table, count: result.rows[0].count });
  }
  if (nonEmpty.length) throw new Error(`Destino não vazio; import bloqueado: ${JSON.stringify(nonEmpty)}`);
}

async function insertTableRows(client, table, rows) {
  if (!INCLUDED_TABLES.includes(table)) throw new Error(`Insert fora da allowlist: ${table}`);
  for (const row of orderRows(table, rows)) {
    const columns = Object.keys(row);
    if (columns.length === 0) continue;
    const insertColumns = columns.filter((column) => !(table === 'document_chunks' && column === 'embedding_sha256'));
    // node-postgres treats JS arrays as PostgreSQL arrays. These snapshot
    // columns are jsonb, so encode JSON values explicitly while preserving
    // native Date/Buffer/null handling for ordinary PostgreSQL columns.
    const values = insertColumns.map((column) => {
      const value = row[column];
      if (Array.isArray(value)) return JSON.stringify(value);
      if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
        const prototype = Object.getPrototypeOf(value);
        if (prototype === Object.prototype || prototype === null) return JSON.stringify(value);
      }
      return value;
    });
    const parameters = values.map((_, index) => `$${index + 1}`).join(',');
    const sql = `INSERT INTO ${quotePublicTable(table)} (${insertColumns.map(quoteIdent).join(',')}) VALUES (${parameters})`;
    await client.query(sql, values);
  }
}

async function uploadStorageObject(storage, bucket, object, uploadedPaths) {
  const bytes = Buffer.from(object.bytesBase64, 'base64');
  if (sha256(bytes) !== object.sha256) throw new Error(`Checksum da fixture inválido antes do upload: ${object.fileName}`);
  const result = await storage.from(bucket).upload(object.targetPath, bytes, {
    contentType: object.mimeType ?? (bucket === 'monitor-documents' ? 'application/pdf' : 'image/png'),
    upsert: false,
  });
  if (result.error) throw new Error(`Falha ao gravar objeto local ${object.targetPath}: ${result.error.message}`);
  uploadedPaths.push({ bucket, path: object.targetPath });
}

async function removeUploadedObjects(storage, paths) {
  const failures = [];
  for (const entry of paths.reverse()) {
    const result = await storage.from(entry.bucket).remove([entry.path]);
    if (result.error) failures.push({ bucket: entry.bucket, path: entry.path, status: result.error.statusCode ?? 'ERROR' });
  }
  return failures;
}

async function verifyImportedGraph(client, storage, cloned) {
  const newDocIds = cloned.sourceProof.pdfProofs.map((proof) => proof.documentId);
  const docs = await client.query('SELECT id,original_name,storage_path FROM "public"."monitor_documents" WHERE id=ANY($1::uuid[]) ORDER BY original_name', [newDocIds]);
  if (docs.rowCount !== 3) throw new Error(`Target docs count ${docs.rowCount}, expected 3.`);
  const pdfById = new Map(cloned.sourceProof.pdfProofs.map((proof) => [proof.documentId, proof]));
  for (const doc of docs.rows) {
    const proof = pdfById.get(doc.id);
    if (!proof || doc.storage_path !== proof.targetPath) throw new Error(`Target PDF path differs from proof: ${doc.original_name}`);
    const bytes = await downloadVerified(storage, 'monitor-documents', doc.storage_path, proof.sha256, doc.original_name);
    if (bytes.length !== proof.byteLength) throw new Error(`PDF byte length diverged: ${doc.original_name}`);
  }
  const expectedChunkProofs = cloned.sourceProof.chunkProofs;
  const chunkIds = expectedChunkProofs.map((proof) => proof.chunkId);
  const chunkRows = await client.query('SELECT id,document_id,block_id,content,content_hash,embedding::text AS embedding_text,embedding_model,embedding_version,chunker_version FROM "public"."document_chunks" WHERE id=ANY($1::uuid[])', [chunkIds]);
  if (chunkRows.rowCount !== expectedChunkProofs.length) throw new Error('Target chunk count differs from baseline snapshot.');
  const chunks = new Map(chunkRows.rows.map((row) => [row.id, row]));
  for (const proof of expectedChunkProofs) {
    const chunk = chunks.get(proof.chunkId);
    if (!chunk || chunk.document_id !== proof.documentId || chunk.content_hash !== proof.contentHash || sha256(chunk.content) !== proof.contentSha256 || sha256(chunk.embedding_text ?? '') !== proof.embeddingSha256 || chunk.embedding_model !== proof.embeddingModel || (chunk.embedding_version ?? null) !== proof.embeddingVersionValue || (chunk.chunker_version ?? null) !== proof.chunkerVersionValue) {
      throw new Error(`Target chunk/vector mismatch: ${proof.chunkId}`);
    }
  }
  const assetRows = await client.query('SELECT id,document_id,storage_path,checksum FROM "public"."document_visual_assets" WHERE id=ANY($1::uuid[])', [cloned.sourceProof.visualProofs.map((proof) => proof.visualAssetId)]);
  if (assetRows.rowCount !== cloned.sourceProof.visualProofs.length) throw new Error('Target visual asset row count differs.');
  for (const asset of assetRows.rows) {
    const proof = cloned.sourceProof.visualProofs.find((item) => item.visualAssetId === asset.id);
    if (!proof || asset.document_id !== proof.documentId || asset.storage_path !== proof.targetPath || asset.checksum !== proof.sha256) throw new Error(`Target visual asset/document/path checksum row mismatch: ${asset.id}`);
    const bytes = await downloadVerified(storage, 'document-parser-artifacts', asset.storage_path, proof.sha256, asset.id);
    if (bytes.length !== proof.byteLength) throw new Error(`Target visual asset byte length mismatch: ${asset.id}`);
  }
  const blockIds = cloned.sourceProof.questionEvidence.map((proof) => proof.blockId);
  const blocks = await client.query('SELECT id,document_id,question_number,page_start,page_end,content_hash,normalized_content,raw_content FROM "public"."document_blocks" WHERE id=ANY($1::uuid[])', [blockIds]);
  if (blocks.rowCount !== cloned.sourceProof.questionEvidence.length) throw new Error('Target question block count differs.');
  for (const proof of cloned.sourceProof.questionEvidence) {
    const block = blocks.rows.find((row) => row.id === proof.blockId);
    if (!block || block.document_id !== proof.documentId || Number(block.question_number) !== proof.questionNumber || block.page_start !== proof.pageStart || block.page_end !== proof.pageEnd || block.content_hash !== proof.contentSha256 || sha256(block.normalized_content ?? block.raw_content ?? '') !== proof.contentSha256) throw new Error(`Target question block proof mismatch: ${proof.questionNumber}`);
  }
  const chunkVisual = await client.query('SELECT chunk_id,visual_asset_id FROM "public"."document_chunk_visual_assets" WHERE chunk_id=ANY($1::uuid[])', [chunkIds]);
  const expectedChunkVisual = cloned.tables.document_chunk_visual_assets ?? [];
  if (chunkVisual.rowCount !== expectedChunkVisual.length || expectedChunkVisual.some((edge) => !chunkVisual.rows.some((row) => row.chunk_id === edge.chunk_id && row.visual_asset_id === edge.visual_asset_id))) throw new Error('Target chunk-to-visual relations differ.');
  const evidence = await client.query('SELECT document_id,source_entity_type,source_entity_id,target_entity_type,target_entity_id FROM "public"."document_evidence_relations" WHERE document_id=ANY($1::uuid[])', [newDocIds]);
  const expectedEvidence = cloned.tables.document_evidence_relations ?? [];
  if (evidence.rowCount !== expectedEvidence.length || expectedEvidence.some((edge) => !evidence.rows.some((row) => row.document_id === edge.document_id && row.source_entity_type === edge.source_entity_type && row.source_entity_id === edge.source_entity_id && row.target_entity_type === edge.target_entity_type && row.target_entity_id === edge.target_entity_id))) throw new Error('Target document evidence relations differ.');
  return { documentsVerified: docs.rowCount, chunksAndVectorsVerified: chunkRows.rowCount, visualRowsAndObjectsVerified: assetRows.rowCount, questionBlocksVerified: blocks.rowCount, chunkVisualRelationsVerified: chunkVisual.rowCount, evidenceRelationsVerified: evidence.rowCount };
}

export async function importBaselineGraph({ snapshot, targetDatabaseUrl, testName, round, runId = randomUUID(), execute = false, requireExpectedBaselineCounts = false, storageClient, targetClient }) {
  const destination = validateLocalTargetUrl(targetDatabaseUrl, testName, round, runId);
  if (snapshot.testName !== testName || Number(snapshot.round) !== Number(round)) throw new Error('Fixture test/round não corresponde ao destino.');
  const validationFailures = validateSnapshot(snapshot, { requireExpectedBaselineCounts: execute || requireExpectedBaselineCounts });
  if (validationFailures.length) throw new Error(`Fixture recusada: ${validationFailures.join('; ')}`);
  if (execute && process.env.MODEL_COMPARISON_ALLOW_LOCAL_WRITE !== '1') throw new Error('Import real bloqueado: exige MODEL_COMPARISON_ALLOW_LOCAL_WRITE=1 e --execute-import.');
  const cloned = cloneSnapshotWithNewIds(snapshot, { runId, testName, round });
  const target = targetClient ?? await getPgClient(targetDatabaseUrl);
  if (!targetClient) await target.connect();
  const storage = storageClient ?? await localSupabase();
  const uploaded = [];
  try {
    await target.query(execute ? 'BEGIN' : 'BEGIN READ ONLY');
    await targetDatabasePreflight(target, destination.databaseName);
    const plan = {
      status: execute ? 'WRITE_REQUESTED' : 'DRY_RUN_ONLY',
      testName, round, runId, destinationDatabase: destination.databaseName,
      insertedRowsByTable: Object.fromEntries(INSERT_ORDER.map((table) => [table, cloned.tables[table]?.length ?? 0])),
      pdfObjects: cloned.pdfObjects.length, visualObjects: cloned.visualObjects.length,
      generatedOutputsOmitted: EXCLUDED_GENERATED_TABLES,
      sourceProof: snapshot.sourceProof,
      chunkerEquivalenceStatus: snapshot.sourceProof.chunkerEquivalenceStatus ?? 'NAO_VERIFICADO',
      writesExecuted: false,
    };
    if (!execute) { await target.query('ROLLBACK'); return plan; }
    for (const object of cloned.pdfObjects) await uploadStorageObject(storage, 'monitor-documents', object, uploaded);
    for (const object of cloned.visualObjects) await uploadStorageObject(storage, 'document-parser-artifacts', object, uploaded);
    for (const table of INSERT_ORDER) await insertTableRows(target, table, cloned.tables[table] ?? []);
    const targetVerification = await verifyImportedGraph(target, storage, cloned);
    await target.query('COMMIT');
    const status = plan.chunkerEquivalenceStatus === 'VERIFIED' ? 'IMPORTED_AND_VERIFIED' : 'IMPORTED_CHUNKER_VERSION_UNVERIFIED';
    return { ...plan, status, writesExecuted: true, targetVerification, comparisonEligible: status === 'IMPORTED_AND_VERIFIED' };
  } catch (error) {
    await target.query('ROLLBACK').catch(() => {});
    const cleanupFailures = await removeUploadedObjects(storage, uploaded);
    if (cleanupFailures.length) throw new Error(`Import falhou e houve objetos de Storage órfãos: ${JSON.stringify(cleanupFailures)}; causa: ${error instanceof Error ? error.message : 'unknown'}`);
    throw error;
  } finally { await target.end(); }
}

function parseArgs(argv) {
  const out = { mode: 'inspect', execute: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--export') { out.mode = 'export'; out.outputPath = argv[++index]; }
    else if (token === '--import') { out.mode = 'import'; out.snapshotPath = argv[++index]; }
    else if (token === '--execute-import') out.execute = true;
    else if (token === '--target') out.targetDatabaseUrl = argv[++index];
    else if (token === '--test') out.testName = argv[++index];
    else if (token === '--round') out.round = Number(argv[++index]);
    else if (token === '--run-id') out.runId = argv[++index];
    else if (token === '--help') out.mode = 'help';
    else throw new Error(`Argumento desconhecido: ${token}`);
  }
  return out;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.mode === 'help') {
    process.stdout.write('Uso: node baseline-transfer.mjs --test NAME --round 1|2 [--export FILE | --import FILE --target LOCAL_DB_URL [--execute-import]]\n');
    return;
  }
  if (!args.testName || ![1, 2].includes(args.round)) throw new Error('Use --test e --round válidos.');
  if (args.mode === 'export') {
    if (!args.outputPath) throw new Error('--export exige caminho explícito; export não escreve por padrão.');
    const snapshot = await exportBaselineGraph({ testName: args.testName, round: args.round, runId: args.runId });
    await writeFile(resolve(args.outputPath), `${JSON.stringify(snapshot)}\n`, { mode: 0o600, flag: 'wx' });
    process.stdout.write(`${JSON.stringify({ status: 'EXPORTED_LOCAL_FIXTURE', path: resolve(args.outputPath), sourceProof: snapshot.sourceProof })}\n`);
    return;
  }
  if (args.mode === 'import') {
    if (!args.snapshotPath || !args.targetDatabaseUrl) throw new Error('--import exige snapshot e --target; default é dry-run.');
    const snapshot = JSON.parse(await readFile(args.snapshotPath, 'utf8'));
    const plan = await importBaselineGraph({ snapshot, targetDatabaseUrl: args.targetDatabaseUrl, testName: args.testName, round: args.round, runId: args.runId, execute: args.execute });
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return;
  }
  throw new Error('Modo CLI não suportado. Use --help.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unknown error'}\n`);
    process.exitCode = 1;
  });
}

async function getPgClient(connectionString) {
  const { createRequire } = await import('node:module');
  const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
  const { Client } = require('pg');
  return new Client({ connectionString, application_name: 'model-comparison-baseline-transfer' });
}

async function queryRows(client, table, whereSql, values) {
  if (!INCLUDED_TABLES.includes(table)) throw new Error(`Tabela fora da allowlist: ${table}`);
  const { rows } = await client.query(`SELECT * FROM ${quotePublicTable(table)} WHERE ${whereSql}`, values);
  return rows;
}

async function downloadVerified(storage, bucket, path, expectedSha, label) {
  if (typeof storage?.from !== 'function' || typeof storage.from(bucket)?.download !== 'function') throw new Error(`Storage client lacks download method (from=${typeof storage?.from}, bucket=${typeof storage?.from === 'function' ? typeof storage.from(bucket)?.download : 'NA'}).`);
  const response = await storage.from(bucket).download(path);
  if (response.error || !response.data) throw new Error(`Objeto ausente em ${bucket}: ${label} (${response.error?.statusCode ?? 'sem bytes'}).`);
  const bytes = Buffer.from(await response.data.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== expectedSha) throw new Error(`Checksum incompatível em ${label}; esperado ${expectedSha}, recebido ${actual}.`);
  return bytes;
}

export async function exportBaselineGraph({ testName, round, runId = randomUUID(), databaseUrl = SOURCE_DATABASE_URL, storageClient }) {
  if (!testNames.has(testName) || ![1, 2].includes(Number(round))) throw new Error('Teste/rodada inválidos.');
  validateRunId(runId);
  let source;
  try { source = new URL(databaseUrl); } catch { throw new Error('Origem recusada: URL de dbtemp inválida; nenhum connect feito.'); }
  if (!['postgres:', 'postgresql:'].includes(source.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname) || source.port !== '56322' || source.pathname !== '/postgres' || source.search || source.hash) throw new Error('Origem recusada: export exige URL Postgres local estrita para dbtemp, sem opções/search_path; nenhum connect feito.');
  const client = await getPgClient(databaseUrl); await client.connect();
  await client.query('BEGIN READ ONLY');
  try {
    const docIds = BASELINE_DOCUMENT_IDS;
    const tables = {};
    tables.monitor_documents = await queryRows(client, 'monitor_documents', 'id = ANY($1::uuid[])', [docIds]);
    if (tables.monitor_documents.length !== 3) throw new Error(`Baseline tem ${tables.monitor_documents.length} docs, esperado 3.`);
    const teacherIds = listIds(tables.monitor_documents.map((row) => ({ id: row.teacher_id })));
    const monitorIds = listIds(tables.monitor_documents.map((row) => ({ id: row.monitor_id })));
    const subjectIds = listIds(tables.monitor_documents.map((row) => ({ id: row.subject_id })));
    const topicIds = listIds(tables.monitor_documents.map((row) => ({ id: row.topic_id })).filter((row) => row.id));
    tables.teachers = await queryRows(client, 'teachers', 'id = ANY($1::uuid[])', [teacherIds]);
    tables.monitors = await queryRows(client, 'monitors', 'id = ANY($1::uuid[])', [monitorIds]);
    tables.monitor_subjects = await queryRows(client, 'monitor_subjects', 'id = ANY($1::uuid[])', [subjectIds]);
    tables.monitor_document_topics = await queryRows(client, 'monitor_document_topics', 'document_id = ANY($1::uuid[])', [docIds]);
    const linkedTopicIds = listIds(tables.monitor_document_topics.map((row) => ({ id: row.topic_id })));
    const allTopicIds = [...new Set([...topicIds, ...linkedTopicIds])];
    tables.monitor_topics = await queryRows(client, 'monitor_topics', 'id = ANY($1::uuid[])', [allTopicIds]);
    tables.document_texts = await queryRows(client, 'document_texts', 'document_id = ANY($1::uuid[])', [docIds]);
    const textIds = listIds(tables.document_texts);
    tables.document_pages = await queryRows(client, 'document_pages', 'document_text_id = ANY($1::uuid[])', [textIds]);
    tables.document_parse_runs = await queryRows(client, 'document_parse_runs', 'document_id = ANY($1::uuid[])', [docIds]);
    tables.document_layout_elements = await queryRows(client, 'document_layout_elements', 'document_id = ANY($1::uuid[])', [docIds]);
    tables.document_blocks = await queryRows(client, 'document_blocks', 'document_id = ANY($1::uuid[])', [docIds]);
    const blockIds = listIds(tables.document_blocks);
    tables.document_block_elements = await queryRows(client, 'document_block_elements', 'block_id = ANY($1::uuid[])', [blockIds]);
    tables.document_visual_assets = await queryRows(client, 'document_visual_assets', 'document_id = ANY($1::uuid[])', [docIds]);
    tables.document_chunks = await queryRows(client, 'document_chunks', 'document_id = ANY($1::uuid[])', [docIds]);
    for (const chunk of tables.document_chunks) {
      chunk.embedding = typeof chunk.embedding === 'string' ? chunk.embedding : chunk.embedding?.toString?.() ?? null;
      chunk.embedding_sha256 = chunk.embedding == null ? null : sha256(chunk.embedding);
    }
    const chunkIds = listIds(tables.document_chunks);
    tables.document_chunk_visual_assets = await queryRows(client, 'document_chunk_visual_assets', 'chunk_id = ANY($1::uuid[])', [chunkIds]);
    tables.document_evidence_relations = await queryRows(client, 'document_evidence_relations', 'document_id = ANY($1::uuid[])', [docIds]);

    const storage = storageClient ?? await localSupabase();
    const pdfObjects = [];
    for (const document of tables.monitor_documents) {
      const bytes = await downloadVerified(storage, 'monitor-documents', document.storage_path, await pdfHashFromBaseline(document.original_name), document.original_name);
      pdfObjects.push({ documentId: document.id, fileName: document.original_name, sourcePath: document.storage_path, sha256: sha256(bytes), bytesBase64: bytes.toString('base64'), byteLength: bytes.length });
    }
    const visualObjects = [];
    for (const asset of tables.document_visual_assets) {
      if (!asset.checksum) throw new Error(`Asset ${asset.id} não tem checksum; export recusado.`);
      const bytes = await downloadVerified(storage, 'document-parser-artifacts', asset.storage_path, asset.checksum, asset.id);
      visualObjects.push({ visualAssetId: asset.id, documentId: asset.document_id, fileName: basename(asset.storage_path), sourcePath: asset.storage_path, mimeType: asset.mime_type, sha256: asset.checksum, bytesBase64: bytes.toString('base64'), byteLength: bytes.length });
    }
    const sourceProof = {
      documentCount: tables.monitor_documents.length,
      chunkCount: tables.document_chunks.length,
      embeddedChunkCount: tables.document_chunks.filter((chunk) => chunk.embedding != null).length,
      chunkerVersions: [...new Set(tables.document_chunks.map((chunk) => chunk.chunker_version).filter(Boolean))],
      missingChunkerVersionCount: tables.document_chunks.filter((chunk) => !chunk.chunker_version).length,
      embeddingModels: [...new Set(tables.document_chunks.map((chunk) => chunk.embedding_model).filter(Boolean))],
      visualAssetCount: tables.document_visual_assets.length,
      visualAssetsVerified: visualObjects.length,
      pdfObjectsVerified: pdfObjects.length,
      chunkProofs: tables.document_chunks.map((chunk) => ({
        chunkId: chunk.id, documentId: chunk.document_id, contentHash: chunk.content_hash,
        contentSha256: sha256(chunk.content), embeddingSha256: chunk.embedding_sha256,
        embeddingModel: chunk.embedding_model,
        embeddingVersionValue: chunk.embedding_version ?? null,
        embeddingVersion: chunk.embedding_version ?? 'NAO_VERIFICADO',
        chunkerVersionValue: chunk.chunker_version ?? null,
        chunkerVersion: chunk.chunker_version ?? 'NAO_VERIFICADO',
        equivalenceStatus: chunk.chunker_version ? 'HASHES_AND_VERSION_VERIFIED' : 'NAO_VERIFICADO',
      })),
      questionEvidence: tables.document_blocks
        .filter((block) => /^0?[1-9]$|^10$/u.test(String(block.question_number ?? '')))
        .map((block) => ({ sourceTable: 'document_blocks', questionNumber: Number(block.question_number), blockId: block.id, documentId: block.document_id, pageStart: block.page_start, pageEnd: block.page_end, contentSha256: block.content_hash }))
        .sort((left, right) => left.questionNumber - right.questionNumber),
      chunkerEquivalenceStatus: tables.document_chunks.some((chunk) => !chunk.chunker_version) ? 'NAO_VERIFICADO' : 'VERIFIED',
      pdfProofs: pdfObjects.map((object) => ({ documentId: object.documentId, fileName: object.fileName, sha256: object.sha256, byteLength: object.byteLength })),
      visualProofs: visualObjects.map((object) => ({ visualAssetId: object.visualAssetId, documentId: object.documentId, sha256: object.sha256, byteLength: object.byteLength })),
      omittedGeneratedTables: EXCLUDED_GENERATED_TABLES,
      resetGeneratedOutputs: ['document_visual_asset_indexes (description + vector)', 'document_block_topics', 'document_chunk_topics', 'document_processing_jobs', 'question spans/candidates/sources/questions/AI generations'],
    };
    const snapshot = { format: 'model-comparison-baseline-graph-v1', testName, round, sourceRunId: '9df3b11e-d426-4542-aa57-1d1982f17f01', exportRunId: runId, createdAt: new Date().toISOString(), tables, pdfObjects, visualObjects, sourceProof, omittedGeneratedTables: EXCLUDED_GENERATED_TABLES };
    const sanitizedSnapshot = cloneSnapshotWithNewIds(snapshot, { testName, round, runId });
    sanitizedSnapshot.format = snapshot.format;
    sanitizedSnapshot.sourceRunId = snapshot.sourceRunId;
    sanitizedSnapshot.exportRunId = runId;
    sanitizedSnapshot.createdAt = snapshot.createdAt;
    sanitizedSnapshot.sourceProof.sourceTenantDataSanitized = true;
    const failures = validateSnapshot(sanitizedSnapshot, { requireExpectedBaselineCounts: true });
    if (failures.length) throw new Error(`Snapshot validation failed: ${failures.join('; ')}`);
    return sanitizedSnapshot;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

async function pdfHashFromBaseline(name) {
  const expected = {
    'Quimica-3.pdf': 'dbc94a84bc48dfba51b0eda410e7cf116430827b6cd8468338030eb10ef3a28d',
    'Estequiometria.pdf': '63ac6bcdc1a33ef8a67998886482432496754695f6a3db9c918e3c6e7eb346cd',
    'pH e pOH.pdf': '5dc9b25e4ea2f5eb0729d748d3de2058d53cc90167ad558851504dddd40c4acc',
  };
  if (!expected[name]) throw new Error(`PDF não esperado no baseline: ${name}`);
  return expected[name];
}
