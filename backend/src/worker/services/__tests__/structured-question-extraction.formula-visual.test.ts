import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { StructuredQuestionExtractionService } from '../structured-question-extraction.service.js';
import { buildDoclingCacheIdentity } from '../document-worker.service.js';

const document = {
  id: 'doc-formulas', teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicId: null,
  chunks: [
    { id: 'chunk-q4', chunkIndex: 0, text: 'Questão 04: k = 4,0 x 10 7 s -1.', pages: [6], status: 'READY',
      formulaEvidence: [{ pageNumber: 6, itemRef: '#/texts/62', bbox: [217, 677, 420, 652],
        originalText: '2 H2O2 (aq) 2 H2O (l) + O2 (g) MnO2 (s)',
        enrichedText: '2 \\, H _ { 2 } O _ { 2 } \\left ( a q \\right ) \\xrightarrow { \\, M n O _ { 2 } \\left ( s \\right ) } 2 \\, H _ { 2 } O \\left ( \\ell \\right ) + O _ { 2 } \\left ( g \\right )' }],
      inlineFormulaEvidence: [{ pageNumber: 6, itemRef: 'pypdfium2:page-6:chars-397-399', bbox: [119, 619, 132, 629],
        baseText: '10', raisedText: '7', normalizedText: '10^{7}', sourceText: '107',
        evidenceSource: 'PDF_CHARACTER_GEOMETRY', heightRatio: 0.562, raiseRatio: 0.372 },
      { pageNumber: 6, itemRef: 'pypdfium2:page-6:chars-403-405', bbox: [135, 619, 145, 628],
        baseText: 's', raisedText: '−1', normalizedText: 's^{-1}', sourceText: 's−1',
        evidenceSource: 'PDF_CHARACTER_GEOMETRY', heightRatio: 0.847, raiseRatio: 0.513 }] },
    { id: 'chunk-q5', chunkIndex: 1, text: 'Questão 05: figura distinta.', pages: [7], status: 'READY' },
  ],
  images: [
    { id: 'figure-q4', assetKind: 'FIGURE', pageNumber: 6, storagePath: 'figure-q4.png', mimeType: 'image/png', chunkIds: ['chunk-q4'],
      width: 41, height: 40, caption: null, bbox: [32.49, 719.01, 73.42, 680.51], readingOrder: 2, sourceItemRef: '#/pictures/62' },
    { id: 'figure-q5', assetKind: 'FIGURE', pageNumber: 7, storagePath: 'figure-q5.png', mimeType: 'image/png', chunkIds: ['chunk-q5'],
      width: 440, height: 420, caption: null, bbox: [80, 520, 520, 100], readingOrder: 3, sourceItemRef: '#/pictures/90' },
    { id: 'page-q4', assetKind: 'PAGE', pageNumber: 6, storagePath: 'page-q4.png', mimeType: 'image/png', chunkIds: ['chunk-q4'],
      width: 1000, height: 1400, caption: null, bbox: null, readingOrder: 4, sourceItemRef: '#/pages/6' },
  ],
};

test('uses a new Docling cache identity so old hybrid-v1 chunks and visual runs are not reused', () => {
  const identity = buildDoclingCacheIdentity('doc-id', 'a'.repeat(64));
  assert.equal(identity.chunkerVersion, 'hybrid-v2-formula-evidence-geometry-v2');
  const oldKey = createHash('sha256').update(['doc-id', 'a'.repeat(64), 'doc-chunker-v2', 'hybrid-v1'].join(':')).digest('hex');
  assert.notEqual(identity.idempotencyKey, oldKey);
});

type VisualEvidence = { assetId: string; role: 'STATEMENT' | 'ALTERNATIVE'; alternativeLabel: string | null; anchorText?: string };
function llmQuestion(visualEvidence: VisualEvidence[] = [], sourceChunkIds = ['chunk-q4'], statement = 'Questão 04 usa $k=4,0\\times 10^{7}\\,s^{-1}$.') {
  return {
    number: '04', statement, alternatives: [],
    correctAnswer: null, institution: null, year: null, sourceChunkIds,
    visualEvidence: visualEvidence.map((evidence) => ({ ...evidence, anchorText: evidence.anchorText ?? 'Questão 04 usa' })),
  };
}

function serviceFor(input: { question?: ReturnType<typeof llmQuestion>; questions?: ReturnType<typeof llmQuestion>[]; imageAssets?: typeof document.images; documentOverride?: typeof document } = {}) {
  let request: { messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> } | undefined;
  let saved: { candidate: Record<string, unknown>; images: typeof document.images } | undefined;
  const saveCalls: Array<{ candidate: Record<string, unknown>; images: typeof document.images }> = [];
  const client = { createStructuredChatCompletion: async (value: typeof request) => {
    request = value;
    return { questions: input.questions ?? [input.question ?? llmQuestion()] };
  } };
  const repository = {
    load: async () => ({ ...(input.documentOverride ?? document), images: input.imageAssets ?? input.documentOverride?.images ?? document.images }),
    save: async (_doc: unknown, candidate: Record<string, unknown>, images: typeof document.images) => {
      saved = { candidate, images };
      saveCalls.push(saved);
      return 'saved-q4';
    },
  };
  const service = new StructuredQuestionExtractionService(client as never, repository as never, 1000,
    async (storagePath) => ({ dataUrl: `data:image/png;base64,${Buffer.from(storagePath).toString('base64')}`, error: false }));
  return { service, getRequest: () => request, getSaved: () => saved, getSaveCalls: () => saveCalls };
}

test('inclui texto original e enriquecido das fórmulas e só figuras no contexto multimodal', async () => {
  const harness = serviceFor();
  const result = await harness.service.processDocument(document.id);
  const userContent = harness.getRequest()?.messages[1]?.content;
  assert.ok(Array.isArray(userContent));
  const promptText = userContent.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
  assert.match(promptText, /originalText=2 H2O2 \(aq\) 2 H2O \(l\) \+ O2 \(g\) MnO2 \(s\)/);
  assert.match(promptText, /enrichedText=2/);
  assert.match(promptText, /itemRef=#\/texts\/62/);
  assert.match(promptText, /inlineFormulaEvidence evidenceSource=PDF_CHARACTER_GEOMETRY page=6/);
  assert.match(promptText, /baseText=10 raisedText=7 normalizedText=10\^\{7\}/);
  assert.match(promptText, /baseText=s raisedText=−1 normalizedText=s\^{-1}/);
  assert.match(promptText, /página=7, bbox=80,520,520,100/);
  assert.match(promptText, /assetKind=FIGURE/);
  assert.match(promptText, /Ignore selos com número da questão, logotipos/);
  assert.doesNotMatch(promptText, /assetKind=PAGE|page-q4/);
  assert.ok(!JSON.stringify(userContent).includes('data:image/png;base64,cGFnZS1xNC5wbmc='));
  assert.equal(result.llmCalls, 1);
});

test('prioriza OCR legível 1 / 2 sobre enriquecimento contraditório de Q05', async () => {
  const q5Document = {
    ...document,
    chunks: [{ id: 'chunk-q5', chunkIndex: 0, text: 'Questão 05: 1 / 2 O2 (g).', pages: [7], status: 'READY',
      inlineFormulaEvidence: [],
      formulaEvidence: [{ pageNumber: 7, itemRef: '#/texts/105', bbox: [100, 300, 180, 270],
        originalText: '1 / 2 O2 (g)', enrichedText: '\\lceil _{2} O_{2}(g)' }] }],
  };
  const harness = serviceFor({ documentOverride: q5Document, question: llmQuestion([], ['chunk-q5'], 'Questão 05: $\\frac{1}{2} O_2 (g)$.') });
  await harness.service.processDocument(document.id);
  const userContent = harness.getRequest()?.messages[1]?.content;
  assert.ok(Array.isArray(userContent));
  const promptText = userContent.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
  assert.match(promptText, /originalText=1 \/ 2 O2 \(g\)/);
  assert.match(promptText, /enrichedText=\\lceil _\{2\} O_\{2\}\(g\)/);
  assert.match(promptText, /Quando originalText contiver texto legível.*evidência primária/s);
  assert.match(promptText, /1 \/ 2.*\\frac\{1\}\{2\}/s);
  assert.match(promptText, /numerador ou denominador não estiver disponível, não infira nem complete a fração/);
  assert.ok(promptText.includes('rejeite a interpretação conflitante'));
  assert.ok(promptText.includes('não interprete "1 / 2" como "\\lceil"'));
});

test('ordena candidatas pela posição de origem e passa ordinal estável ao repositório', async () => {
  const orderedDocument = { ...document, images: [], chunks: [
    { id: 'chunk-q1', chunkIndex: 0, text: 'Questão Alfa: texto inicial. Questão Beta: texto posterior.', pages: [3], status: 'READY' },
    { id: 'chunk-q2', chunkIndex: 1, text: 'Questão Gama: texto em página seguinte.', pages: [4], status: 'READY' },
  ] };
  const questions = [
    llmQuestion([], ['chunk-q2'], 'Questão Gama: texto em página seguinte.'),
    llmQuestion([], ['chunk-q1'], 'Questão Beta: texto posterior.'),
    llmQuestion([], ['chunk-q1'], 'Questão Alfa: texto inicial.'),
  ];
  const harness = serviceFor({ documentOverride: orderedDocument, imageAssets: [], questions });
  await harness.service.processDocument(orderedDocument.id);
  const saves = harness.getSaveCalls();
  assert.deepEqual(saves.map(({ candidate }) => candidate.statement), [
    'Questão Alfa: texto inicial.', 'Questão Beta: texto posterior.', 'Questão Gama: texto em página seguinte.',
  ]);
  assert.deepEqual(saves.map(({ candidate }) => (candidate.metadata as { questionExtractionOrdinal: number }).questionExtractionOrdinal), [0, 1, 2]);
  assert.ok(saves.every(({ candidate }) => candidate.number === '04'));
});

test('usa fallback determinístico independente da ordem da resposta quando statement não aparece literalmente na fonte', async () => {
  const fallbackDocument = { ...document, images: [], chunks: [
    { id: 'chunk-unknown-order', chunkIndex: 0, text: 'OCR fragmentado sem correspondência literal direta.', pages: [8], status: 'READY' },
  ] };
  const alpha = llmQuestion([], ['chunk-unknown-order'], 'Questão inferida: alfa por contexto.');
  const beta = llmQuestion([], ['chunk-unknown-order'], 'Questão inferida: beta por contexto.');
  const first = serviceFor({ documentOverride: fallbackDocument, imageAssets: [], questions: [beta, alpha] });
  const second = serviceFor({ documentOverride: fallbackDocument, imageAssets: [], questions: [alpha, beta] });
  await Promise.all([
    first.service.processDocument(fallbackDocument.id),
    second.service.processDocument(fallbackDocument.id),
  ]);
  const ordinalByStatement = (harness: ReturnType<typeof serviceFor>) => Object.fromEntries(harness.getSaveCalls().map(({ candidate }) => [
    candidate.statement as string,
    (candidate.metadata as { questionExtractionOrdinal: number }).questionExtractionOrdinal,
  ]));
  assert.deepEqual(ordinalByStatement(first), ordinalByStatement(second));
  assert.deepEqual(ordinalByStatement(first), {
    'Questão inferida: alfa por contexto.': 0,
    'Questão inferida: beta por contexto.': 1,
  });
});

test('localiza por prefixo quando fórmula LaTeX diverge do OCR depois do início do enunciado', async () => {
  const formulaDocument = { ...document, images: [], chunks: [
    { id: 'chunk-formula-order', chunkIndex: 0,
      text: 'Questão Zeta: Enunciado muito extenso com fórmula inicial 1 / 2 antes de continuar. Questão Alfa: Enunciado muito extenso com fórmula inicial 3 / 4 antes de continuar.',
      pages: [9], status: 'READY' },
  ] };
  const zeta = llmQuestion([], ['chunk-formula-order'], 'Questão Zeta: Enunciado muito extenso com fórmula inicial \\frac{1}{2} antes de continuar.');
  const alpha = llmQuestion([], ['chunk-formula-order'], 'Questão Alfa: Enunciado muito extenso com fórmula inicial \\frac{3}{4} antes de continuar.');
  const harness = serviceFor({ documentOverride: formulaDocument, imageAssets: [], questions: [alpha, zeta] });
  await harness.service.processDocument(formulaDocument.id);
  const saves = harness.getSaveCalls();
  assert.deepEqual(saves.map(({ candidate }) => candidate.statement), [zeta.statement, alpha.statement]);
  assert.deepEqual(saves.map(({ candidate }) => (candidate.metadata as { questionExtractionOrdinal: number }).questionExtractionOrdinal), [0, 1]);
});

test('corrige somente a leitura de fração contradita quando o original da fórmula prova 1 / 2 O2', async () => {
  const q5Document = { ...document, chunks: [{ ...document.chunks[1]!, text: 'Questão 05: produto gasoso 1 / 2 O2 (g).',
    inlineFormulaEvidence: [],
    formulaEvidence: [{ pageNumber: 7, itemRef: '#/texts/105', bbox: [100, 300, 180, 270], originalText: '1 / 2 O2 (g)',
      enrichedText: '\\lceil _{2} O_{2}(g)' }] }] };
  const wrongQuestion = llmQuestion([], ['chunk-q5'], 'Questão 05: produto gasoso \\lceil _ { 2 } O _ { 2 }(g).');
  const harness = serviceFor({ documentOverride: q5Document, question: wrongQuestion });
  await harness.service.processDocument(q5Document.id);
  const candidate = harness.getSaved()?.candidate;
  assert.equal(candidate?.statement, 'Questão 05: produto gasoso $\\frac{1}{2}O_2$(g).');
  assert.deepEqual((candidate?.metadata as { sourceEvidenceCorrections: Array<{ code: string }> }).sourceEvidenceCorrections.map(({ code }) => code), [
    'FORMULA_FRACTION_RESTORED_FROM_ORIGINAL_TEXT',
  ]);
});

test('normaliza a saída OCR bruta 1 / 2 O 2 quando o original do chunk prova a fração', async () => {
  const q5Document = { ...document, chunks: [{ ...document.chunks[1]!, text: 'Questão 05: produto gasoso 1 / 2 O 2 (g).',
    inlineFormulaEvidence: [], formulaEvidence: [{ pageNumber: 7, itemRef: '#/texts/73', bbox: [100, 300, 180, 270],
      originalText: '1 / 2 O2 (g)', enrichedText: '\\lceil _ { 2 } O _ { 2 }(g)' }] }] };
  const question = llmQuestion([], ['chunk-q5'], 'Questão 05: produto gasoso 1 / 2 O 2 (g).');
  const harness = serviceFor({ documentOverride: q5Document, question });
  await harness.service.processDocument(q5Document.id);
  assert.equal(harness.getSaved()?.candidate.statement, 'Questão 05: produto gasoso $\\frac{1}{2}O_2$ (g).');
  assert.equal(((harness.getSaved()?.candidate.metadata as { sourceEvidenceCorrections: Array<{ code: string }> }).sourceEvidenceCorrections)
    .filter(({ code }) => code === 'FORMULA_FRACTION_RESTORED_FROM_ORIGINAL_TEXT').length, 1);
});

test('delimita fração já corrigida pela LLM quando está fora de math delimiters', async () => {
  const q5Document = { ...document, chunks: [{ ...document.chunks[1]!, text: 'Questão 05: produto gasoso 1 / 2 O2 (g).',
    inlineFormulaEvidence: [], formulaEvidence: [{ pageNumber: 7, itemRef: '#/texts/73', bbox: [100, 300, 180, 270],
      originalText: '1 / 2 O2 (g)', enrichedText: '1 / 2 O2 (g)' }] }] };
  const question = llmQuestion([], ['chunk-q5'], 'Questão 05: produto gasoso \\frac{1}{2} O_2(g).');
  const harness = serviceFor({ documentOverride: q5Document, question });
  await harness.service.processDocument(q5Document.id);
  assert.equal(harness.getSaved()?.candidate.statement, 'Questão 05: produto gasoso $\\frac{1}{2}O_2$(g).');
});

test('restaura a linha inteira da equação Q05 com evidência Docling e fração confirmada pelo texto original', async () => {
  const enriched = 'H _ { 2 } O \\left ( \\ell \\right ) \\rightarrow H _ { 2 } \\left ( g \\right ) + \\lceil _ { 2 } O _ { 2 } \\left ( g \\right ) \\quad \\Delta H ^ { 0 } = 2 8 6 \\, k J / m o l';
  const enrichedWithSourceFraction = enriched.replace(/\\lceil\s*_\s*\{\s*2\s*\}\s*O\s*_\s*\{\s*2\s*\}/, String.raw`\frac{1}{2} O _ { 2 }`);
  const q5Document = { ...document, chunks: [{ ...document.chunks[1]!, text: 'A reação está representada pela seguinte equação. Apresente a fórmula estrutural do hidrogênio.',
    inlineFormulaEvidence: [], formulaEvidence: [{ pageNumber: 7, itemRef: '#/texts/73', bbox: [198, 655, 439, 642],
      originalText: 'H 2 O ( l ) H 2 (g) + 1 / 2 O 2 (g) ∆ H 0 = 286 kJ/mol', enrichedText: enriched }] }] };
  const statement = 'A reação está representada pela seguinte equação:\nH 2 O ( l ) → H 2 (g) + 1 / 2 O 2 (g) ∆ H 0 = 286 kJ/mol\nApresente a fórmula estrutural do hidrogênio.';
  const harness = serviceFor({ documentOverride: q5Document, question: llmQuestion([], ['chunk-q5'], statement) });
  await harness.service.processDocument(q5Document.id);

  assert.equal(harness.getSaved()?.candidate.statement,
    `A reação está representada pela seguinte equação:\n$$${enrichedWithSourceFraction}$$\nApresente a fórmula estrutural do hidrogênio.`);
});

test('não reconstrói a equação Q05 quando o original não comprova a fração 1/2', async () => {
  const enriched = 'H _ { 2 } O \\left ( \\ell \\right ) \\rightarrow H _ { 2 } \\left ( g \\right ) + \\lceil _ { 2 } O _ { 2 } \\left ( g \\right )';
  const q5Document = { ...document, chunks: [{ ...document.chunks[1]!, text: 'equação de eletrólise',
    inlineFormulaEvidence: [], formulaEvidence: [{ pageNumber: 7, itemRef: '#/texts/73', bbox: [198, 655, 439, 642],
      originalText: 'H 2 O ( l ) H 2 (g) + O 2 (g)', enrichedText: enriched }] }] };
  const statement = 'A reação está representada pela seguinte equação:\nH 2 O ( l ) → H 2 (g) + 1 / 2 O 2 (g)\nApresente a fórmula estrutural do hidrogênio.';
  const harness = serviceFor({ documentOverride: q5Document, question: llmQuestion([], ['chunk-q5'], statement) });
  await harness.service.processDocument(q5Document.id);

  assert.equal(harness.getSaved()?.candidate.statement, statement);
});

test('não duplica delimitadores ao corrigir a fração Q05 em equação já delimitada', async () => {
  const enriched = 'H _ { 2 } O \\left ( \\ell \\right ) \\rightarrow H _ { 2 } \\left ( g \\right ) + \\lceil _ { 2 } O _ { 2 } \\left ( g \\right )';
  const q5Document = { ...document, chunks: [{ ...document.chunks[1]!, text: 'equação de eletrólise',
    inlineFormulaEvidence: [], formulaEvidence: [{ pageNumber: 7, itemRef: '#/texts/73', bbox: [198, 655, 439, 642],
      originalText: 'H 2 O ( l ) H 2 (g) + 1 / 2 O 2 (g)', enrichedText: enriched }] }] };
  const statement = 'A reação está representada pela seguinte equação:\n$$H _ { 2 } O \\rightarrow H _ { 2 } + \\lceil _ { 2 } O _ { 2 }$$\nApresente a fórmula estrutural do hidrogênio.';
  const harness = serviceFor({ documentOverride: q5Document, question: llmQuestion([], ['chunk-q5'], statement) });
  await harness.service.processDocument(q5Document.id);
  const actual = harness.getSaved()?.candidate.statement as string;

  assert.equal((actual.match(/\$\$/g) ?? []).length, 2);
  assert.match(actual, /\\frac\{1\}\{2\}O_2/);
  assert.doesNotMatch(actual, /\\lceil/);
});

test('reconstrói somente a linha da reação com formulaEvidence correspondente e contexto da questão', async () => {
  const q4Document = { ...document, images: [], chunks: [{ ...document.chunks[0]!, text: 'Questão 04: Observe a reação química de decomposição catalisada por MnO2. Sabe-se que a reação é de primeira ordem.', pages: [6] }] };
  const statement = 'Questão 04: Observe a reação química de decomposição, catalisada por MnO2:\nMnO2(s) 2 H 2 O2 (aq) → 2 H 2 O (l) + O2 (g)\nSabe-se que a reação é de primeira ordem.';
  const harness = serviceFor({ documentOverride: q4Document, imageAssets: [], question: llmQuestion([], ['chunk-q4'], statement) });
  await harness.service.processDocument(q4Document.id);
  const candidate = harness.getSaved()?.candidate;
  assert.equal(candidate?.statement, `Questão 04: Observe a reação química de decomposição, catalisada por MnO2:\n$$${document.chunks[0]!.formulaEvidence![0]!.enrichedText}$$\nSabe-se que a reação é de primeira ordem.`);
  assert.equal(((candidate?.metadata as { sourceEvidenceCorrections: Array<{ code: string; itemRef: string }> }).sourceEvidenceCorrections)[0]?.code,
    'REACTION_LINE_RESTORED_FROM_FORMULA_EVIDENCE');
  assert.equal(((candidate?.metadata as { sourceEvidenceCorrections: Array<{ itemRef: string }> }).sourceEvidenceCorrections)[0]?.itemRef, '#/texts/62');
});

test('corrige L - 1 somente quando a geometria do chunk confirma L^{-1}', async () => {
  const lGeometry = { pageNumber: 6, itemRef: 'pypdfium2:page-6:chars-500-501', bbox: [100, 600, 110, 610], baseText: 'L', raisedText: '−1',
    normalizedText: 'L^{-1}', sourceText: 'L−1', evidenceSource: 'PDF_CHARACTER_GEOMETRY' as const, heightRatio: 0.7, raiseRatio: 0.22 };
  const qDocument: typeof document = { ...document, images: [], chunks: [{ ...document.chunks[0]!, text: 'Questão: concentração 4,0 mol L - 1.',
    formulaEvidence: document.chunks[0]!.formulaEvidence ?? [], inlineFormulaEvidence: [lGeometry] }] };
  const candidate = llmQuestion([], ['chunk-q4'], 'Questão: concentração 4,0 mol $L - 1$.');
  const harness = serviceFor({ documentOverride: qDocument, imageAssets: [], question: candidate });
  await harness.service.processDocument(qDocument.id);
  assert.equal(harness.getSaved()?.candidate.statement, 'Questão: concentração 4,0 mol $L^{-1}$.');
});

test('restaura expoentes achatados somente quando geometria do chunk confirma 10^7 e s^-1', async () => {
  const q4Chunk = { ...document.chunks[0]!, text: 'Questão 04: constante cinética 4,0 x 10 7 s -1.', pages: [6] };
  const q4Document = { ...document, images: [], chunks: [q4Chunk] };
  const wrongQuestion = llmQuestion([], ['chunk-q4'], 'Questão 04: constante cinética 4,0 x 10 7 s -1.');
  const harness = serviceFor({ documentOverride: q4Document, imageAssets: [], question: wrongQuestion });
  await harness.service.processDocument(q4Document.id);
  const candidate = harness.getSaved()?.candidate;
  assert.equal(candidate?.statement, 'Questão 04: constante cinética 4,0 x $10^{7}$ $s^{-1}$.');
  assert.deepEqual((candidate?.metadata as { sourceEvidenceCorrections: Array<{ code: string }> }).sourceEvidenceCorrections.map(({ code }) => code), [
    'INLINE_EXPONENT_RESTORED_FROM_PDF_GEOMETRY', 'INLINE_EXPONENT_RESTORED_FROM_PDF_GEOMETRY',
  ]);
  assert.equal(((candidate?.metadata as { sourceEvidenceCorrections: Array<{ after: string }> }).sourceEvidenceCorrections
    .filter(({ after }) => after.includes('s^{-1}')).length), 1);
});

test('mantém expoentes já dentro de delimitadores de matemática sem criar nesting', async () => {
  const q4Document = { ...document, images: [], chunks: [{ ...document.chunks[0]!, text: 'Questão 04: constante cinética 4,0 x 10 7 s -1.', pages: [6] }] };
  const candidate = llmQuestion([], ['chunk-q4'], 'Questão 04: constante cinética $4,0 x 10 7 s -1$.');
  const harness = serviceFor({ documentOverride: q4Document, imageAssets: [], question: candidate });
  await harness.service.processDocument(q4Document.id);
  assert.equal(harness.getSaved()?.candidate.statement, 'Questão 04: constante cinética $4,0 x 10^{7} s^{-1}$.');
});

test('deduplica correções repetidas da mesma evidência de expoente', async () => {
  const q4Document = { ...document, images: [], chunks: [{ ...document.chunks[0]!, text: 'Questão 04: constante 10 7 s -1 repetida.', pages: [6] }] };
  const candidate = llmQuestion([], ['chunk-q4'], 'Questão 04: 4,0 x 10 7 s -1 e depois 5,0 x 10 7 s -1.');
  const harness = serviceFor({ documentOverride: q4Document, imageAssets: [], question: candidate });
  await harness.service.processDocument(q4Document.id);
  const corrections = (harness.getSaved()?.candidate.metadata as { sourceEvidenceCorrections: Array<{ after: string }> }).sourceEvidenceCorrections;
  assert.deepEqual(corrections.map(({ after }) => after), ['$10^{7}$', '$s^{-1}$']);
  assert.equal(corrections.filter(({ after }) => after === '$s^{-1}$').length, 1);
});

test('não corrige fórmulas conflitantes sem evidência da origem citada', async () => {
  const noFormulaEvidence = { ...document, images: [], chunks: [{ id: 'chunk-no-evidence', chunkIndex: 0,
    text: 'Questão: uma leitura sem geometria ou item de fórmula.', pages: [10], status: 'READY' }] };
  const wrongQuestion = llmQuestion([], ['chunk-no-evidence'], 'Questão: 1 / 2 O2 e 10 7 s -1 L - 1, leitura sem confirmação.');
  const harness = serviceFor({ documentOverride: noFormulaEvidence, imageAssets: [], question: wrongQuestion });
  await harness.service.processDocument(noFormulaEvidence.id);
  const candidate = harness.getSaved()?.candidate;
  assert.equal(candidate?.statement, wrongQuestion.statement);
  assert.deepEqual((candidate?.metadata as { sourceEvidenceCorrections: unknown[] }).sourceEvidenceCorrections, []);
});

test('persiste a figura citada somente quando sua proveniência intersecta os chunks da questão', async () => {
  const figure = { ...document.images[0]!, width: 200, height: 140, bbox: [217, 677, 420, 652] };
  const harness = serviceFor({ imageAssets: [figure], question: llmQuestion([{ assetId: 'figure-q4', role: 'STATEMENT', alternativeLabel: null }]) });
  const result = await harness.service.processDocument(document.id);
  assert.deepEqual(harness.getSaved()?.images.map(({ id }) => id), ['figure-q4']);
  assert.deepEqual(harness.getSaved()?.candidate.visualEvidence, [{ assetId: 'figure-q4', role: 'STATEMENT', alternativeLabel: null,
    anchorText: 'Questão 04 usa' }]);
  assert.equal(harness.getSaved()?.images[0]?.pageNumber, 6);
  assert.equal(harness.getSaved()?.images[0]?.readingOrder, 2);
  assert.deepEqual(result.questions[0]?.visualAssetIds, ['figure-q4']);
});

test('rejeita figura sem persistir quando sua âncora não é sustentada pelo texto da questão', async () => {
  const unsupportedFigure = llmQuestion([{ assetId: 'figure-q5', role: 'STATEMENT', alternativeLabel: null, anchorText: 'tabela que não aparece no enunciado' }], ['chunk-q5']);
  const harness = serviceFor({ question: unsupportedFigure });
  await assert.rejects(harness.service.processDocument(document.id), /anchorText.*não corresponde exatamente/i);
  assert.equal(harness.getSaved(), undefined);
});

test('aceita figura de tabela em página de apêndice quando a âncora literal é sustentada pela questão', async () => {
  const questionChunkId = 'question-p3';
  const appendixChunkId = 'appendix-p15';
  const unrelatedFigure = { ...document.images[1]!, id: 'unrelated-figure-p1', pageNumber: 1,
    storagePath: 'unrelated-figure-p1.png', chunkIds: ['unrelated-p1'], sourceItemRef: '#/pictures/0' };
  const crossPageFigure = { ...document.images[0]!, id: 'periodic-table-p15', pageNumber: 15,
    storagePath: 'periodic-table-p15.png', chunkIds: [appendixChunkId], sourceItemRef: '#/pictures/table-p15',
    width: 1000, height: 700, bbox: [40, 740, 550, 300] };
  const documentWithAppendix = { ...document, id: 'doc-appendix', chunks: [
    { id: questionChunkId, chunkIndex: 0, text: 'Questão 01: Consulte a tabela periódica para identificar a classificação periódica, o grupo e o período do bromo.', pages: [3], status: 'READY' },
    { id: appendixChunkId, chunkIndex: 1, text: 'Tabela periódica dos elementos.', pages: [15], status: 'READY' },
  ], images: [unrelatedFigure, crossPageFigure] };
  const candidate = llmQuestion([{ assetId: crossPageFigure.id, role: 'STATEMENT', alternativeLabel: null, anchorText: 'a tabela periódica' }],
    [questionChunkId], 'Questão 01: Consulte a tabela periódica para identificar a classificação periódica, o grupo e o período do bromo.');
  const harness = serviceFor({ documentOverride: documentWithAppendix, question: candidate });

  const result = await harness.service.processDocument(documentWithAppendix.id);

  assert.deepEqual(harness.getSaved()?.images.map((image) => image.id), [crossPageFigure.id]);
  assert.equal(harness.getSaved()?.images[0]?.pageNumber, 15);
  assert.deepEqual(harness.getSaved()?.candidate.visualEvidence, [{ assetId: crossPageFigure.id, role: 'STATEMENT', alternativeLabel: null,
    anchorText: 'a tabela periódica' }]);
  const userContent = harness.getRequest()?.messages[1]?.content;
  assert.ok(Array.isArray(userContent));
  const promptText = userContent.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
  assert.match(promptText, /questão que pergunta o grupo e o período do bromo.*tabela periódica na página 15/s);
  assert.match(promptText, /assetId=periodic-table-p15, assetKind=FIGURE, página=15/);
  assert.match(promptText, /com anchorText literal do enunciado que justifique essa consulta/);
  assert.deepEqual(result.questions[0]?.sourceChunkIds, [questionChunkId]);
});

test('rejeita selo com número da questão como âncora visual decorativa', async () => {
  const badge = { ...document.images[1]!, id: 'question-number-badge', sourceItemRef: '#/pictures/question-badge' };
  const harness = serviceFor({ imageAssets: [badge], question: llmQuestion([
    { assetId: badge.id, role: 'STATEMENT', alternativeLabel: null, anchorText: 'Questão 04' },
  ]) });
  await assert.rejects(harness.service.processDocument(document.id), /Figura decorativa/);
  assert.equal(harness.getSaved(), undefined);
});

test('mantém figura pequena sem legenda quando a bbox não corresponde ao canto do selo', async () => {
  const diagram = { ...document.images[0]!, id: 'small-diagram', width: 41, height: 40, bbox: [200, 500, 241, 460], sourceItemRef: '#/pictures/small-diagram' };
  const harness = serviceFor({ imageAssets: [diagram], question: llmQuestion([
    { assetId: diagram.id, role: 'STATEMENT', alternativeLabel: null, anchorText: 'Questão 04 usa' },
  ]) });
  const result = await harness.service.processDocument(document.id);
  const userContent = harness.getRequest()?.messages[1]?.content;
  assert.ok(Array.isArray(userContent));
  assert.equal(userContent.filter((part) => part.type === 'image_url').length, 1);
  assert.deepEqual(result.questions[0]?.visualAssetIds, [diagram.id]);
});

test('sem FIGURE detectada, request e questão permanecem somente textuais', async () => {
  const harness = serviceFor({ imageAssets: [] });
  const result = await harness.service.processDocument(document.id);
  const userContent = harness.getRequest()?.messages[1]?.content;
  assert.ok(Array.isArray(userContent));
  assert.equal(userContent.filter((part) => part.type === 'image_url').length, 0);
  assert.deepEqual(harness.getSaved()?.images, []);
  assert.deepEqual(harness.getSaved()?.candidate.visualEvidence, []);
  assert.deepEqual(result.questions[0]?.visualAssetIds, []);
});

test('não envia nem persiste assets PAGE mesmo quando são vinculados a chunks do PDF', async () => {
  const harness = serviceFor({ imageAssets: document.images.filter((image) => image.assetKind === 'PAGE') });
  const result = await harness.service.processDocument(document.id);
  const userContent = harness.getRequest()?.messages[1]?.content;
  assert.ok(Array.isArray(userContent));
  assert.equal(userContent.filter((part) => part.type === 'image_url').length, 0);
  assert.deepEqual(harness.getSaved()?.images, []);
  assert.deepEqual(result.questions[0]?.visualAssetIds, []);
});

test('não associa selo decorativo da questão quando a LLM não o cita', async () => {
  const badge = { ...document.images[0]!, id: 'question-number-badge', sourceItemRef: '#/pictures/question-badge', storagePath: 'question-number-badge.png' };
  const harness = serviceFor({ imageAssets: [badge] });
  const result = await harness.service.processDocument(document.id);
  const userContent = harness.getRequest()?.messages[1]?.content;
  assert.ok(Array.isArray(userContent));
  assert.equal(userContent.filter((part) => part.type === 'image_url').length, 0);
  assert.doesNotMatch(JSON.stringify(userContent), /question-number-badge/);
  assert.deepEqual(harness.getSaved()?.images, []);
  assert.deepEqual(harness.getSaved()?.candidate.visualEvidence, []);
  assert.deepEqual(result.questions[0]?.visualAssetIds, []);
});
