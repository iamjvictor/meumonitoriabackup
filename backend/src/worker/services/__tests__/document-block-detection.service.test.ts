import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assembleStructuralBlocks } from '../document-block-detection.service.js';
import { extractPdfPagesWithLayout } from '../pdf-layout-extraction.service.js';
import { findRepeatedPageLines, TextNormalizationService } from '../text-normalization.service.js';

test('separa questões consecutivas marcadas com travessão em blocos independentes', async () => {
  const blocks = assembleStructuralBlocks('document-1', 'text-1', [{
    pageNumber: 1,
    rawContent: '',
    normalizedContent: [
      'Questão 1 – (Enem) Qual é a velocidade final do veículo?',
      'a) 10 m/s',
      'b) 20 m/s',
      'c) 30 m/s',
      'd) 40 m/s',
      'e) 50 m/s',
      'Questão 2 – (FEI-SP) Como a distância varia no movimento uniformemente variado?',
      'a) Com o tempo',
      'b) Com o quadrado do tempo',
      'c) Com a massa',
      'd) Com a força',
      'e) Com a velocidade',
      'Questão 3 – (FUVEST) Qual grandeza mede a mudança da velocidade por unidade de tempo?',
      'a) Massa',
      'b) Força',
      'c) Aceleração',
      'd) Energia',
      'e) Potência',
    ].join('\n'),
  }]);

  assert.deepEqual(
    blocks.filter((block) => block.type === 'QUESTION').map((block) => block.questionNumber),
    ['1', '2', '3'],
  );
});

test('reconhece uma seção de gabarito com título descritivo', async () => {
  const { assembleStructuralBlocks } = await import('../document-block-detection.service.js');
  const blocks = assembleStructuralBlocks('document-2', 'text-2', [{
    pageNumber: 1,
    rawContent: '',
    normalizedContent: [
      'Questão 1 – (Enem) Qual é a velocidade final?',
      'a) 10 m/s',
      'b) 20 m/s',
      'c) 30 m/s',
      'd) 40 m/s',
      'e) 50 m/s',
      'Gabarito dos Exercícios sobre',
      'movimento uniformemente variado',
      'Exercício resolvido da questão 1 –',
      'Alternativa correta: letra e) 50 m/s',
    ].join('\n'),
  }]);

  assert.equal(blocks.filter((block) => block.type === 'ANSWER_KEY').length, 1);
  assert.match(blocks.find((block) => block.type === 'ANSWER_KEY')?.normalizedContent ?? '', /^Gabarito dos Exercícios sobre/m);
});

test('não abre questão quando centavos são quebrados em outra linha do PDF', () => {
  const blocks = assembleStructuralBlocks('document-money', 'text-money', [{
    pageNumber: 1,
    rawContent: '',
    normalizedContent: [
      '3. Um produto custa R$ 24,00 e é vendido por R$ 38,',
      '00. Determine a razão entre o preço de venda e o custo.',
      '5. O tecido restante foi vendido por R$ 1.400,',
      '00. Sabendo-se que cada metro custa R$ 5,00, qual era o comprimento inicial?',
      '6. Uma caixa tem 10 bolas. Quantas são vermelhas?',
    ].join('\n'),
  }]);
  const questions = blocks.filter((block) => block.type === 'QUESTION');
  assert.deepEqual(questions.map((block) => block.questionNumber), ['3', '5', '6']);
  assert.match(questions[0]?.normalizedContent ?? '', /R\$ 38,00\. Determine/);
  assert.match(questions[1]?.normalizedContent ?? '', /R\$ 1\.400,00\. Sabendo-se/);
});

test('não encerra questão quando a frase começa com solução aquosa ou saturada', () => {
  const blocks = assembleStructuralBlocks('document-solutions', 'text-solutions', [{
    pageNumber: 1,
    rawContent: '',
    normalizedContent: [
      'Questão 1. Em um experimento, colocou-se peróxido de hidrogênio em',
      'solução. Observe a reação de decomposição e determine sua velocidade.',
      'Nomeie o catalisador e explique sua função.',
      'Questão 2. Calcule a concentração da solução aquosa de NaOH usada no experimento.',
      'Questão 3. Determine a solubilidade em uma solução saturada de oxalato de cálcio.',
    ].join('\n'),
  }]);
  const questions = blocks.filter((block) => block.type === 'QUESTION');
  assert.deepEqual(questions.map((block) => block.questionNumber), ['1', '2', '3']);
  assert.match(questions[0]?.normalizedContent ?? '', /solução\. Observe a reação[\s\S]*Nomeie o catalisador/);
  assert.match(questions[1]?.normalizedContent ?? '', /solução aquosa de NaOH usada no experimento/);
  assert.match(questions[2]?.normalizedContent ?? '', /solução saturada de oxalato de cálcio/);
  assert.equal(blocks.filter((block) => block.type === 'SOLUTION').length, 0);
});

test('reconhece QUESTÃO com número separado na margem do caderno de Química', () => {
  const blocks = assembleStructuralBlocks('document-chemistry', 'text-chemistry', [
    { pageNumber: 1, rawContent: '', normalizedContent: '1. Verifique se você recebeu mais dois cadernos de prova.' },
    { pageNumber: 3, rawContent: '', normalizedContent: [
      'QUESTÃO O bromo é um elemento químico encontrado sob duas formas principais: o íon brometo Br−,',
      '01 em água do mar, e o bromo molecular Br2, obtido a partir da reação.',
      'Indique o grupo e o período da tabela periódica em que o bromo está localizado.',
      'Desenvolvimento e resposta:',
    ].join('\n') },
    { pageNumber: 4, rawContent: '', normalizedContent: [
      'QUESTÃO',
      'Contaminação por tolueno suspendeu fornecimento de água em municípios do Rio de Janeiro',
      '02 de água em municípios próximos.',
      'Apresente a fórmula estrutural do tolueno e determine o número de elétrons pi.',
      'Desenvolvimento e resposta:',
    ].join('\n') },
  ]);
  const questions = blocks.filter((block) => block.type === 'QUESTION');
  const numberedExamQuestions = questions.filter((block) => block.questionNumber === '01' || block.questionNumber === '02');
  assert.deepEqual(numberedExamQuestions.map((block) => block.questionNumber), ['01', '02']);
  assert.deepEqual(numberedExamQuestions.map((block) => block.pageStart), [3, 4]);
  assert.match(numberedExamQuestions[0]?.normalizedContent ?? '', /íon brometo Br−,[\s\S]*em água do mar/);
  assert.match(numberedExamQuestions[1]?.normalizedContent ?? '', /Contaminação por tolueno[\s\S]*de água em municípios próximos/);
});

test('extrai os dez blocos do PDF real questionsQuimica', async () => {
  const fixture = new URL('../../../../../tests/document-parser/questionsQuimica.pdf', import.meta.url);
  const extracted = await extractPdfPagesWithLayout(new Uint8Array(await readFile(fixture)));
  const repeatedPageLines = findRepeatedPageLines(extracted.map((page) => page.text));
  const normalizer = new TextNormalizationService();
  const pages = extracted.map((page) => ({
    pageNumber: page.num,
    rawContent: page.text,
    normalizedContent: normalizer.normalize(page.text, { repeatedPageLines }).normalizedContent,
  }));
  const blocks = assembleStructuralBlocks('chemistry-pdf', 'chemistry-text', pages);
  const actual = blocks.filter((block) => block.type === 'QUESTION' && Number(block.questionNumber) >= 1 && (block.pageStart ?? 0) >= 3);
  assert.deepEqual(actual.map((block) => block.questionNumber), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
  assert.deepEqual(actual.map((block) => block.pageStart), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.match(actual.find((block) => block.questionNumber === '04')?.normalizedContent ?? '', /Nomeie o catalisador[\s\S]*velocidade dessa reação/);
  assert.match(actual.find((block) => block.questionNumber === '07')?.normalizedContent ?? '', /nomenclatura do composto A’/);
  assert.match(actual.find((block) => block.questionNumber === '08')?.normalizedContent ?? '', /neutralização total[\s\S]*concentração,\s*em g\/L/);
  assert.match(actual.find((block) => block.questionNumber === '10')?.normalizedContent ?? '', /presença de cloreto de cálcio[\s\S]*0,2 mol\/L/);
});
