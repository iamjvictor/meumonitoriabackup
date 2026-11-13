import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ChatPromptMessage } from '../../models/chat-generation.model.js';
import { ChatVisualImageLoader } from '../../rag/services/chat-visual-image-loader.service.js';
import { ChatVisualContextService } from '../../rag/services/chat-visual-context.service.js';
import { ChatGenerationError, OpenRouterChatGateway } from '../openrouter-chat.gateway.js';

class FixedPromptBuilder {
  calls: unknown[] = [];

  build(input: unknown): ChatPromptMessage[] {
    this.calls.push(input);
    return [
      { role: 'system', content: 'sistema' },
      { role: 'user', content: 'mensagem' },
    ];
  }
}

test('gateway transforma o contrato do chat em completion textual', async () => {
  const promptBuilder = new FixedPromptBuilder();
  const calls: unknown[] = [];
  const gateway = new OpenRouterChatGateway(
    {
      async createChatCompletion(input) {
        calls.push(input);
        return {
          content: '  Resposta final.  ',
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        };
      },
    },
    promptBuilder,
    { model: 'chat-model', maxTokens: 500, temperature: 0.3, timeoutMs: 10_000 },
  );

  const result = await gateway.generate({
    message: 'Explique.',
    history: [],
    questionContext: null,
    monitorId: 'monitor-1',
    subjectId: 'subject-1',
  });

  assert.equal(result.content, 'Resposta final.');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    messages: [
      { role: 'system', content: 'sistema' },
      { role: 'user', content: 'mensagem' },
    ],
    model: 'chat-model',
    maxTokens: 500,
    temperature: 0.3,
    timeoutMs: 10_000,
  });
  assert.equal(promptBuilder.calls.length, 1);
});

test('gateway converte falha do provider em erro estável do chat', async () => {
  const gateway = new OpenRouterChatGateway(
    {
      async createChatCompletion() {
        throw new Error('detalhe interno do provedor');
      },
    },
    new FixedPromptBuilder(),
    { model: 'chat-model', maxTokens: 500, temperature: 0.3, timeoutMs: 10_000 },
  );

  await assert.rejects(
    gateway.generate({
      message: 'Explique.',
      history: [],
      questionContext: null,
      monitorId: 'monitor-1',
      subjectId: 'subject-1',
    }),
    (error: unknown) => error instanceof ChatGenerationError && error.code === 'CHAT_GENERATION_FAILED',
  );
});

test('gateway envia texto e imagem privada ao modelo visual configurado', async () => {
  let received: any;
  const gateway = new OpenRouterChatGateway(
    { async createChatCompletion(input) { received = input; return { content: 'Resposta visual.', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }; } },
    new FixedPromptBuilder(),
    { model: 'text-model', imageModel: 'vision-model', maxTokens: 500, temperature: 0.3, timeoutMs: 10_000 },
    { async load(images: Array<{ assetId: string }>) { return { images: images.map((image, index) => ({ assetId: image.assetId, dataUrl: index === 0 ? 'data:image/jpeg;base64,cGhvdG8=' : 'data:image/png;base64,ZmlndXJl' })), omittedCount: 0 }; } } as any,
  );
  await gateway.generate({
    message: 'O que há na figura?', history: [], questionContext: null, monitorId: 'monitor-1', subjectId: 'subject-1',
    studentId: 'student-1', teacherId: 'teacher-1',
    visualContext: {
      text: 'Figura de questão, página 2.',
      images: [
        { assetId: 'photo-1', page: null, checksum: 'sha-p', description: null, source: 'STUDENT_UPLOAD' },
        { assetId: 'asset-1', page: 2, checksum: 'sha', description: 'Gráfico.', source: 'QUESTION' },
      ],
      contextManifest: [
        { assetId: 'photo-1', page: null, checksum: 'sha-p', source: 'STUDENT_UPLOAD' },
        { assetId: 'asset-1', page: 2, checksum: 'sha', source: 'QUESTION' },
      ],
    },
  });
  assert.equal(received.model, 'vision-model');
  assert.deepEqual(received.messages[1].content, [
    { type: 'text', text: 'mensagem\n\n[IMAGENS VISUAIS ANEXADAS]' },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,cGhvdG8=' } },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,ZmlndXJl' } },
  ]);
});

test('encaminha os bytes íntegros do asset da questão no payload recebido pelo provider', async () => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=', 'base64');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let received: any;
  let downloadedPath: string | null = null;
  const visualContext = await new ChatVisualContextService({
    async questionAssets(questionId, scope) {
      assert.equal(questionId, 'question-q03');
      assert.deepEqual(scope, { studentId: 'student-1', teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1' });
      return [{ assetId: 'asset-q03-page-5', page: 5, checksum: sha256, description: 'Estruturas químicas da tretinoína e isotretinoína.' }];
    },
    async knowledgeAssets() { return []; },
    async studentAssets() { return []; },
  }).resolveVisualContext({
    scope: { studentId: 'student-1', teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1' },
    currentQuestionId: 'question-q03',
    resolvedAttachment: null,
    studentImageIds: [],
    rag: { citations: [] },
  });
  const loader = new ChatVisualImageLoader({
    chatImageAttachment: { async findFirst() { return null; } },
    documentVisualAsset: { async findFirst(args: any) {
      assert.equal(args.where.id, 'asset-q03-page-5');
      assert.equal(args.where.document.teacherId, 'teacher-1');
      assert.equal(args.where.document.monitorId, 'monitor-1');
      assert.equal(args.where.document.subjectId, 'subject-1');
      return { storagePath: 'question/q03/page-5.png', mimeType: 'image/png', checksum: sha256 };
    } },
  } as any, { async download() { throw new Error('student bucket must not be used'); } }, {
    async download(path) {
      downloadedPath = path;
      return { data: new Blob([bytes]), error: null };
    },
  });
  const gateway = new OpenRouterChatGateway(
    { async createChatCompletion(input) { received = input; return { content: 'A tretinoína apresenta um grupo carboxila.', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }; } },
    { build(input: { message: string }) { return [{ role: 'system', content: 'sistema' }, { role: 'user', content: input.message }]; } } as any,
    { model: 'text-model', imageModel: 'vision-model', maxTokens: 500, temperature: 0.3, timeoutMs: 10_000 },
    loader,
  );

  await gateway.generate({
    message: 'Qual grupo funcional aparece na estrutura da tretinoína?',
    history: [], questionContext: null,
    monitorId: 'monitor-1', subjectId: 'subject-1', studentId: 'student-1', teacherId: 'teacher-1',
    visualContext,
  });

  assert.equal(downloadedPath, 'question/q03/page-5.png');
  assert.equal(received.model, 'vision-model');
  const multimodalContent = received.messages[1].content;
  assert.equal(multimodalContent[0].type, 'text');
  assert.match(multimodalContent[0].text, /Qual grupo funcional/);
  assert.equal(multimodalContent[1].type, 'image_url');
  assert.match(multimodalContent[1].image_url.url, /^data:image\/png;base64,/);
  const payloadBytes = Buffer.from(multimodalContent[1].image_url.url.split(',')[1], 'base64');
  assert.equal(createHash('sha256').update(payloadBytes).digest('hex'), sha256);
  assert.deepEqual(received.messages[1].content[1], {
    type: 'image_url', image_url: { url: `data:image/png;base64,${bytes.toString('base64')}` },
  });
});

test('gateway não declara que viu a imagem quando ela expirou ou falhou ao baixar', async () => {
  let received: any;
  const gateway = new OpenRouterChatGateway(
    { async createChatCompletion(input) { received = input; return { content: 'Não consigo ver a imagem.', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }; } },
    new FixedPromptBuilder(),
    { model: 'text-model', imageModel: 'vision-model', maxTokens: 500, temperature: 0.3, timeoutMs: 10_000 },
    { async load() { return { images: [], omittedCount: 1 }; } } as any,
  );
  await gateway.generate({
    message: 'Explique.', history: [], questionContext: null, monitorId: 'monitor-1', subjectId: 'subject-1',
    studentId: 'student-1', teacherId: 'teacher-1',
    visualContext: { text: 'Imagem esperada.', images: [{ assetId: 'expired', page: 2, checksum: 'sha', description: null, source: 'STUDENT_UPLOAD' }], contextManifest: [] },
  });
  assert.equal(received.model, 'vision-model');
  assert.equal(typeof received.messages[1].content, 'string');
  assert.match(received.messages[1].content, /imagem não pôde ser anexada/i);
});

test('gateway falha antes do provider quando o modelo visual não foi configurado', async () => {
  let providerCalled = false;
  const gateway = new OpenRouterChatGateway(
    { async createChatCompletion() { providerCalled = true; return { content: 'resposta', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }; } },
    new FixedPromptBuilder(),
    { model: 'text-model', maxTokens: 100, temperature: 0, timeoutMs: 1000 },
    { async load() { return { images: [], omittedCount: 0, totalBytes: 0 }; } } as any,
  );
  await assert.rejects(gateway.generate({
    message: 'Leia', history: [], questionContext: null, monitorId: 'm', subjectId: 's',
    visualContext: { text: '', images: [{ assetId: 'a', page: 1, checksum: 'x', description: null, source: 'QUESTION' }], contextManifest: [] },
  }), (error: unknown) => error instanceof ChatGenerationError && error.code === 'CHAT_GENERATION_FAILED');
  assert.equal(providerCalled, false);
});

test('gateway transforma rejeição de imagem pelo provider em erro sem afirmar leitura', async () => {
  const gateway = new OpenRouterChatGateway(
    { async createChatCompletion() { throw new Error('model does not accept image input'); } },
    new FixedPromptBuilder(),
    { model: 'text-model', imageModel: 'configured-vision-model', maxTokens: 100, temperature: 0, timeoutMs: 1000 },
    { async load() { return { images: [{ assetId: 'a', dataUrl: 'data:image/png;base64,cG5n' }], omittedCount: 0, totalBytes: 3 }; } } as any,
  );
  await assert.rejects(gateway.generate({
    message: 'Leia', history: [], questionContext: null, monitorId: 'm', subjectId: 's',
    visualContext: { text: '', images: [{ assetId: 'a', page: 1, checksum: 'x', description: null, source: 'QUESTION' }], contextManifest: [] },
  }), (error: unknown) => error instanceof ChatGenerationError && error.code === 'CHAT_GENERATION_FAILED');
});
