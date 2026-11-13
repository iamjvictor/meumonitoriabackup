import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const backend = resolve(root, 'backend');
const require = createRequire(resolve(backend, 'package.json'));
const dotenv = require('dotenv');
const envFile = dotenv.parse(await readFile(resolve(backend, '.env')));
const status = spawnSync('supabase', ['status', '--workdir', 'dbtemp', '--output', 'env'], { cwd: root, encoding: 'utf8' });
if (status.status !== 0) throw new Error('Supabase local dbtemp não está disponível.');
const local = Object.fromEntries(status.stdout.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
}));
Object.assign(process.env, envFile, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
  SUPABASE_URL: local.API_URL,
  SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  REDIS_URL: 'redis://127.0.0.1:6379',
  ASAAS_WEBHOOK_URL: 'http://127.0.0.1:33671/api/webhooks/asaas',
});

const { prisma } = await import('../backend/src/lib/prisma.ts');
const { OpenRouterClient } = await import('../backend/src/worker/client/openrouter.client.ts');
const { PrismaQuestionGraphContextProvider } = await import('../backend/src/worker/services/question-graph/prisma-context.provider.ts');
const { createQuestionGraphInput, createQuestionReviewerGraph } = await import('../backend/src/worker/services/question-graph/reviewer.ts');

const allFixtures = [
  {
    key: 'quimica-3',
    title: 'Quimica-3',
    pdf: 'tests/document-parser/teacher-materials/Quimica-3.pdf',
    extracted: 'tests/document-parser/results/quimica-3-formula-enrichment-real-2026-11-06.json',
    documentId: 'e2000000-0000-4000-8000-000000000012',
    contextMode: 'local-db-chunks-and-figures',
  },
  {
    key: 'simulado-pedro-lucas',
    title: 'Simulado Pedro Lucas',
    pdf: 'tests/document-parser/documentos-professor/Simulado Pedro Lucas.pdf',
    extracted: 'tests/document-parser/results/simulado-pedro-lucas-formula-enrichment-real-2026-11-06.json',
    contextMode: 'full-pdf-text; no question figures found by parser',
  },
  {
    key: 'iff-selecao-2010-40-questions',
    title: 'IFF Seleção 2010 (40 questões)',
    pdf: 'tests/document-parser/iff-provas-workspace/iff-selecao-2010-pages-1-30.pdf',
    extracted: 'tests/document-parser/iff-provas-workspace/extraction/structured-llm-run-001.json',
    contextMode: 'full selectable PDF text; visual assets excluded from this scale run',
  },
];
const fixtureFilter = process.argv[2];
const fixtures = fixtureFilter ? allFixtures.filter(({ key }) => key === fixtureFilter) : allFixtures;
if (!fixtures.length) throw new Error(`Fixture desconhecido: ${fixtureFilter}`);
const requestedQuestionNumbers = process.argv[3]?.split(',').map((number) => number.trim()).filter(Boolean);

class WholePdfTextContextProvider {
  constructor(text) { this.text = text; }
  async load() { return { text: this.text, images: [] }; }
}

const model = envFile.QUESTION_EXTRACTION_MODEL || 'deepseek/deepseek-v4.1-flash';
const outputDirectory = resolve(root, 'dbtemp/artifacts/question-reviewer-full-pdfs');
await mkdir(outputDirectory, { recursive: true });

try {
  const summaries = [];
  for (const fixture of fixtures) {
    const pdfPath = resolve(root, fixture.pdf);
    const extracted = JSON.parse(await readFile(resolve(root, fixture.extracted), 'utf8'));
    let candidates = extracted.questions.map((question) => ({
      id: question.id,
      number: question.number ?? null,
      statement: question.statement,
      alternatives: question.alternatives ?? [],
      correctAnswer: question.correctAnswer ?? null,
      institution: question.institution ?? null,
      year: question.year ?? null,
      sourceChunkIds: question.sourceChunkIds ?? [],
      visualEvidence: question.visualEvidence ?? [],
      visualAssetIds: question.visualAssetIds ?? [],
      kind: question.kind,
    }));
    if (requestedQuestionNumbers?.length) {
      const wanted = new Set(requestedQuestionNumbers);
      candidates = candidates.filter((candidate) => wanted.has(String(candidate.number ?? '')));
      const found = new Set(candidates.map((candidate) => String(candidate.number ?? '')));
      const missing = requestedQuestionNumbers.filter((number) => !found.has(number));
      if (missing.length) throw new Error(`Questões não encontradas na fixture ${fixture.key}: ${missing.join(', ')}`);
    }

    let contextProvider;
    if (fixture.documentId) {
      const questions = await prisma.question.findMany({
        where: { sources: { some: { documentId: fixture.documentId } } },
        select: { id: true, text: true, metadata: true, sources: { where: { documentId: fixture.documentId }, select: { chunkId: true } } },
      });
      const byNumber = new Map(questions.map((question) => [String(question.metadata?.questionNumber ?? ''), question]));
      candidates = candidates.map((candidate) => {
        const stored = byNumber.get(String(candidate.number ?? ''));
        if (!stored) return candidate;
        const visuals = Array.isArray(stored.metadata?.visualEvidence) ? stored.metadata.visualEvidence : [];
        return {
          ...candidate,
          sourceChunkIds: [...new Set(stored.sources.map((source) => source.chunkId))],
          visualEvidence: visuals.map((visual) => ({
            assetId: visual.assetId,
            role: visual.role,
            alternativeLabel: visual.alternativeLabel ?? null,
            anchorText: visual.anchorText ?? '',
          })),
          visualAssetIds: [...new Set(visuals.map((visual) => visual.assetId).filter(Boolean))],
        };
      });
      contextProvider = new PrismaQuestionGraphContextProvider();
    } else {
      const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      contextProvider = new WholePdfTextContextProvider(text);
    }

    const imageAssetIds = [...new Set(candidates.flatMap((candidate) => candidate.visualAssetIds ?? []))];
    const state = createQuestionGraphInput({
      executionId: `full-pdf-review:${fixture.key}:${Date.now()}`,
      documentId: fixture.documentId ?? `local-fixture:${fixture.key}`,
      documentVersion: extracted.sha256,
      model,
      promptVersion: 'question-reviewer-full-pdf-2026-11-06',
      contextRefs: { chunkIds: [...new Set(candidates.flatMap((candidate) => candidate.sourceChunkIds))], pageNumbers: [], formulaEvidenceRefs: [], imageAssetIds: [] },
      candidates,
    });
    const openRouter = new OpenRouterClient();
    let llmCalls = 0;
    const llmUsage = [];
    const alternativesAgentResponses = [];
    const client = {
      async createStructuredChatCompletion(input) {
        llmCalls += 1;
        const callStartedAt = Date.now();
        let usageRecorded = false;
        const originalOnUsage = input.onUsage;
        input.onUsage = (usage) => {
          usageRecorded = true;
          llmUsage.push({ schemaName: input.schemaName, durationMs: Date.now() - callStartedAt, ...usage });
          originalOnUsage?.(usage);
        };
        try {
          const completion = await openRouter.createStructuredChatCompletion(input);
          if (input.schemaName === 'question_alternatives_completion') alternativesAgentResponses.push(completion);
          return completion;
        } catch (error) {
          if (!usageRecorded) {
            llmUsage.push({ schemaName: input.schemaName, durationMs: Date.now() - callStartedAt, failed: true, errorCode: error?.code ?? 'UNKNOWN' });
          }
          throw error;
        }
      },
    };
    // The graph revisits the reviewer after each of up to two agents per question.
    const result = await createQuestionReviewerGraph({ contextProvider, client }).invoke(state, {
      recursionLimit: Math.max(25, candidates.length * 4 + 5),
    });
    const payload = {
      document: fixture.title,
      inputPdf: fixture.pdf,
      database: 'dbtemp local only',
      persisted: false,
      model,
      contextMode: fixture.contextMode,
      sourceQuestionCount: candidates.length,
      llmCalls,
      alternativesAgentResponses,
      graphStage: result.stage,
      graphRoute: result.selectedRoute,
      outputQuestionCount: result.backendOutput.length,
      llmUsage,
      totalDurationMs: llmUsage.reduce((total, call) => total + call.durationMs, 0),
      usageTotals: llmUsage.reduce((totals, call) => ({
        promptTokens: totals.promptTokens + (call.promptTokens ?? 0),
        completionTokens: totals.completionTokens + (call.completionTokens ?? 0),
        reasoningTokens: totals.reasoningTokens + (call.reasoningTokens ?? 0),
        totalTokens: totals.totalTokens + (call.totalTokens ?? 0),
      }), { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0 }),
      generatedAlternativesQuestions: result.backendOutput.filter((question) => question.alternativesGenerated).map((question) => question.questionNumber),
      generatedAnswerQuestions: result.backendOutput.filter((question) => question.answerGenerated).map((question) => question.questionNumber),
      questionsWithPendingIssues: result.backendOutput.filter((question) => question.pendingIssues.length).map((question) => ({ questionNumber: question.questionNumber, pendingIssues: question.pendingIssues })),
      backendOutput: result.backendOutput,
      graphErrors: result.errors,
      attempts: result.attempts,
    };
    const questionSuffix = requestedQuestionNumbers?.length ? `-questions-${requestedQuestionNumbers.join('-')}` : '';
    const out = resolve(outputDirectory, `${fixture.key}${questionSuffix}.backend-output.json`);
    await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`);
    summaries.push({ outputPath: out, document: payload.document, sourceQuestionCount: payload.sourceQuestionCount, outputQuestionCount: payload.outputQuestionCount, llmCalls, totalDurationMs: payload.totalDurationMs, usageTotals: payload.usageTotals, graphStage: payload.graphStage, graphRoute: payload.graphRoute, generatedAlternativesQuestions: payload.generatedAlternativesQuestions, generatedAnswerQuestions: payload.generatedAnswerQuestions, questionsWithPendingIssues: payload.questionsWithPendingIssues, graphErrors: payload.graphErrors });
    console.log(JSON.stringify(summaries.at(-1), null, 2));
  }
  const summaryPath = resolve(outputDirectory, 'summary.json');
  await writeFile(summaryPath, `${JSON.stringify({ database: 'dbtemp local only', persisted: false, runs: summaries }, null, 2)}\n`);
  console.log(JSON.stringify({ summaryPath, runs: summaries.length }, null, 2));
} finally {
  await prisma.$disconnect();
}
