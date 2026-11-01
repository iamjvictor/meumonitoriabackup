import assert from 'node:assert/strict';
import test from 'node:test';
import { createMonitorSchema } from '../monitor.model.js';

const base = {
  name: 'Monitor de Matemática',
  subjects: [{ name: 'Matemática', topics: [{ name: 'Álgebra' }] }],
};

test('aceita monitor próprio sem seleção do banco de questões', () => {
  const result = createMonitorSchema.safeParse(base);

  assert.equal(result.success, true);
});

test('aceita seleção opcional do banco com perfil e recorte taxonômico', () => {
  const result = createMonitorSchema.safeParse({
    ...base,
    questionBankSelections: [{
      subject: 'Matemática',
      topic: 'Álgebra',
      examType: 'CONCURSO',
      board: 'FGV',
      subtopic: 'Equações',
      subsubtopic: '1º grau',
    }],
  });

  assert.equal(result.success, true);
});

test('rejeita subsubtópico sem subtópico', () => {
  const result = createMonitorSchema.safeParse({
    ...base,
    questionBankSelections: [{
      subject: 'Matemática',
      topic: 'Álgebra',
      examType: 'ENEM',
      subsubtopic: '1º grau',
    }],
  });

  assert.equal(result.success, false);
});

test('aceita matéria com mais de 30 tópicos importados do acervo', () => {
  const result = createMonitorSchema.safeParse({
    name: 'Monitor amplo',
    subjects: [{
      name: 'Matemática',
      topics: Array.from({ length: 31 }, (_, index) => ({ name: `Tópico ${index + 1}` })),
    }],
    questionBankSelections: [],
  });

  assert.equal(result.success, true);
});

test('aceita rótulos de taxonomia com 360 caracteres e rejeita 361', () => {
  const accepted = createMonitorSchema.safeParse({
    ...base,
    subjects: [{ name: 'Matemática', topics: [{ name: 'T'.repeat(360) }] }],
    questionBankSelections: [
      { subject: 'Matemática', topic: 'T'.repeat(360), examType: 'ENEM' },
      { subject: 'Matemática', topic: 'Álgebra', examType: 'ENEM', subtopic: 'S'.repeat(360) },
      { subject: 'Matemática', topic: 'Álgebra', examType: 'ENEM', subtopic: 'Equações', subsubtopic: 'U'.repeat(360) },
    ],
  });
  const rejected = createMonitorSchema.safeParse({
    ...base,
    questionBankSelections: [
      { subject: 'Matemática', topic: 'T'.repeat(361), examType: 'ENEM' },
      { subject: 'Matemática', topic: 'Álgebra', examType: 'ENEM', subtopic: 'S'.repeat(361) },
      { subject: 'Matemática', topic: 'Álgebra', examType: 'ENEM', subtopic: 'Equações', subsubtopic: 'U'.repeat(361) },
    ],
  });

  assert.equal(accepted.success, true);
  assert.equal(rejected.success, false);
});

test('aceita caminho achatado de 1086 caracteres e rejeita 1087', () => {
  const acceptedPath = ['A'.repeat(360), 'B'.repeat(360), 'C'.repeat(360)].join(' > ');
  const rejectedPath = ['A'.repeat(360), 'B'.repeat(360), 'C'.repeat(361)].join(' > ');
  const accepted = createMonitorSchema.safeParse({
    ...base,
    subjects: [{ name: 'Matemática', topics: [{ name: acceptedPath }] }],
  });
  const rejected = createMonitorSchema.safeParse({
    ...base,
    subjects: [{ name: 'Matemática', topics: [{ name: rejectedPath }] }],
  });

  assert.equal(acceptedPath.length, 1086);
  assert.equal(rejectedPath.length, 1087);
  assert.equal(accepted.success, true);
  assert.equal(rejected.success, false);
});

test('mantém limite de 120 caracteres para nome do monitor e matéria raiz', () => {
  assert.equal(createMonitorSchema.safeParse({
    ...base,
    name: 'M'.repeat(121),
  }).success, false);
  assert.equal(createMonitorSchema.safeParse({
    ...base,
    subjects: [{ name: 'S'.repeat(121), topics: [{ name: 'Álgebra' }] }],
  }).success, false);
});

test('preserva integralmente os rótulos longos do payload de criação', () => {
  const topic = 'T'.repeat(360);
  const payload = {
    name: 'Química UERJ',
    description: 'Monitor para química na UERJ.',
    subjects: [{ name: 'Química', topics: [{ name: topic }] }],
    questionBankSelections: [{ subject: 'Química', topic, examType: 'UERJ', board: 'UERJ' }],
    totalSelectedQuestions: 20,
  };

  const result = createMonitorSchema.safeParse(payload);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.subjects[0]?.topics[0]?.name, topic);
    assert.equal(result.data.questionBankSelections?.[0]?.topic, topic);
  }
});
