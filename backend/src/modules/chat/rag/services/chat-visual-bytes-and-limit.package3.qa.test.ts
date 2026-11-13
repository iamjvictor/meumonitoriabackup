import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ChatVisualContextService } from './chat-visual-context.service.js';
import { ChatVisualImageLoader } from './chat-visual-image-loader.service.js';
import { OpenRouterChatGateway } from '../../providers/openrouter-chat.gateway.js';

const scope = { studentId: 'student-qa', teacherId: 'teacher-qa', monitorId: 'monitor-qa', subjectId: 'subject-qa' };

test('reserva o limite visual para os assets da questão e anuncia uploads/RAG omitidos', async () => {
  const service = new ChatVisualContextService({
    async questionAssets() { return [1, 2, 3, 4].map((page) => ({ assetId: `question-${page}`, page, checksum: `question-sha-${page}`, description: null })); },
    async studentAssets() { return [{ assetId: 'student-upload', page: null, checksum: 'student-sha', description: null }]; },
    async knowledgeAssets() { return [{ assetId: 'knowledge-image', page: 9, checksum: 'knowledge-sha', description: null }]; },
  });
  const result = await service.resolveVisualContext({
    scope, currentQuestionId: 'question-current', resolvedAttachment: null, studentImageIds: ['student-upload'],
    rag: { citations: [{ visualAssetIds: ['knowledge-image'] }] },
  });

  assert.deepEqual(result.images.map((image) => image.assetId), ['question-1', 'question-2', 'question-3', 'question-4']);
  assert.match(result.text, /limite de 4/i);
  assert.match(result.text, /STUDENT_UPLOAD/);
  assert.match(result.text, /KNOWLEDGE/);
  assert.doesNotMatch(result.text, /não anexadas por causa do limite de 4\. Fontes omitidas: QUESTION/);
});

test('checksum divergente omite o asset e orienta o modelo a não alegar leitura visual', async () => {
  const actualBytes = Buffer.from('corrupted-storage-image');
  let received: any;
  const loader = new ChatVisualImageLoader({
    chatImageAttachment: { async findFirst() { return null; } },
    documentVisualAsset: { async findFirst() { return { storagePath: 'private/corrupt.png', mimeType: 'image/png', checksum: createHash('sha256').update('expected-image').digest('hex') }; } },
  } as any, { async download() { throw new Error('unused'); } }, {
    async download(path) { assert.equal(path, 'private/corrupt.png'); return { data: new Blob([actualBytes]), error: null }; },
  });
  const gateway = new OpenRouterChatGateway(
    { async createChatCompletion(input) { received = input; return { content: 'Não posso verificar a figura.', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }; } },
    { build() { return [{ role: 'system', content: 'system' }, { role: 'user', content: 'Leia a imagem.' }]; } } as any,
    { model: 'text-model', imageModel: 'vision-model', maxTokens: 200, temperature: 0, timeoutMs: 1000 }, loader,
  );

  await gateway.generate({
    message: 'Leia a imagem.', history: [], questionContext: null, monitorId: scope.monitorId, subjectId: scope.subjectId,
    studentId: scope.studentId, teacherId: scope.teacherId,
    visualContext: { text: 'Figura página 3', images: [{ assetId: 'corrupt-asset', page: 3, checksum: 'wrong-checksum', description: 'Figura da questão.', source: 'QUESTION' }], contextManifest: [] },
  });

  assert.equal(typeof received.messages[1].content, 'string');
  assert.match(received.messages[1].content, /imagem não pôde ser anexada/i);
  assert.doesNotMatch(JSON.stringify(received.messages[1].content), /data:image/);
  assert.doesNotMatch(received.messages[1].content, /Figura da questão/);
});
