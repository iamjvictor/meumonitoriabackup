import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateVisualCase, summarizeVisualEvaluation, type VisualEvalExpected, type VisualEvalObservation } from './visual-quality-evaluator.js';

type CorpusCase = VisualEvalExpected & {
  prompt: string;
  questionContext: string;
  requiredVisualFacts: Array<{ id: string; description: string }>;
  acceptableAnswer: string;
  forbiddenClaims: string[];
};
type ObservationRow = {
  caseId: string;
  model?: string;
  promptVersion?: string;
  latencyMs?: number;
  costUsd?: number | null;
  failureStage?: string | null;
  failureCode?: string | null;
  observation: VisualEvalObservation;
};

async function main(args: string[]) {
  const options = parseArgs(args);
  const result = await runVisualEvaluation(options);
  process.stdout.write(`${JSON.stringify({ cases: result.summary.cases, pendingHumanReview: result.summary.pendingHumanReview, output: resolve(options.output), report: resolve(options.report) })}\n`);
}

export async function runVisualEvaluation(options: {
  corpus: string;
  observations: string;
  output: string;
  report: string;
}) {
  const [corpusRows, observationRows] = await Promise.all([
    readJsonl<CorpusCase>(options.corpus),
    readJsonl<ObservationRow>(options.observations),
  ]);
  if (corpusRows.length === 0) throw new Error('O corpus não contém casos.');
  const corpus = uniqueByCaseId(corpusRows, 'corpus');
  const observations = uniqueByCaseId(observationRows, 'observações');
  const missing = corpusRows.filter((row) => !observations.has(row.caseId)).map((row) => row.caseId);
  const unexpected = [...observations.keys()].filter((caseId) => !corpus.has(caseId));
  if (missing.length || unexpected.length) {
    throw new Error(`Casos divergentes. Sem observação: ${missing.join(', ') || 'nenhum'}. Fora do corpus: ${unexpected.join(', ') || 'nenhum'}.`);
  }

  const results = corpusRows.map((testCase) => {
    const run = observations.get(testCase.caseId)!;
    return {
      caseId: testCase.caseId,
      category: testCase.category,
      expected: {
        documentSha256: (testCase as CorpusCase & { documentSha256?: string }).documentSha256 ?? null,
        questionContext: testCase.questionContext,
        expectedAssets: testCase.expectedAssets,
        expectedFactIds: testCase.expectedFactIds,
      },
      model: run.model ?? null,
      promptVersion: run.promptVersion ?? null,
      latencyMs: run.latencyMs ?? null,
      costUsd: run.costUsd ?? null,
      failureStage: run.failureStage ?? null,
      failureCode: run.failureCode ?? null,
      observation: run.observation,
      score: evaluateVisualCase(testCase, run.observation),
    };
  });
  const scores = results.map((row) => row.score);
  const summary = summarizeVisualEvaluation(scores);
  const output = results.map((row) => JSON.stringify(row)).join('\n') + '\n';
  const report = renderReport(results, summary);
  await Promise.all([
    writeFile(resolve(options.output), output, 'utf8'),
    writeFile(resolve(options.report), report, 'utf8'),
  ]);
  return { summary, results };
}

function renderReport(rows: Array<{
  caseId: string;
  category: string;
  model: string | null;
  promptVersion: string | null;
  latencyMs: number | null;
  costUsd: number | null;
  failureStage: string | null;
  failureCode: string | null;
  score: ReturnType<typeof evaluateVisualCase>;
}>, summary: ReturnType<typeof summarizeVisualEvaluation>) {
  const metric = (name: string, value: { passed: number; total: number }) => `| ${name} | ${value.passed}/${value.total} | ${percent(value.passed, value.total)} |`;
  const byCategory = [...new Set(rows.map((row) => row.category))].sort().map((category) => {
    const cases = rows.filter((row) => row.category === category);
    const passed = cases.filter((row) => row.score.answerPass).length;
    const reviewed = cases.filter((row) => row.score.reviewStatus === 'REVIEWED').length;
    return `| ${category} | ${passed}/${reviewed} | ${cases.length} |`;
  });
  const models = [...new Set(rows.map((row) => row.model).filter(Boolean))];
  const prompts = [...new Set(rows.map((row) => row.promptVersion).filter(Boolean))];
  const latencies = rows.map((row) => row.latencyMs).filter((value): value is number => value !== null);
  const costs = rows.map((row) => row.costUsd).filter((value): value is number => value !== null);
  const failures = rows.filter((row) => !row.score.extractionPass || !row.score.associationPass || !row.score.contextPass || !row.score.answerPass);
  return [
    '# Avaliação de compreensão visual do chat', '',
    `Gerado em: ${new Date().toISOString()}`, '',
    `Casos: ${summary.cases}; revisão humana pendente: ${summary.pendingHumanReview}.`,
    `Modelos: ${models.join(', ') || 'não informado'}; versões de prompt: ${prompts.join(', ') || 'não informadas'}.`,
    `Latência média: ${average(latencies)} ms; custo total: ${costs.length ? costs.reduce((sum, value) => sum + value, 0).toFixed(6) : 'não informado'} USD.`, '',
    '## Métricas determinísticas e revisão humana', '',
    '| Etapa | Passou / total | Taxa |', '|---|---:|---:|',
    metric('Extração (casos)', summary.extraction),
    metric('Associação sem asset alheio', summary.association),
    metric('Contexto entregue (casos críticos)', summary.criticalContext),
    metric('Recuperação dos assets anotados', summary.retrievalRecall),
    metric('Respostas aprovadas por revisão humana', summary.reviewedAnswers), '',
    `### Baseline textual vs multimodal\n\nComparação pareada revisada: ${summary.pairedComparison.baselinePassed}/${summary.pairedComparison.total} → ${summary.pairedComparison.multimodalPassed}/${summary.pairedComparison.total}.`, '',
    'A resposta não é aprovada automaticamente pelo texto ou pela alternativa correta. Cada caso precisa de revisão humana com fatos visuais identificados.', '',
    '## Resultado por categoria', '',
    '| Categoria | Respostas aprovadas / revisadas | Casos |', '|---|---:|---:|',
    ...(byCategory.length ? byCategory : ['| (sem categorias) | 0/0 | 0 |']), '',
    '## Falhas para triagem', '',
    ...(failures.length ? failures.map((row) => `- **${row.caseId}** (${row.category}): extração=${row.score.extractionPass ? 'OK' : 'FALHA'}, associação=${row.score.associationPass ? 'OK' : 'FALHA'}, contexto=${row.score.contextPass ? 'OK' : 'FALHA'}, resposta=${row.score.answerPass ? 'OK' : 'PENDENTE/FALHA'}; falha upstream=${row.failureStage ?? 'não informada'}${row.failureCode ? ` (${row.failureCode})` : ''}; assets ausentes=${row.score.missingAssets.length}, assets indevidos=${row.score.foreignAssets.length}, fatos não confirmados=${row.score.missingFactIds.join(', ') || 'nenhum'}.`)
      : ['Nenhuma falha determinística ou de revisão registrada.']), '',
    '## Gate inicial', '',
    `Contexto crítico entregue sem asset indevido: ${summary.criticalContext.total > 0 && summary.criticalContext.passed === summary.criticalContext.total ? 'PASSOU' : 'NÃO PASSOU'}.`,
    `Compreensão visual revisada >= 90%: ${summary.reviewedAnswers.total > 0 && summary.reviewedAnswers.passed / summary.reviewedAnswers.total >= 0.9 ? 'PASSOU' : 'NÃO PASSOU'}.`,
    'Este relatório não autoriza rollout se houver revisão humana pendente ou se algum gate falhar.', '',
  ].join('\n');
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  const content = await readFile(resolve(filePath), 'utf8');
  return content.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try { return JSON.parse(line) as T; }
    catch { throw new Error(`JSONL inválido em ${filePath}, linha ${index + 1}.`); }
  });
}

function uniqueByCaseId<T extends { caseId: string }>(rows: T[], label: string) {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (!row.caseId || result.has(row.caseId)) throw new Error(`caseId ausente ou duplicado em ${label}: ${row.caseId || '(vazio)'}`);
    result.set(row.caseId, row);
  }
  return result;
}

function parseArgs(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === '--help') {
      process.stdout.write('Uso: node --import tsx src/scripts/evaluate-visual-chat.ts --corpus <gold.jsonl> --observations <run.jsonl> --output <results.jsonl> --report <report.md>\n');
      process.exit(0);
    }
    if (!['--corpus', '--observations', '--output', '--report'].includes(argument)) throw new Error(`Argumento desconhecido: ${argument}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Valor ausente para ${argument}`);
    values.set(argument, value);
  }
  for (const name of ['--corpus', '--observations', '--output', '--report']) {
    if (!values.has(name)) throw new Error(`Argumento obrigatório ausente: ${name}`);
  }
  const output = values.get('--output')!;
  const report = values.get('--report')!;
  if (resolve(output) === resolve(report)) throw new Error('JSONL e relatório precisam de caminhos distintos.');
  return { corpus: values.get('--corpus')!, observations: values.get('--observations')!, output, report };
}

function percent(passed: number, total: number) { return total ? `${Math.round((passed / total) * 100)}%` : 'n/a'; }
function average(values: number[]) { return values.length ? String(Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)) : 'n/a'; }

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/src/scripts/evaluate-visual-chat.ts')) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Falha ao avaliar o corpus.'}\n`);
    process.exitCode = 1;
  });
}
