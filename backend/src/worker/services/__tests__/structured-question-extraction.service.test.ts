import assert from 'node:assert/strict';
import test from 'node:test';
import { aiModels } from '../../../config/ai-models.config.js';
import { StructuredCompletionError } from '../../client/openrouter.client.js';
import { StructuredQuestionExtractionService } from '../structured-question-extraction.service.js';

const document = {
  id: 'doc', teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicId: null,
  chunks: [
    { id: 'c1', chunkIndex: 0, text: 'Texto teórico e questão 01: calcule dois mais dois. A) 2 B) 3 C) 4 D) 5 E) 6', pages: [1] },
    { id: 'c2', chunkIndex: 1, text: 'Questão 02: explique o resultado e considere o gráfico desta página.', pages: [2] },
  ], images: [],
};

test('envia os textos completos com ID e página e persiste candidatos em revisão com proveniência', async () => {
  const requests: unknown[] = [];
  const saved: unknown[] = [];
  const client = { createStructuredChatCompletion: async (input: unknown) => {
    requests.push(input);
    return { questions: [{ number: '01', statement: 'Calcule dois mais dois.', alternatives: [
      { label: 'A', text: '2' }, { label: 'B', text: '3' }, { label: 'C', text: '4' }, { label: 'D', text: '5' }, { label: 'E', text: '6' },
    ], correctAnswer: null, institution: null, year: null, sourceChunkIds: ['c1'], visualEvidence: [] }] };
  } };
  const repository = { load: async () => document, save: async (_document: unknown, candidate: unknown) => { saved.push(candidate); return 'question-1'; } };
  const service = new StructuredQuestionExtractionService(client as never, repository as never, 1000);
  const result = await service.processDocument(document.id);
  assert.equal(result.chunksProcessed, 2);
  assert.equal(result.questions.length, 1);
  assert.equal(result.llmCalls, 1, 'todo o documento é enviado em uma única chamada estruturada');
  assert.equal(requests.length, 1);
  assert.equal('tools' in (requests[0] as object), false, 'a requisição não registra ferramentas');
  assert.deepEqual((saved[0] as { sourceChunkIds: string[] }).sourceChunkIds, ['c1']);
  const messages = (requests[0] as { messages: Array<{ role: string; content: string | Array<{ text?: string }> }> }).messages;
  const systemPrompt = messages[0]!.content as string;
  assert.match(systemPrompt, /expoentes e índices \(sobrescritos e subscritos\)/);
  assert.match(systemPrompt, /caracteres Unicode/);
  assert.match(systemPrompt, /LaTeX delimitado por cifrões/);
  assert.match(systemPrompt, /Nunca achate um sobrescrito ou subscrito/);
  assert.match(systemPrompt, /se texto extraído e imagem divergirem, siga a imagem apenas quando ela estiver legível/);
  assert.match(systemPrompt, /imagem da página anexada/);
  assert.match(systemPrompt, /Não deduza nem complete símbolos ausentes/);
  assert.match(systemPrompt, /anotação breve entre colchetes/);
  assert.doesNotMatch(systemPrompt, /ferramenta|tool|function calling/i);
  const prompt = messages[1]!.content as Array<{ text?: string }>;
  assert.match(prompt[0]!.text!, /chunkId=c1/);
  assert.match(prompt[0]!.text!, /pages=1/);
  assert.match(prompt[0]!.text!, /Texto teórico e questão 01/);
  assert.match(prompt[0]!.text!, /Questão 02/);
});

test('extractCandidates retorna a estrutura validada sem persistir questões', async () => {
  let saves = 0;
  const candidate = {
    number: '01', statement: 'Calcule dois mais dois.', alternatives: [{ label: 'A', text: '4' }],
    correctAnswer: null, institution: null, year: null, sourceChunkIds: ['c1'], visualEvidence: [],
  };
  const service = new StructuredQuestionExtractionService(
    { createStructuredChatCompletion: async () => ({ questions: [candidate] }) } as never,
    { load: async () => document, save: async () => { saves++; return 'question-1'; } } as never,
    1000,
  );

  const result = await service.extractCandidates(document.id);

  assert.equal(result.llmCalls, 1);
  assert.deepEqual(result.questions, [{
    ...candidate,
    metadata: { questionExtractionOrdinal: 0, sourceEvidenceCorrections: [] },
  }]);
  assert.equal(saves, 0);
});

test('instrui o extrator a preservar afirmações no enunciado e limita opções a A-E', async () => {
  let request: Record<string, any> | undefined;
  const question = {
    number: '28', statement: 'Analise as afirmativas I, II e III e marque a alternativa correta.', alternatives: [
      { label: 'A', text: 'Apenas I.' }, { label: 'B', text: 'Apenas II.' }, { label: 'C', text: 'Apenas III.' },
      { label: 'D', text: 'I e II.' }, { label: 'E', text: 'Todas.' },
    ], correctAnswer: null, institution: null, year: null, sourceChunkIds: ['c1'], visualEvidence: [],
  };
  const service = new StructuredQuestionExtractionService(
    { createStructuredChatCompletion: async (input: Record<string, any>) => { request = input; return { questions: [question] }; } } as never,
    { load: async () => document, save: async () => 'question-28' } as never,
    1000,
  );

  await service.extractCandidates(document.id);

  const alternativesSchema = request?.schema.properties.questions.items.properties.alternatives;
  assert.equal(alternativesSchema.maxItems, 5);
  assert.deepEqual(alternativesSchema.items.properties.label.enum, ['A', 'B', 'C', 'D', 'E']);
  const systemPrompt = request?.messages[0].content as string;
  assert.match(systemPrompt, /no máximo cinco alternativas, somente A, B, C, D e E/);
  assert.match(systemPrompt, /itens numerados como I, II e III.*devem permanecer no enunciado/i);
  assert.match(systemPrompt, /não os transforme em opções/i);
});

test('rejeita alternativas excedentes ou com rótulos fora de A-E na resposta do extrator', async () => {
  const invalidQuestion = {
    number: '28', statement: 'Analise as afirmativas I, II e III com cuidado.', alternatives: [
      ...['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Opção ${label}` })),
      { label: 'F', text: 'Opção F excedente' },
    ], correctAnswer: null, institution: null, year: null, sourceChunkIds: ['c1'], visualEvidence: [],
  };
  let saves = 0;
  const service = new StructuredQuestionExtractionService(
    { createStructuredChatCompletion: async () => ({ questions: [invalidQuestion] }) } as never,
    { load: async () => document, save: async () => { saves++; return 'question-invalid'; } } as never,
    1000,
  );

  await assert.rejects(service.extractCandidates(document.id), /Resposta estruturada inválida/);
  assert.equal(saves, 0);
});

test('rejeita rótulos de alternativa duplicados no extrator', async () => {
  const duplicateQuestion = {
    number: '01', statement: 'Selecione a alternativa correta para o enunciado.', alternatives: [
      { label: 'A', text: 'Opção A' }, { label: 'B', text: 'Opção B' }, { label: 'C', text: 'Opção C' },
      { label: 'D', text: 'Opção D' }, { label: 'D', text: 'Outra opção D' },
    ], correctAnswer: null, institution: null, year: null, sourceChunkIds: ['c1'], visualEvidence: [],
  };
  const service = new StructuredQuestionExtractionService(
    { createStructuredChatCompletion: async () => ({ questions: [duplicateQuestion] }) } as never,
    { load: async () => document, save: async () => 'question-invalid' } as never,
    1000,
  );

  await assert.rejects(service.extractCandidates(document.id), /Resposta estruturada inválida/);
});

test('rejeita citações a chunks não enviados para impedir mistura entre questões', async () => {
  const client = { createStructuredChatCompletion: async () => ({ questions: [{
    number: '01', statement: 'Enunciado suficientemente longo.', alternatives: [], correctAnswer: null,
    institution: null, year: null, sourceChunkIds: ['outro-documento'], visualEvidence: [],
  }] }) };
  const repository = { load: async () => document, save: async () => 'question-1' };
  const service = new StructuredQuestionExtractionService(client as never, repository as never, 1000);
  await assert.rejects(service.processDocument(document.id), /não pertence à janela/);
});

test('persiste a resposta estruturada sem reescrever expoente, metadados ou proveniência', async () => {
  const llmQuestion = {
    number: '07',
    statement: 'Qual valor corresponde à ordem de grandeza indicada?',
    alternatives: [
      { label: 'A', text: '3 × 10^17' },
      { label: 'B', text: '3 × 10^16' },
    ],
    correctAnswer: null,
    institution: 'Fuvest',
    year: 2024,
    sourceChunkIds: ['c1', 'c2'],
    visualEvidence: [],
  };
  let savedCandidate: Record<string, unknown> | undefined;
  const client = { createStructuredChatCompletion: async () => ({ questions: [llmQuestion] }) };
  const repository = {
    load: async () => document,
    save: async (_document: unknown, candidate: Record<string, unknown>) => {
      savedCandidate = candidate;
      return 'question-q07';
    },
  };
  const service = new StructuredQuestionExtractionService(client as never, repository as never, 1000);

  await service.processDocument(document.id);

  assert.ok(savedCandidate);
  assert.equal(savedCandidate.statement, llmQuestion.statement);
  assert.deepEqual(savedCandidate.alternatives, llmQuestion.alternatives);
  assert.equal((savedCandidate.alternatives as Array<{ text: string }>)[0]!.text, '3 × 10^17');
  assert.equal(savedCandidate.number, '07');
  assert.equal(savedCandidate.institution, 'Fuvest');
  assert.equal(savedCandidate.year, 2024);
  assert.deepEqual(savedCandidate.sourceChunkIds, ['c1', 'c2']);
});

test('continua rejeitando resposta estruturada inválida pelo schema antes da persistência', async () => {
  let saves = 0;
  const client = { createStructuredChatCompletion: async () => ({ questions: [{
    number: '01', statement: 'curto', alternatives: [], correctAnswer: null,
    institution: null, year: null, sourceChunkIds: ['c1'], visualEvidence: [],
  }] }) };
  const repository = {
    load: async () => document,
    save: async () => { saves++; return 'question-invalid'; },
  };
  const service = new StructuredQuestionExtractionService(client as never, repository as never, 1000);

  await assert.rejects(service.processDocument(document.id), /Resposta estruturada inválida/);
  assert.equal(saves, 0);
});

test('usa uma única chamada para todos os chunks e falha sem retry quando a resposta é truncada', async () => {
  const chunks = Array.from({ length: 4 }, (_, index) => ({
    id: `c${index}`, chunkIndex: index, text: `Questão ${index + 1}: texto original ${'detalhe '.repeat(20)}`, pages: [index + 1], status: 'READY',
  }));
  const calls: Array<{ content: string; maxTokens?: number; timeoutMs?: number; reasoningEffort?: string }> = [];
  const client = { createStructuredChatCompletion: async (input: { messages: Array<{ content: string | Array<{ text?: string }> }>; maxTokens?: number; timeoutMs?: number; reasoningEffort?: string }) => {
    const userContent = input.messages[1]!.content;
    const prompt = typeof userContent === 'string' ? userContent : userContent.map((part) => part.text ?? '').join(' ');
    calls.push({ content: prompt, maxTokens: input.maxTokens, timeoutMs: input.timeoutMs, reasoningEffort: input.reasoningEffort });
    throw new StructuredCompletionError('MODEL_OUTPUT_TRUNCATED', 'cut', { model: 'test', finishReason: 'length' });
  } };
  const repository = { load: async () => ({ ...document, chunks }), save: async () => { assert.fail('truncamento não deve persistir candidata'); } };
  const service = new StructuredQuestionExtractionService(client as never, repository as never, 4000);
  await assert.rejects(service.processDocument(document.id), /QUESTION_EXTRACTION_OUTPUT_TRUNCATED/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]!.content.includes('chunkId=c0') && calls[0]!.content.includes('chunkId=c3'));
  assert.equal(calls[0]!.maxTokens, null, 'document_questions não aplica teto local de saída');
  assert.equal(calls[0]!.timeoutMs, null, 'document_questions não aplica timeout local');
  assert.equal(calls[0]!.reasoningEffort, aiModels.questionExtractionReasoningEffort);
});

test('falha antes da chamada se o documento inteiro excede o limite de entrada', async () => {
  let calls = 0;
  const client = { createStructuredChatCompletion: async () => { calls++; return { questions: [] }; } };
  const repository = { load: async () => document, save: async () => 'question' };
  const service = new StructuredQuestionExtractionService(client as never, repository as never, 20);
  await assert.rejects(service.processDocument(document.id), /QUESTION_EXTRACTION_INPUT_TOO_LARGE/);
  assert.equal(calls, 0);
});

test('envia imagem vinculada como entrada multimodal com proveniência e persiste o asset escolhido', async () => {
  const asset = { id: 'asset-figure', assetKind: 'FIGURE', pageNumber: 1, storagePath: 'private/figure.png', mimeType: 'image/png', chunkIds: ['c1'], width: 200, height: 120, caption: null, bbox: [10, 20, 90, 100], readingOrder: 4, sourceItemRef: 'item-4' };
  let capturedMessages: Array<{ content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [];
  let linkedImages: unknown[] = [];
  const client = { createStructuredChatCompletion: async (input: { messages: typeof capturedMessages }) => {
    capturedMessages = input.messages;
    return { questions: [{ number: '01', statement: 'Interprete o gráfico apresentado.', alternatives: [], correctAnswer: null,
      institution: null, year: null, sourceChunkIds: ['c1'], visualEvidence: [{ assetId: asset.id, role: 'STATEMENT', alternativeLabel: null, anchorText: 'gráfico apresentado' }] }] };
  } };
  const repository = { load: async () => ({ ...document, images: [asset] }), save: async (_doc: unknown, _candidate: unknown, images: unknown[]) => { linkedImages = images; return 'question-visual'; } };
  const service = new StructuredQuestionExtractionService(client as never, repository as never, 1000,
    async () => ({ dataUrl: 'data:image/png;base64,cG5n', error: false }));
  const result = await service.processDocument(document.id);
  const userContent = capturedMessages[1]!.content;
  assert.ok(Array.isArray(userContent));
  const serialized = JSON.stringify(userContent);
  assert.match(serialized, /asset-figure/);
  assert.match(serialized, /10,20,90,100/);
  assert.match(serialized, /item-4/);
  assert.match(serialized, /data:image\/png;base64,cG5n/);
  assert.deepEqual(linkedImages, [asset]);
  assert.deepEqual(result.questions[0]!.visualAssetIds, ['asset-figure']);
});
