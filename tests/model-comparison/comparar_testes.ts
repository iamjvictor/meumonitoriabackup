#!/usr/bin/env node
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const TEST_NAMES = [
  'e2e_economica_qwen30b_deepseek',
  'e2e_qualidade_kimi_gera_qwen_revisa',
  'e2e_so_qwen235b',
  'e2e_revisao_cruzada_qwen_gera_deepseek_revisa',
] as const;
const NV = 'NAO_VERIFICADO';
type Obj = Record<string, any>;
type Args = { reports: string; baseline: string; baselineSummary?: string; out: string; reference: string; visuals: string };

function argsFrom(argv: string[]): Args {
  const out: Record<string, string> = { reports: 'reports', out: 'reports/comparacao_modelos', reference: path.join(import.meta.dirname, 'gabarito_referencia.json'), visuals: path.join(import.meta.dirname, 'elementos_visuais_referencia.json') };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Valor ausente para ${key}`);
    out[key.slice(2)] = argv[++i];
  }
  if (!out.baseline) throw new Error('Informe --baseline com o caminho de question-origin-snapshot.json');
  return out as Args;
}
async function json(file: string): Promise<Obj | null> {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}
const s = (v: any): string => typeof v === 'string' ? v : v == null ? '' : String(v);
function norm(v: any): string { return s(v).normalize('NFKC').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim(); }
function safe(v: any): string { return s(v).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>') || NV; }
function csv(v: any): string { return `"${s(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`; }
function num(v: any): number | null { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function rounded(value: number): number { return Number(value.toFixed(6)); }
function sumKnown(values: any[]): number | string {
  if (!values.length || values.some((value) => num(value) === null)) return NV;
  return values.reduce((total, value) => total + Number(value), 0);
}
function questionKey(q: Obj): string { return norm(q.statement ?? q.text); }
function questionRef(q: Obj, baselineQuestions: Obj[]): Obj | undefined {
  const key = questionKey(q);
  if (!key) return undefined;
  const matches = baselineQuestions.filter((baseline) => questionKey(baseline) === key);
  return matches.length === 1 ? matches[0] : undefined;
}
function correctAgainstReference(q: Obj, reference: Obj): string {
  const entry = (reference.questions ?? []).find((item: Obj) => s(item.number) === s(q.number));
  if (!entry?.correctAnswer) return `${NV}: sem verdade de referência humana`;
  return s(q.correctAnswer) === s(entry.correctAnswer) ? 'CORRETO' : 'INCORRETO';
}
function structureCheck(q: Obj): string {
  const alternatives = Array.isArray(q.alternatives) ? q.alternatives : [];
  const labels = alternatives.map((alternative: Obj) => s(alternative.label).toUpperCase()).sort().join('');
  const answer = s(q.correctAnswer).toUpperCase();
  const answerOption = alternatives.some((alternative: Obj) => s(alternative.label).toUpperCase() === answer && !!s(alternative.text).trim());
  const explanation = s(q.explanation); const evidence = s(q.evidence);
  const issues: string[] = [];
  if (labels !== 'ABCDE') issues.push(`alternativas=${labels || NV}`);
  if (!answerOption) issues.push('gabarito sem alternativa correspondente');
  if (!explanation) issues.push('explicação ausente'); else if (explanation.length > 700) issues.push(`explicação=${explanation.length} caracteres`);
  if (evidence.length > 300) issues.push(`evidence=${evidence.length} caracteres`);
  if (q.missingFields?.length) issues.push(`missingFields=${JSON.stringify(q.missingFields)}`);
  return issues.length ? `FALHA: ${issues.join('; ')}` : (explanation && evidence ? 'OK' : NV);
}
function formatQuestion(q: Obj | undefined): string {
  if (!q) return NV;
  const alternatives = Array.isArray(q.alternatives) ? q.alternatives.map((alternative: Obj) => `${s(alternative.label)}. ${s(alternative.text)}`).join('\n') : NV;
  return `Enunciado: ${s(q.statement ?? q.text) || NV}\n\nAlternativas:\n${alternatives}\n\nGabarito: ${s(q.correctAnswer) || NV}\n\nExplicação: ${s(q.explanation) || NV}\n\nEvidência: ${s(q.evidence) || NV}\n\nDecisão do revisor: ${s(q.reviewDecision) || NV}\n\nStatus: ${s(q.status) || NV}`;
}
function allRounds(runs: Obj[]): Array<{ summary: Obj; round: Obj }> {
  return runs.flatMap((summary) => (Array.isArray(summary.rounds) ? summary.rounds : []).map((round: Obj) => ({ summary, round })));
}
function validCalls(round: Obj): Obj[] { return Array.isArray(round.calls) ? round.calls : []; }
function percentile(values: number[], p: number): number | string {
  if (!values.length) return NV;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}
function median(values: number[]): number | string {
  if (!values.length) return NV;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function variationForRun(runs: Obj[]): { answerChanges: number | string; alternativeChanges: number | string } {
  const completePairs = runs.flatMap((summary) => {
    const round1 = summary.rounds?.find((round: Obj) => Number(round.round) === 1);
    const round2 = summary.rounds?.find((round: Obj) => Number(round.round) === 2);
    if (!round1 || !round2 || !Array.isArray(round1.questions) || !Array.isArray(round2.questions)) return [];
    const byNumber = new Map(round2.questions.map((question: Obj) => [s(question.number), question]));
    return round1.questions.map((question: Obj) => ({ before: question, after: byNumber.get(s(question.number)) })).filter((pair: any) => pair.after);
  });
  if (!completePairs.length) return { answerChanges: NV, alternativeChanges: NV };
  const changeCount = (selector: (question: Obj) => any): number | string => {
    const comparable = completePairs.filter(({ before, after }) => {
      const left = selector(before); const right = selector(after);
      return left !== null && left !== undefined && right !== null && right !== undefined
        && (typeof left !== 'string' || left.trim() !== '') && (typeof right !== 'string' || right.trim() !== '');
    });
    if (!comparable.length) return NV;
    const changes = comparable.filter(({ before, after }) => JSON.stringify(selector(before)) !== JSON.stringify(selector(after))).length;
    return comparable.length === completePairs.length ? changes : `${NV}: ${comparable.length}/${completePairs.length} pares comparáveis; ${changes} diferenças`;
  };
  return {
    answerChanges: changeCount((question) => s(question.correctAnswer).toUpperCase() || null),
    alternativeChanges: changeCount((question) => Array.isArray(question.alternatives) ? question.alternatives : null),
  };
}
function visualCoverage(knowledgeBase: Obj | undefined, visuals: Obj): { matched: number | string; expected: number | string; detail: string } {
  const expectedQuestions: Obj[] = Array.isArray(visuals.questions) ? visuals.questions : [];
  if (!expectedQuestions.length || !Array.isArray(knowledgeBase?.descriptions)) return { matched: NV, expected: expectedQuestions.length || NV, detail: NV };
  const descriptionRows: Obj[] = knowledgeBase.descriptions;
  const parts: string[] = []; let totalExpected = 0; let totalMatched = 0;
  for (const question of expectedQuestions) {
    const expected = Array.isArray(question.expectedElements) ? question.expectedElements : [];
    totalExpected += expected.length;
    const pageAssets = descriptionRows.filter((description) => Number(description.pageNumber) === Number(question.page));
    if (!pageAssets.length) { parts.push(`Q${s(question.number)}: 0/${expected.length} elementos recuperados; descrição ausente da página ${s(question.page)}; ausentes: ${expected.map(s).join(', ') || NV}`); continue; }
    const combined = norm(pageAssets.map((description) => description.description).join(' '));
    const matched = expected.filter((element: any) => combined.includes(norm(element)));
    totalMatched += matched.length;
    parts.push(`Q${s(question.number)}: ${matched.length}/${expected.length} elementos recuperados; ausentes: ${expected.filter((element: any) => !matched.includes(element)).map(s).join(', ') || 'nenhum'}`);
  }
  return { matched: totalMatched, expected: totalExpected || NV, detail: parts.join('; ') };
}
function chatVisual(round: Obj, visualQuestion: Obj | undefined): string {
  const chat = round.chat;
  if (!chat || chat.status !== 'VERIFIED') return `${NV}: chat Q03 ausente/não verificado`;
  const answer = norm(chat.answer);
  const difference = s(visualQuestion?.expectedVisibleDifference);
  const containsImage = chat.imageContextPassed === true;
  const recognized = typeof chat.visibleDifferenceRecognized === 'boolean' ? chat.visibleDifferenceRecognized : (difference ? answer.includes(norm(difference)) : false);
  return `imagem=${containsImage ? 'SIM' : 'NÃO'}; diferença=${recognized ? 'RECONHECIDA' : 'NÃO RECONHECIDA'}`;
}
function numericMetric(round: Obj, key: string): number | string {
  const value = round.metrics?.[key];
  return num(value) ?? NV;
}
function runCost(rounds: Obj[]): number | string {
  const calls = rounds.flatMap(validCalls);
  if (!calls.length) return NV;
  return sumKnown(calls.map((call) => call.costUsd));
}
function runTokens(rounds: Obj[], key: string): number | string {
  const calls = rounds.flatMap(validCalls);
  if (!calls.length) return NV;
  return sumKnown(calls.map((call) => call[key]));
}
function runLatencies(rounds: Obj[]): { p50: number | string; p95: number | string } {
  const calls = rounds.flatMap(validCalls);
  const values = calls.map((call) => num(call.latencyMs)).filter((value): value is number => value !== null);
  if (!calls.length || values.length !== calls.length) return { p50: NV, p95: NV };
  return { p50: median(values), p95: percentile(values, .95) };
}
function costSource(calls: Obj[]): string {
  if (!calls.length || calls.some((call) => num(call.costUsd) === null)) return NV;
  const sources = [...new Set(calls.map((call) => s(call.costSource)).filter(Boolean))];
  return sources.length ? sources.join('; ') : 'custo numérico no resumo; fonte não discriminada';
}
function retryAndFailureMetrics(calls: Obj[]) {
  return {
    retriesSchema: calls.filter((call) => num(call.attempt) !== null && Number(call.attempt) > 1 && (String(call.schemaError ?? '').length > 0 || call.jsonSchemaFailureObserved === true)).length,
    retriesTotais: calls.filter((call) => num(call.attempt) !== null && Number(call.attempt) > 1).length,
    errosJson: calls.filter((call) => call.responseJsonValid === false || call.outcome === 'INVALID_JSON').length,
    errosSchema: calls.filter((call) => call.jsonSchemaFailureObserved === true || call.outcome === 'INVALID_SCHEMA').length,
    falhasHttp: calls.filter((call) => String(call.outcome ?? '').includes('HTTP_ERROR') || call.httpError === true).length,
  };
}
function runFx(runs: Obj[]): { rate: number | null; source: string; date: string } {
  const items = runs.map((run) => run.fx).filter((fx: any) => fx && num(fx.usdBrl) !== null && fx.source && fx.date);
  if (!items.length) return { rate: null, source: NV, date: NV };
  const unique = [...new Set(items.map((fx: Obj) => `${fx.usdBrl}|${fx.source}|${fx.date}`))];
  if (unique.length !== 1) return { rate: null, source: 'Cotações diferentes entre execuções', date: NV };
  return { rate: Number(items[0].usdBrl), source: s(items[0].source), date: s(items[0].date) };
}
function includeEffectiveSummary(summary: Obj | null, testName: string, runId: string): summary is Obj {
  // `execute` is the explicit local CLI mode; `pipeline` is the child worker's
  // mode, and `local-e2e` is the stable report-contract alias.
  const allowedExecutionModes = new Set(['execute', 'pipeline', 'local-e2e']);
  return !!summary && summary.test === testName && summary.runId === runId && summary.pipelineExecuted === true && allowedExecutionModes.has(summary.executionMode);
}
function baselineRow(snapshot: Obj, e2e: Obj | null): Obj {
  const usage = e2e?.tokenUsageAndRetries?.usageFromProviderLogs;
  const docs = Array.isArray(e2e?.documents) ? e2e!.documents : [];
  const assetCount = docs.length ? docs.reduce((total: number, document: Obj) => total + (num(document.visualAssetCount) ?? 0), 0) : NV;
  const questionCount = num(snapshot.questionCount) ?? snapshot.questions?.length ?? NV;
  const pendingCount = Array.isArray(snapshot.questions) && snapshot.questions.every((question: Obj) => typeof question.status === 'string')
    ? snapshot.questions.filter((question: Obj) => question.status === 'PENDING_REVIEW').length : NV;
  return {
    teste: 'baseline_gemini_2_5_flash', runIds: s(e2e?.runId) || NV, rodadas: 1,
    modelos: Array.isArray(usage?.models) ? usage.models.join('; ') : 'google/gemini-2.5-flash',
    questoesPorRodada: questionCount, pendentesPorRodada: pendingCount,
    questoesEstruturalmenteValidas: NV, acertoContraGabaritoHumano: `${NV}: sem verdade de referência`, coberturaVisual: NV, elementosVisuaisRecuperados: NV,
    tokensEntrada: num(usage?.structuredPromptTokens) ?? NV, tokensSaida: num(usage?.structuredCompletionTokens) ?? NV,
    tokensRaciocinio: NV, chamadasEstruturadas: num(usage?.structuredCalls) ?? NV,
    custoUSD: NV, fonteCusto: 'Not reported by workers', custoUSDPorQuestao: NV, custoBRL: NV, custoBRLPorQuestao: NV,
    latenciaP50ms: NV, latenciaP95ms: NV, tempoTotalMs: NV,
    retriesSchema: e2e?.tokenUsageAndRetries?.initial?.invalidSchemaEvents != null && e2e?.tokenUsageAndRetries?.repeat?.invalidSchemaEvents != null
      ? Number(e2e.tokenUsageAndRetries.initial.invalidSchemaEvents) + Number(e2e.tokenUsageAndRetries.repeat.invalidSchemaEvents) : NV,
    retriesTotais: NV, errosJson: NV, errosSchema: num(e2e?.tokenUsageAndRetries?.initial?.invalidSchemaEvents) !== null && num(e2e?.tokenUsageAndRetries?.repeat?.invalidSchemaEvents) !== null
      ? Number(e2e.tokenUsageAndRetries.initial.invalidSchemaEvents) + Number(e2e.tokenUsageAndRetries.repeat.invalidSchemaEvents) : NV,
    falhasHttp: NV,
    variacaoGabaritoR1R2: NV, variacaoAlternativasR1R2: NV,
    chatQ03: e2e?.chat?.status === 'Skipped in this run to avoid duplicating the prior real multimodal call' ? `${NV}: baseline atual não repetiu o chat; há referência multimodal anterior` : NV,
    fx: `${NV}: sem conversão de custo baseline`, proveniencia: 'execução Gemini existente; custo dos workers não reportado',
    assetsVisuais: assetCount,
  };
}
function aggregateTestRow(name: string, runs: Obj[], visuals: Obj): Obj {
  const records = allRounds(runs);
  const rounds = records.map(({ round }) => round);
  const questions = rounds.flatMap((round) => Array.isArray(round.questions) ? round.questions : []);
  const perRoundQuestionCounts = rounds.map((round) => Array.isArray(round.questions) ? round.questions.length : 0).filter(Boolean);
  const pending = questions.filter((question) => question.status === 'PENDING_REVIEW').length;
  const structurallyValid = questions.filter((question) => structureCheck(question) === 'OK').length;
  const visualDetails = rounds.map((round) => visualCoverage(round.knowledgeBase, visuals));
  const visualMatched = visualDetails.length > 0 && visualDetails.every((detail) => num(detail.matched) !== null) ? visualDetails.reduce((total, detail) => total + Number(detail.matched), 0) : NV;
  const visualExpected = visualDetails.length > 0 && visualDetails.every((detail) => num(detail.expected) !== null) ? visualDetails.reduce((total, detail) => total + Number(detail.expected), 0) : NV;
  const cost = runCost(rounds); const totalQuestions = questions.length;
  const fx = runFx(runs);
  const costPerQuestion = num(cost) !== null && totalQuestions > 0 ? rounded(Number(cost) / totalQuestions) : NV;
  const costBrl = num(cost) !== null && fx.rate !== null ? rounded(Number(cost) * fx.rate) : NV;
  const costBrlPerQuestion = num(costBrl) !== null && totalQuestions > 0 ? rounded(Number(costBrl) / totalQuestions) : NV;
  const latency = runLatencies(rounds);
  const durations = rounds.map((round) => num(round.metrics?.totalDurationMs)).filter((value): value is number => value !== null);
  const variation = variationForRun(runs);
  const calls = rounds.flatMap(validCalls);
  const failureMetrics = retryAndFailureMetrics(calls);
  const models = [...new Set(calls.map((call) => s(call.model)).filter(Boolean))];
  const statuses = rounds.map((round) => `${s(round.round) || NV}:${s(round.status) || NV}`).join('; ') || NV;
  const assets = rounds.map((round) => num(round.knowledgeBase?.assetCount)).filter((value): value is number => value !== null);
  const eligibleQuestionCount = perRoundQuestionCounts.length ? Math.min(...perRoundQuestionCounts) : NV;
  return {
    teste: name, runIds: runs.map((run) => s(run.runId)).join('; ') || NV, rodadas: rounds.length || NV,
    modelos: models.join('; ') || NV, statusRodadas: statuses,
    questoesPorRodada: eligibleQuestionCount, questoesGeradasTotal: totalQuestions || NV,
    pendentesPorRodada: rounds.length ? `${pending}/${totalQuestions}` : NV,
    questoesEstruturalmenteValidas: questions.length ? `${structurallyValid}/${questions.length}` : NV,
    acertoContraGabaritoHumano: `${NV}: sem verdade de referência`,
    coberturaVisual: num(visualMatched) !== null && num(visualExpected) !== null ? `${visualMatched}/${visualExpected}` : NV,
    elementosVisuaisRecuperados: visualDetails.map((detail) => detail.detail).join(' | ') || NV,
    assetsVisualizadosPorRodada: assets.length ? `${Math.min(...assets)}-${Math.max(...assets)}` : NV,
    tokensEntrada: runTokens(rounds, 'inputTokens'), tokensSaida: runTokens(rounds, 'outputTokens'),
    tokensRaciocinio: runTokens(rounds, 'reasoningTokens'), chamadasEstruturadas: calls.filter((call) => call.agent !== 'embedding').length || NV,
    custoUSD: cost, fonteCusto: costSource(calls), custoUSDPorQuestao: costPerQuestion,
    custoBRL: costBrl, custoBRLPorQuestao: costBrlPerQuestion,
    latenciaP50ms: latency.p50, latenciaP95ms: latency.p95,
    tempoTotalMs: durations.length === rounds.length && rounds.length ? durations.reduce((total, value) => total + value, 0) : NV,
    ...failureMetrics,
    variacaoGabaritoR1R2: variation.answerChanges,
    variacaoAlternativasR1R2: variation.alternativeChanges,
    chatQ03: rounds.map((round) => chatVisual(round, visuals.questions?.find((question: Obj) => s(question.number) === s(round.chat?.questionNumber)) ?? visuals.questions?.find((question: Obj) => s(question.number) === '03'))).join(' | ') || NV,
    fx: fx.rate === null ? NV : `${fx.rate} R$/US$ (${fx.source}; ${fx.date})`,
  };
}
function renderPerRunComparison(name: string, run: Obj, baselineQuestions: Obj[], reference: Obj, visuals: Obj): string {
  const rounds = [...(run.rounds ?? [])].sort((a: Obj, b: Obj) => Number(a.round) - Number(b.round));
  const lines = [
    `# Comparação por questão — ${name} / ${run.runId}`, '',
    'Baseline: pipeline atual Gemini 2.5 Flash. O gabarito de referência humana permanece sem respostas confirmadas.', '',
  ];
  const numbers = [...new Set(rounds.flatMap((round: Obj) => (round.questions ?? []).map((question: Obj) => s(question.number))).filter(Boolean))].sort();
  for (const number of numbers) {
    const sampleQuestion = rounds.flatMap((round: Obj) => round.questions ?? []).find((question: Obj) => s(question.number) === number);
    const base = baselineQuestions.find((question) => s(question.number) === number) ?? (sampleQuestion ? questionRef(sampleQuestion, baselineQuestions) : undefined);
    lines.push(`## Questão ${number}`, '', `Correspondência do baseline: ${base ? 'EXATA_PELO_NUMERO_OU_ENUNCIADO' : NV}`, '', '### Baseline Gemini', '', formatQuestion(base), '');
    for (const round of rounds) {
      const question = (round.questions ?? []).find((candidate: Obj) => s(candidate.number) === number);
      const baselineMatch = question ? questionRef(question, baselineQuestions) : undefined;
      lines.push(`### Rodada ${round.round}`, '', formatQuestion(question), '', `Correspondência do enunciado: ${baselineMatch ? 'EXATA_APÓS_NORMALIZAÇÃO' : NV}`, `Estrutura: ${question ? structureCheck(question) : NV}`, `Gabarito vs referência humana: ${question ? correctAgainstReference(question, reference) : NV}`, '');
    }
  }
  lines.push('## Cobertura de elementos visuais da base de conhecimento', '');
  for (const visual of visuals.questions ?? []) {
    lines.push(`### Questão ${s(visual.number)} (página ${s(visual.page)})`, '', `Esperado: ${(visual.expectedElements ?? []).join(', ') || NV}`, `Diferença visível: ${s(visual.expectedVisibleDifference) || NV}`);
    for (const round of rounds) {
      const result = visualCoverage(round.knowledgeBase, { questions: [visual] });
      lines.push(`Rodada ${round.round}: ${result.detail}`);
    }
    lines.push('');
  }
  lines.push('## Chat multimodal da questão 03', '');
  for (const round of rounds) {
    const chat = round.chat;
    lines.push(`- Rodada ${round.round}: ${chat?.status === 'VERIFIED' ? `imagem=${chat.imageContextPassed === true ? 'passada' : 'não comprovada'}; diferença=${chat.visibleDifferenceRecognized === true ? 'reconhecida' : chat.visibleDifferenceRecognized === false ? 'não reconhecida' : NV}; resposta: ${s(chat.answer) || NV}` : `${NV}: ${s(chat?.reason ?? chat?.status) || 'sem evidência de chat executado'}`}`);
  }
  lines.push('');
  return lines.join('\n');
}
function roundRow(name: string, summary: Obj, round: Obj): Obj {
  const calls = validCalls(round); const latencies = calls.map((call) => num(call.latencyMs)).filter((value): value is number => value !== null);
  const questions = Array.isArray(round.questions) ? round.questions : [];
  const total = questions.length;
  return {
    teste: name, runId: s(summary.runId), rodada: round.round ?? NV, status: round.status ?? NV,
    questoes: total || NV, pendentes: total ? questions.filter((question) => question.status === 'PENDING_REVIEW').length : NV,
    estruturaValida: total ? `${questions.filter((question) => structureCheck(question) === 'OK').length}/${total}` : NV,
    tokensEntrada: runTokens([round], 'inputTokens'), tokensSaida: runTokens([round], 'outputTokens'),
    tokensRaciocinio: runTokens([round], 'reasoningTokens'), custoUSD: runCost([round]),
    latenciaP50ms: median(latencies), latenciaP95ms: percentile(latencies, .95),
    tempoTotalMs: numericMetric(round, 'totalDurationMs'),
    retries: calls.filter((call) => num(call.attempt) !== null && Number(call.attempt) > 1).length,
    assetsIndexados: round.knowledgeBase?.indexedCount ?? NV,
    chatQ03: round.chat?.status === 'VERIFIED' ? (round.chat.visibleDifferenceRecognized === true ? 'RECONHECIDA' : round.chat.visibleDifferenceRecognized === false ? 'NÃO RECONHECIDA' : NV) : NV,
  };
}

export async function generate(args: Args): Promise<void> {
  const baselineSnapshot = await json(args.baseline);
  const baselineQuestions: Obj[] = Array.isArray(baselineSnapshot?.questions) ? baselineSnapshot!.questions : [];
  const e2eSummaryPath = args.baselineSummary ?? path.join(path.dirname(args.baseline), 'e2e-results-summary.json');
  const e2eSummary = await json(e2eSummaryPath);
  const ref = await json(args.reference); const visuals = await json(args.visuals) ?? {};
  const byTest: Record<string, Obj[]> = {};
  const allRunRows: Obj[] = [];
  for (const name of TEST_NAMES) {
    let dirs: string[] = [];
    try { dirs = await readdir(path.join(args.reports, name), { withFileTypes: true }).then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()); } catch { /* no report directory */ }
    const effectiveRuns: Obj[] = [];
    for (const runId of dirs) {
      const summaryPath = path.join(args.reports, name, runId, 'summary.json');
      const summary = await json(summaryPath);
      if (!includeEffectiveSummary(summary, name, runId)) continue;
      effectiveRuns.push(summary);
      const report = renderPerRunComparison(name, summary, baselineQuestions, ref ?? {}, visuals);
      await writeFile(path.join(path.dirname(summaryPath), 'comparacao.md'), report, 'utf8');
      for (const round of summary.rounds ?? []) allRunRows.push(roundRow(name, summary, round));
    }
    byTest[name] = effectiveRuns;
  }

  const rows: Obj[] = [baselineRow(baselineSnapshot ?? {}, e2eSummary)];
  for (const name of TEST_NAMES) rows.push(aggregateTestRow(name, byTest[name] ?? [], visuals));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const markdown = [
    '# Comparativo de qualidade e custo dos pipelines', '',
    'A linha `baseline_gemini_2_5_flash` usa a execução Gemini já existente. Somente summaries com `pipelineExecuted=true` entram nas linhas dos modelos; preflights, dry-runs e fakes são ignorados.',
    'O gabarito humano não está confirmado, então acurácia docente permanece `SEM_VERDADE_DE_REFERENCIA`. Custos ausentes permanecem `NAO_VERIFICADO`.', '',
    '| ' + columns.join(' | ') + ' |', '| ' + columns.map(() => '---').join(' |') + ' |',
    ...rows.map((row) => '| ' + columns.map((column) => safe(row[column])).join(' | ') + ' |'), '',
    '## Resultados por rodada', '',
  ];
  if (!allRunRows.length) markdown.push('Nenhuma execução real elegível foi encontrada. Summaries de dry-run não aparecem como resultados.', '');
  else {
    const detailColumns = [...new Set(allRunRows.flatMap((row) => Object.keys(row)))];
    markdown.push('| ' + detailColumns.join(' | ') + ' |', '| ' + detailColumns.map(() => '---').join(' |') + ' |', ...allRunRows.map((row) => '| ' + detailColumns.map((column) => safe(row[column])).join(' | ') + ' |'), '');
  }
  await mkdir(args.out, { recursive: true });
  await writeFile(path.join(args.out, 'comparativo.md'), markdown.join('\n'), 'utf8');
  await writeFile(path.join(args.out, 'comparativo.csv'), [columns.map(csv).join(','), ...rows.map((row) => columns.map((column) => csv(row[column])).join(','))].join('\n') + '\n', 'utf8');
  if (allRunRows.length) {
    const detailColumns = [...new Set(allRunRows.flatMap((row) => Object.keys(row)))];
    await writeFile(path.join(args.out, 'comparativo-rodadas.csv'), [detailColumns.map(csv).join(','), ...allRunRows.map((row) => detailColumns.map((column) => csv(row[column])).join(','))].join('\n') + '\n', 'utf8');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  argsFrom(process.argv.slice(2)).then(generate).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
