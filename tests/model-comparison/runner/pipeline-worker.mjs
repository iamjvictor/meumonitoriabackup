import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function assertIsolatedDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.port !== '56322' || !/^mc_[a-z0-9_]+$/u.test(url.pathname.slice(1))) {
    throw new Error('Worker recusado: DATABASE_URL fora da allowlist local do comparador.');
  }
  if (process.env.MODEL_COMPARISON_ALLOW_PAID !== '1' || process.env.MODEL_COMPARISON_READY !== '1' || process.env.MODEL_COMPARISON_PROVIDER_CATALOG_CONFIRMED !== '1') {
    throw new Error('Worker recusado: runner não confirmou preflight e autorização local.');
  }
}

function safeQuestion(row) {
  return {
    id: row.id, number: row.questionNumber == null ? null : String(row.questionNumber).padStart(2, '0'),
    statement: row.text, alternatives: Array.isArray(row.alternatives) ? row.alternatives : [],
    correctAnswer: row.correctAnswer, explanation: row.explanation, status: row.status,
    reviewDecision: row.metadata?.qualityReview?.decision ?? row.metadata?.reviewDecision ?? null,
    evidence: row.metadata?.evidence ?? row.sources?.map((source) => source.excerpt).find((value) => typeof value === 'string' && value.trim()) ?? null,
    evidenceStatus: row.metadata?.evidence != null || row.sources?.some((source) => typeof source.excerpt === 'string' && source.excerpt.trim()) ? 'VERIFIED_FROM_PERSISTED_SOURCE' : 'NAO_VERIFICADO',
    missingFields: Array.isArray(row.metadata?.missingFields) ? row.metadata.missingFields : [],
    missingFieldsStatus: Array.isArray(row.metadata?.missingFields) ? 'PERSISTED' : 'NAO_VERIFICADO',
  };
}

export function summarizeQuestionQuality(questions) {
  const checkedQuestions = questions.map((question) => ({ ...question }));
  for (const question of checkedQuestions) {
    const alternatives = Array.isArray(question.alternatives) ? question.alternatives : [];
    const labels = alternatives.map((alternative) => String(alternative.label ?? '').toUpperCase()).sort().join('');
    question.assertions = {
      alternativesABCDE: labels === 'ABCDE',
      correctAnswerMatchesAlternative: alternatives.some((alternative) => String(alternative.label ?? '').toUpperCase() === String(question.correctAnswer ?? '').toUpperCase() && Boolean(String(alternative.text ?? '').trim())),
      explanationUnder700Chars: typeof question.explanation === 'string' && question.explanation.length <= 700,
      evidenceUnder300Chars: question.evidenceStatus === 'VERIFIED_FROM_PERSISTED_SOURCE' ? typeof question.evidence === 'string' && question.evidence.length <= 300 : null,
      missingFieldsEmpty: question.missingFieldsStatus === 'PERSISTED' ? Array.isArray(question.missingFields) && question.missingFields.length === 0 : null,
      missingFieldsVerification: question.missingFieldsStatus ?? 'NAO_VERIFICADO',
    };
  }
  const fields = ['alternativesABCDE','correctAnswerMatchesAlternative','explanationUnder700Chars','evidenceUnder300Chars','missingFieldsEmpty'];
  const byQuestion = checkedQuestions.map((question) => {
    const failedFields = fields.filter((field) => question.assertions[field] === false);
    const unverifiedFields = fields.filter((field) => question.assertions[field] === null);
    return { number: question.number, status: failedFields.length ? 'FAILED' : unverifiedFields.length ? 'PARTIAL_UNVERIFIED' : 'PASSED', failedFields, unverifiedFields };
  });
  const values = checkedQuestions.flatMap((question) => fields.map((field) => question.assertions[field]));
  return {
    questions: checkedQuestions,
    qualityChecks: {
      status: values.some((value) => value === false) ? 'FAILED' : values.some((value) => value === null) ? 'PARTIAL_UNVERIFIED' : 'PASSED',
      passed: values.filter((value) => value === true).length,
      failed: values.filter((value) => value === false).length,
      notVerified: values.filter((value) => value === null).length,
      total: values.length,
      byQuestion,
    },
  };
}

async function main({ outputDir, runId, testName, round }) {
  assertIsolatedDatabase();
  const { installOpenRouterInterceptor } = await import('./openrouter-interceptor.mjs');
  const restoreFetch = installOpenRouterInterceptor({ testName, runId, outputDir });
  // Imports occur only after the isolated env has been built by the parent runner.
  const { prisma } = await import('../../../backend/src/lib/prisma.ts');
  const { QuestionExtractionService } = await import('../../../backend/src/worker/services/question-extraction.service.ts');
  const { DocumentVisualIndexingService } = await import('../../../backend/src/worker/services/document-visual-indexing.service.ts');
  const { OpenRouterClient } = await import('../../../backend/src/worker/client/openrouter.client.ts');
  const { OpenRouterChatGateway } = await import('../../../backend/src/modules/chat/providers/openrouter-chat.gateway.ts');
  const { ChatVisualContextService } = await import('../../../backend/src/modules/chat/rag/services/chat-visual-context.service.ts');
  const { ChatVisualImageLoader } = await import('../../../backend/src/modules/chat/rag/services/chat-visual-image-loader.service.ts');
  const { supabaseAdmin } = await import('../../../backend/src/lib/supabase.ts');
  const visualChatFixture = JSON.parse(await readFile(resolve(ROOT, 'dbtemp/artifacts/2d7bc13c-7573-435d-b43a-37e68702ee37/visual-chat.json'), 'utf8'));
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, 'pipeline-started.json'), JSON.stringify({ runId, test: testName, round, startedAt: new Date().toISOString() }) + '\n', { mode: 0o600, flag: 'wx' });
  const startedAt = Date.now();
  const document = await prisma.monitorDocument.findFirst({ where: { originalName: 'Quimica-3.pdf' }, select: { id: true, teacherId: true, monitorId: true, subjectId: true } });
  if (!document) throw new Error('Quimica-3.pdf ausente no banco de teste importado.');

  const documents = await prisma.monitorDocument.findMany({ orderBy: { originalName: 'asc' }, select: { id: true, originalName: true } });
  if (documents.length !== 3) throw new Error(`Esperados três documentos baseline; encontrados ${documents.length}.`);
  const assets = await prisma.documentVisualAsset.findMany({ where: { documentId: { in: documents.map((row) => row.id) } }, orderBy: [{ documentId: 'asc' }, { pageNumber: 'asc' }, { id: 'asc' }], select: { id: true } });
  const visualIndexer = new DocumentVisualIndexingService();
  const visualResults = [];
  for (const asset of assets) {
    const result = await visualIndexer.describeAndIndexAsset(asset.id);
    visualResults.push({ assetId: asset.id, status: result.descriptionStatus });
  }
  const visualDescriptions = await prisma.documentVisualAsset.findMany({
    where: { id: { in: assets.map((asset) => asset.id) } },
    orderBy: [{ documentId: 'asc' }, { pageNumber: 'asc' }, { id: 'asc' }],
    select: { id: true, documentId: true, pageNumber: true, checksum: true, visualIndex: { select: { description: true, descriptionStatus: true, descriptionModel: true, embeddingModel: true } } },
  });

  const extractionStart = Date.now();
  const extraction = await new QuestionExtractionService().processDocument(document.id);
  const extractionMs = Date.now() - extractionStart;
  const questionRows = await prisma.question.findMany({
    where: { sources: { some: { documentId: document.id } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, text: true, alternatives: true, correctAnswer: true, explanation: true, status: true, metadata: true, sources: { select: { excerpt: true, documentBlock: { select: { questionNumber: true } } } }, visualAssets: { select: { visualAssetId: true } } },
  });
  const questionOutputs = questionRows.map((row) => safeQuestion({ ...row, questionNumber: row.sources.map((source) => source.documentBlock?.questionNumber).find((value) => value != null) })).sort((left, right) => Number(left.number) - Number(right.number));
  const { questions, qualityChecks } = summarizeQuestionQuality(questionOutputs);
  const numbers = questions.map((question) => question.number);
  if (questions.length !== 10 || new Set(questions.map((question) => question.id)).size !== 10 || new Set(numbers).size !== 10 || questions.some((question) => question.status !== 'PENDING_REVIEW')) {
    throw new Error(`Assertion local falhou: esperadas 10 questões únicas PENDING_REVIEW; observed=${questions.length}, statuses=${[...new Set(questions.map((q) => q.status))].join(',')}.`);
  }

  // Use the previously recorded Q03 question verbatim. No substitute prompt is constructed.
  const q03 = questionRows.find((row) => row.sources.some((source) => source.documentBlock?.questionNumber === '03' || source.documentBlock?.questionNumber === '3'));
  const visualReference = JSON.parse(await readFile(resolve(ROOT, 'tests/model-comparison/elementos_visuais_referencia.json'), 'utf8'))
    .questions.find((item) => item.number === '03');
  let q03AssetIds = q03?.visualAssets.map((link) => link.visualAssetId) ?? [];
  let visualSource = 'QUESTION_LINK';
  if (q03 && q03AssetIds.length === 0 && visualReference?.asset?.sha256) {
    const referenceAsset = await prisma.documentVisualAsset.findFirst({ where: { documentId: document.id, checksum: visualReference.asset.sha256 }, select: { id: true } });
    if (referenceAsset) { q03AssetIds = [referenceAsset.id]; visualSource = 'KNOWLEDGE_CITATION_FALLBACK'; }
  }
  const chatQuestion = {
    questionId: q03?.id, questionNumber: '03', promptSource: 'baseline visual-chat.json exact prompt field',
    linkedImageCount: q03AssetIds.length, imageContextPassed: false, identifiedVisibleDifference: null,
    status: q03 && q03AssetIds.length ? 'NOT_RUN' : 'NAO_VERIFICADO',
    visualSource, reason: q03 && q03AssetIds.length ? null : 'Questão 03 ou asset de referência não foi recuperado no destino.',
  };
  if (chatQuestion.status === 'NOT_RUN') {
    const assetRows = await prisma.documentVisualAsset.findMany({ where: { id: { in: q03AssetIds } }, select: { id: true, pageNumber: true, checksum: true, storagePath: true, mimeType: true } });
    const contextService = new ChatVisualContextService({
      questionAssets: async () => [],
      studentAssets: async () => [],
      knowledgeAssets: async (ids) => assetRows.filter((asset) => ids.includes(asset.id)).map((asset) => ({ assetId: asset.id, page: asset.pageNumber, checksum: asset.checksum, description: null })),
    });
    // Reuse the repository-backed resolver for image authorization. The injected image loader
    // reads only verified objects from local dbtemp Storage and records hashes, never image bytes.
    const visualContext = await contextService.resolveVisualContext({
      scope: { studentId: '00000000-0000-4000-8000-000000000001', teacherId: document.teacherId, monitorId: document.monitorId, subjectId: document.subjectId },
      currentQuestionId: null, resolvedAttachment: null,
      rag: { citations: [{ visualAssetIds: assetRows.map((asset) => asset.id) }] }, studentImageIds: [],
    });
    const baseImageLoader = new ChatVisualImageLoader(
      { documentVisualAsset: { findFirst: async ({ where }) => { const row = assetRows.find((item) => item.id === where.id); return row ? { storagePath: row.storagePath, mimeType: row.mimeType, checksum: row.checksum } : null; } }, chatImageAttachment: { findFirst: async () => null } },
      { download: async () => ({ data: null, error: new Error('unused') }) },
      { download: async (path) => supabaseAdmin.storage.from('document-parser-artifacts').download(path) },
    );
    let loadedImages = [];
    const imageLoader = { async load(images, scope) { const loaded = await baseImageLoader.load(images, scope); loadedImages = loaded.images; return loaded; } };
    const client = new OpenRouterClient();
    const gateway = new OpenRouterChatGateway(client, undefined, {
      model: process.env.CHAT_AI_MODEL ?? 'google/gemini-2.5-flash', imageModel: process.env.CHAT_IMAGE_MODEL,
      maxTokens: Number(process.env.CHAT_AI_MAX_TOKENS ?? 600), temperature: Number(process.env.CHAT_AI_TEMPERATURE ?? 0.2), timeoutMs: Number(process.env.CHAT_AI_TIMEOUT_MS ?? 30000),
    }, imageLoader);
    const result = await gateway.generate({
      requestId: `${runId}-q03`, message: visualChatFixture.prompt, history: [], questionContext: {
        questionId: q03.id, monitorId: document.monitorId, subjectId: document.subjectId,
        statement: q03.text, options: Array.isArray(q03.alternatives) ? q03.alternatives : [],
      }, monitorId: document.monitorId, subjectId: document.subjectId, teacherId: document.teacherId,
      studentId: '00000000-0000-4000-8000-000000000001', visualContext,
    });
    // Keep the response only in the protected run artifact; calls.jsonl never contains prompt or response.
    chatQuestion.status = 'COMPLETED';
    chatQuestion.response = result.content;
    chatQuestion.attachedAssetIds = loadedImages.map((image) => image.assetId);
    chatQuestion.contextManifest = visualContext.contextManifest;
    const expectedAssetHash = visualReference?.asset?.sha256;
    chatQuestion.imageContextPassed = loadedImages.some((image) => image.sha256 === expectedAssetHash);
    const responseText = result.content.toLocaleLowerCase('pt-BR');
    const visibleDifferenceCues = {
      labels: ['tretinoína', 'isotretinoína'].every((term) => responseText.includes(term)),
      extendedStructure: /estendid|linear|reta/iu.test(responseText),
      foldedStructure: /dobr|curv/iu.test(responseText),
      carboxyl: /cooh|carboxila/iu.test(responseText),
    };
    chatQuestion.expectedVisibleDifference = visualReference?.expectedVisibleDifference ?? null;
    chatQuestion.visibleDifferenceCues = visibleDifferenceCues;
    chatQuestion.identifiedVisibleDifference = Object.values(visibleDifferenceCues).every(Boolean);
    chatQuestion.imageContextSha256 = expectedAssetHash;
  }

  const summary = {
    runId, test: testName, round, executionMode: 'pipeline', pipelineExecuted: true,
    startedAt: new Date(startedAt).toISOString(), totalPipelineMs: Date.now() - startedAt,
    visual: { status: visualResults.length === 31 ? 'COMPLETED' : 'PARTIAL', assetsRequested: assets.length, assetsIndexed: visualResults.length, results: visualResults, descriptions: visualDescriptions.map((asset) => ({ assetId: asset.id, documentId: asset.documentId, page: asset.pageNumber, checksum: asset.checksum, status: asset.visualIndex?.descriptionStatus ?? 'MISSING', description: asset.visualIndex?.description ?? null, model: asset.visualIndex?.descriptionModel ?? null, embeddingModel: asset.visualIndex?.embeddingModel ?? null })) },
    extraction: { status: 'DETERMINISTIC_SOURCE_EXTRACTION', llmAttributedToStatementExtraction: false, durationMs: extractionMs, returnedCandidateCount: Array.isArray(extraction) ? extraction.length : null },
    questionCount: questions.length, questions, qualityChecks, imageChatQ03: chatQuestion,
  };
  await writeFile(resolve(outputDir, 'pipeline-result.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await prisma.$disconnect();
  restoreFetch();
  return summary;
}

function parseCli(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) result[argv[i].slice(2)] = argv[++i];
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseCli(process.argv.slice(2));
  main({ outputDir: args.output, runId: args.run, testName: args.test, round: Number(args.round) })
    .then((result) => process.stdout.write(JSON.stringify({ status: 'PIPELINE_COMPLETED', runId: result.runId, questionCount: result.questionCount, visualAssets: result.visual.assetsIndexed, chatQ03: result.imageChatQ03.status }) + '\n') )
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'worker failed'}\n`); process.exitCode = 1; });
}
