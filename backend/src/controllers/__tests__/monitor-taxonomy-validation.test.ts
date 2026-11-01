import assert from 'node:assert/strict';
import test from 'node:test';
import { addSubjectBodySchema } from '../monitor.controller.js';

test('adiciona matéria aceitando caminhos achatados de até 1086 caracteres', () => {
  const topicPath = ['A'.repeat(360), 'B'.repeat(360), 'C'.repeat(360)].join(' > ');
  const result = addSubjectBodySchema.safeParse({ name: 'Matemática', topics: [topicPath] });

  assert.equal(topicPath.length, 1086);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.topics[0], topicPath);
});

test('rejeita caminho achatado de 1087 caracteres ao adicionar matéria', () => {
  const topicPath = ['A'.repeat(360), 'B'.repeat(360), 'C'.repeat(361)].join(' > ');

  assert.equal(addSubjectBodySchema.safeParse({ name: 'Matemática', topics: [topicPath] }).success, false);
});
