import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('generation migration retains legacy chunk uniqueness when generation_id is NULL', async () => {
  const sql = await readFile(new URL('../../../prisma/migrations/20261110012036_knowledge_active_generation/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE UNIQUE INDEX document_chunks_legacy_document_id_chunk_index_key\s+ON public\.document_chunks\(document_id, chunk_index\)\s+WHERE generation_id IS NULL;/u);
  assert.match(sql, /CREATE UNIQUE INDEX document_chunks_legacy_block_id_chunk_index_in_block_key\s+ON public\.document_chunks\(block_id, chunk_index_in_block\)\s+WHERE generation_id IS NULL;/u);
  assert.match(sql, /CREATE UNIQUE INDEX document_chunks_document_id_generation_id_chunk_index_key\s+ON public\.document_chunks\(document_id, generation_id, chunk_index\);/u);
});

test('generation migration ties active pointer, chunks and assets to their owning document', async () => {
  const sql = await readFile(new URL('../../../prisma/migrations/20261110012036_knowledge_active_generation/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /FOREIGN KEY \(active_generation_id, id\)\s+REFERENCES public\.knowledge_document_generations\(id, document_id\)/u);
  assert.match(sql, /FOREIGN KEY \(generation_id, document_id\)\s+REFERENCES public\.knowledge_document_generations\(id, document_id\)/gu);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/u);
});
