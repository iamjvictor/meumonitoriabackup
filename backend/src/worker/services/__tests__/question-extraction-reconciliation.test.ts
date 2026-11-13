import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { reconcileStructuredQuestions } from '../question-extraction-reconciliation.js';
import { extractPdfPagesWithLayout } from '../pdf-layout-extraction.service.js';
import { TextNormalizationService } from '../text-normalization.service.js';
import { buildFullDocumentTextChunks } from '../full-document-text-chunker.js';
import { detectQuestionSourceIntegrityWarnings } from '../structured-question-extraction.service.js';

test('deduplica candidata repetida pela sobreposição e restaura alternativa cortada só com fonte textual', () => {
  const chunks = [{ id: 'page-1', chunkIndex: 0, pages: [1], text: `01) Qual alternativa está correta?\nA) Alpha\nB) Beta\nC) Gamma\nD) Delta\nE) Belo Horizonte\n` }];
  const duplicate = (statement: string, eText: string) => ({
    number: '01', statement, alternatives: [
      { label: 'A', text: 'Alpha' }, { label: 'B', text: 'Beta' }, { label: 'C', text: 'Gamma' },
      { label: 'D', text: 'Delta' }, { label: 'E', text: eText },
    ], correctAnswer: null, institution: null, year: null, sourceChunkIds: ['page-1'], visualEvidence: [],
  });
  const result = reconcileStructuredQuestions([duplicate('Qual alternativa está correta?', 'B'), duplicate('Qual alternativa está correta? Alpha Beta Gamma Delta', 'BH')], chunks);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.statement, 'Qual alternativa está correta?');
  assert.equal(result[0]!.alternatives.length, 5);
  assert.equal(result[0]!.alternatives[4]!.text, 'Belo Horizonte');
});

test('reconstrói questão dividida em dois chunks contíguos e deduplica os candidatos das sub-janelas', () => {
  const chunks = [
    { id: 'before', chunkIndex: 0, pages: [4], text: 'Texto introdutório.\n' },
    { id: 'q08-a', chunkIndex: 1, pages: [4], text: 'QUESTÃO 08 - Uma questão longa cujo enunciado continua' },
    { id: 'q08-b', chunkIndex: 2, pages: [4, 5], text: 'na página seguinte, sem iniciar outra questão.\nA) opção um\nB) opção dois\nC) opção três\nD) opção quatro\nE) opção cinco\n' },
    { id: 'q09', chunkIndex: 3, pages: [5], text: 'QUESTÃO 09 - Outra questão.\nA) 1\nB) 2\n' },
  ];
  const result = reconcileStructuredQuestions([
    { number: '08', statement: 'Uma questão longa cujo enunciado continua', alternatives: [], correctAnswer: null, institution: null, year: null, sourceChunkIds: ['q08-a'], visualEvidence: [] },
    { number: '08', statement: 'na página seguinte, sem iniciar outra questão.', alternatives: [{ label: 'E', text: 'cinco' }], correctAnswer: null, institution: null, year: null, sourceChunkIds: ['q08-b'], visualEvidence: [] },
  ], chunks);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.statement, 'Uma questão longa cujo enunciado continua na página seguinte, sem iniciar outra questão.');
  assert.equal(result[0]!.alternatives.length, 5);
  assert.deepEqual(result[0]!.sourceChunkIds, ['q08-a', 'q08-b']);
});

test('não funde questões com a mesma numeração quando a origem mostra seções diferentes', () => {
  const chunks = [
    { id: 'exam-a', chunkIndex: 0, pages: [1], text: 'QUESTÃO 01 - Primeira prova.\nA) um\nB) dois\n' },
    { id: 'exam-b', chunkIndex: 12, pages: [8], text: 'QUESTÃO 01 - Segunda prova.\nA) três\nB) quatro\n' },
  ];
  const make = (sourceChunkIds: string[]) => ({ number: '01', statement: 'Questão 01', alternatives: [], correctAnswer: null, institution: null, year: null, sourceChunkIds, visualEvidence: [] });
  const result = reconcileStructuredQuestions([make(['exam-a']), make(['exam-b'])], chunks);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((question) => question.statement), ['Primeira prova.', 'Segunda prova.']);
});

test('regressão offline do PDF Pedro Lucas recupera alternativas e expoentes do texto-fonte', async () => {
  const root = resolve(process.cwd(), '..');
  const report = JSON.parse(await readFile(resolve(root, 'tests/document-parser/results/pedro-lucas-deepseek-real-2026-11-05.json'), 'utf8')) as {
    candidates: Array<{ number: string; statement: string; alternatives: Array<{ label: string; text: string }> }>;
  };
  const pdfBytes = new Uint8Array(await readFile(resolve(root, 'tests/document-parser/documentos-professor/Simulado Pedro Lucas.pdf')));
  const pages = await extractPdfPagesWithLayout(pdfBytes);
  const normalizer = new TextNormalizationService();
  const source = buildFullDocumentTextChunks(pages.map((page) => ({
    num: page.num, text: normalizer.normalize(page.text).normalizedContent,
  }))).chunks.map((chunk, index) => ({ id: `local-${index}`, chunkIndex: index, text: chunk.text, pages: chunk.pages }));
  const candidates = report.candidates.map((candidate) => {
    const number = candidate.number.match(/\d{1,2}/)?.[0];
    const sourceChunk = source.find((chunk) => number && new RegExp(`(?:Questão|Questao)\\s*0?${Number(number)}\\s*[-–—:]`, 'i').test(chunk.text));
    assert.ok(sourceChunk, `PDF local contém cabeçalho da questão ${candidate.number}`);
    return {
      number: candidate.number, statement: candidate.statement, alternatives: candidate.alternatives,
      correctAnswer: null, institution: null, year: null, sourceChunkIds: [sourceChunk.id], visualEvidence: [],
    };
  });
  const reconciled = reconcileStructuredQuestions(candidates, source);
  assert.equal(reconciled.length, 10, 'duplicatas 01/02/03 e fragmento 08 são reconciliados');
  const byNumber = new Map(reconciled.map((question) => [question.number, question]));
  assert.match(byNumber.get('02')!.alternatives.find((alternative) => alternative.label === 'E')!.text, /BH\s*3$/);
  assert.match(byNumber.get('05')!.alternatives.find((alternative) => alternative.label === 'E')!.text, /hidrogênio.*metal|metal.*hidrogênio/i);
  const q07A = byNumber.get('07')!.alternatives.find((alternative) => alternative.label === 'A')!.text;
  assert.equal(q07A, '3 × 10', 'o PDF não traz o expoente de A; a reconciliação não inventa o valor ausente');
  assert.ok(detectQuestionSourceIntegrityWarnings(byNumber.get('07')!).some((warning) =>
    warning.code === 'POSSIBLE_MISSING_SCIENTIFIC_EXPONENT' && warning.alternativeLabel === 'A'),
  'a revisão recebe um alerta explícito para verificar o expoente no PDF');
  assert.equal(byNumber.get('08')!.alternatives.length, 5);
});

test('regressão da captura final não põe o 17 órfão no enunciado e marca Q07 para revisão', async () => {
  const root = resolve(process.cwd(), '..');
  const capture = JSON.parse(await readFile(resolve(root, 'tests/document-parser/results/pedro-lucas-final-correction-2026-11-05.json'), 'utf8')) as {
    rawStructuredOutputBeforeReconciliation: { questions: Array<{ number: string; statement: string; alternatives: Array<{ label: string; text: string }>; visualEvidence: Array<{ assetId: string; role: 'STATEMENT' | 'ALTERNATIVE'; alternativeLabel: string | null }> }> };
  };
  const pdfBytes = new Uint8Array(await readFile(resolve(root, 'tests/document-parser/documentos-professor/Simulado Pedro Lucas.pdf')));
  const pages = await extractPdfPagesWithLayout(pdfBytes);
  const normalizer = new TextNormalizationService();
  const source = buildFullDocumentTextChunks(pages.map((page) => ({ num: page.num, text: normalizer.normalize(page.text).normalizedContent })))
    .chunks.map((chunk, index) => ({ id: `single-${index}`, chunkIndex: index, text: chunk.text, pages: chunk.pages }));
  const candidates = capture.rawStructuredOutputBeforeReconciliation.questions.map((candidate) => {
    const number = candidate.number.match(/\d{1,2}/)?.[0];
    const header = new RegExp(`(?:Questão|Questao)\\s*0?${Number(number)}\\s*[-–—:]`, 'i');
    const chunk = source.find((item) => header.test(item.text));
    assert.ok(chunk, `fonte encontrada para Q${candidate.number}`);
    return { ...candidate, correctAnswer: null, institution: null, year: null, sourceChunkIds: [chunk.id] } as typeof candidate & { correctAnswer: null; institution: null; year: null; sourceChunkIds: string[]; sourceIntegrityWarnings?: Array<{ code: string; alternativeLabel?: string; token?: string }> };
  });
  const result = reconcileStructuredQuestions(candidates, source, [{ id: 'qa-pedro-page4-render', pageNumber: 4 }]);
  assert.equal(result.length, 10);
  const byNumber = new Map(result.map((question) => [question.number, question]));
  assert.equal(byNumber.get('07')!.alternatives.find((alternative) => alternative.label === 'A')!.text, '3 × 10 17', 'não converte o expoente achatado para sobrescrito');
  assert.doesNotMatch(byNumber.get('07')!.statement, /\s17\s*$/);
  assert.ok(byNumber.get('07')!.sourceIntegrityWarnings?.some((warning) => warning.code === 'ORPHANED_NUMERIC_TOKEN_BEFORE_ALTERNATIVES'));
  assert.ok(detectQuestionSourceIntegrityWarnings(byNumber.get('07')!).some((warning) =>
    warning.code === 'SCIENTIFIC_EXPONENT_FORMAT_UNVERIFIED' && warning.alternativeLabel === 'A'));
  for (const number of ['03', '06', '08', '10']) {
    assert.doesNotMatch(byNumber.get(number)!.alternatives.find((alternative) => alternative.label === 'E')!.text, /@quimica\.bizurada/);
  }
});

test('não degrada expoente retornado explicitamente pelo modelo com evidência visual da página', () => {
  const chunks = [{ id: 'q7', chunkIndex: 0, pages: [4], text: 'Questão 07 - Enunciado de prova. 17\nA) 3 × 10\nB) 4 × 10 20\n' }];
  const candidate = {
    number: '07', statement: 'Enunciado de prova.', alternatives: [{ label: 'A', text: '3 × 10^17' }],
    correctAnswer: null, institution: null, year: null, sourceChunkIds: ['q7'],
    visualEvidence: [{ assetId: 'page4', role: 'STATEMENT' as const, alternativeLabel: null }],
  };
  const [result] = reconcileStructuredQuestions([candidate], chunks, [{ id: 'page4', pageNumber: 4 }]);
  assert.equal(result!.alternatives[0]!.text, '3 × 10^17');
});
