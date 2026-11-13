import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatVisualContextService } from './chat-visual-context.service.js';

const scope = { studentId: 'student-1', teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1' };

test('prioriza imagem da questão atual e inclui só assets autorizados da questão', async () => {
  const service = new ChatVisualContextService({
    async questionAssets(id, requestScope) {
      assert.equal(id, 'question-current');
      assert.equal(requestScope.subjectId, scope.subjectId);
      return [{ assetId: 'question-figure', page: 4, checksum: 'sha-q', description: 'Gráfico de pressão.' }];
    },
    async knowledgeAssets() { return [{ assetId: 'rag-figure', page: 8, checksum: 'sha-r', description: 'Diagrama de apoio.' }]; },
    async studentAssets(ids) { return ids.map((assetId) => ({ assetId, page: null, checksum: 'sha-s', description: null })); },
  });

  const result = await service.resolveVisualContext({ scope, currentQuestionId: 'question-current', resolvedAttachment: null, studentImageIds: [], rag: { citations: [{ visualAssetIds: ['rag-figure'] }] } as any });

  assert.deepEqual(result.images.map((image) => [image.assetId, image.source]), [
    ['question-figure', 'QUESTION'], ['rag-figure', 'KNOWLEDGE'],
  ]);
  assert.match(result.text, /Gráfico de pressão/);
  assert.equal(JSON.stringify(result).includes('bytes'), false);
});

test('não mistura figura ambígua de outra questão e deduplica follow-up da mesma questão', async () => {
  const service = new ChatVisualContextService({
    async questionAssets(id) { return id === 'question-a' ? [{ assetId: 'figure-a', page: 1, checksum: 'sha-a', description: 'Figura A.' }] : []; },
    async knowledgeAssets() { return []; },
    async studentAssets() { return []; },
  });
  const result = await service.resolveVisualContext({
    scope, currentQuestionId: null, resolvedAttachment: { type: 'QUESTION', id: 'question-a' }, studentImageIds: [], rag: { citations: [] } as any,
  });
  assert.deepEqual(result.images.map((image) => image.assetId), ['figure-a']);
  assert.equal(result.images.some((image) => image.assetId === 'figure-b'), false);

  const switched = await service.resolveVisualContext({
    scope, currentQuestionId: 'question-b', resolvedAttachment: { type: 'QUESTION', id: 'question-b' },
    studentImageIds: [], rag: { citations: [] } as any,
  });
  assert.deepEqual(switched.images, []);
});

test('usa imagem anexada pelo aluno junto da figura autorizada da questão', async () => {
  const service = new ChatVisualContextService({
    async questionAssets() { return [{ assetId: 'question-figure', page: 2, checksum: 'sha-q', description: 'Tabela.' }]; },
    async knowledgeAssets() { return []; },
    async studentAssets(ids) { return ids.map((assetId) => ({ assetId, page: null, checksum: 'sha-upload', description: null })); },
  });
  const result = await service.resolveVisualContext({ scope, currentQuestionId: 'question-a', resolvedAttachment: null, studentImageIds: ['upload-1'], rag: { citations: [] } as any });
  assert.deepEqual(result.images.map((image) => image.source), ['QUESTION', 'STUDENT_UPLOAD']);
});

test('prioriza até quatro imagens da questão e informa explicitamente fontes omitidas', async () => {
  const service = new ChatVisualContextService({
    async questionAssets() {
      return [1, 2, 3, 4].map((page) => ({ assetId: `question-${page}`, page, checksum: `sha-${page}`, description: null }));
    },
    async knowledgeAssets() { return [{ assetId: 'knowledge-figure', page: 8, checksum: 'sha-k', description: null }]; },
    async studentAssets() { return [{ assetId: 'student-upload', page: null, checksum: 'sha-s', description: null }]; },
  });

  const result = await service.resolveVisualContext({
    scope,
    currentQuestionId: 'question-current',
    resolvedAttachment: null,
    studentImageIds: ['student-upload'],
    rag: { citations: [{ visualAssetIds: ['knowledge-figure'] }] } as any,
  });

  assert.deepEqual(result.images.map((image) => image.assetId), ['question-1', 'question-2', 'question-3', 'question-4']);
  assert.match(result.text, /limite de 4/i);
  assert.match(result.text, /STUDENT_UPLOAD/);
  assert.match(result.text, /KNOWLEDGE/);
});

test('detecta quinto asset da questão sem incluí-lo no contexto e informa a omissão', async () => {
  const service = new ChatVisualContextService({
    async questionAssets() {
      return [1, 2, 3, 4].map((page) => ({
        assetId: `question-${page}`, page, checksum: `sha-${page}`, description: null, totalCount: 5,
      }));
    },
    async knowledgeAssets() { return []; },
    async studentAssets() { return []; },
  });

  const result = await service.resolveVisualContext({
    scope,
    currentQuestionId: 'question-current',
    resolvedAttachment: null,
    studentImageIds: [],
    rag: { citations: [] },
  });

  assert.deepEqual(result.images.map((image) => image.assetId), ['question-1', 'question-2', 'question-3', 'question-4']);
  assert.equal(result.images.length, 4);
  assert.match(result.text, /QUESTION \(1\)/);
  assert.equal(JSON.stringify(result).includes('totalCount'), false);
});

test('omite imagem que expirou ou não está mais autorizada quando o chat resolve o contexto', async () => {
  const service = new ChatVisualContextService({
    async questionAssets() { return []; }, async knowledgeAssets() { return []; }, async studentAssets() { return []; },
  });
  const result = await service.resolveVisualContext({
    scope, currentQuestionId: null, resolvedAttachment: null, studentImageIds: ['expired-upload'], rag: { citations: [] } as any,
  });
  assert.deepEqual(result.images, []);
});
