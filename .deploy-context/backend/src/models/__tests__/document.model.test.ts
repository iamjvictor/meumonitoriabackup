import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { uploadDocumentSchema } from '../document.model.js';

const subjectId = randomUUID();
const topicId = randomUUID();

test('knowledge upload accepts a subject without a topic', () => {
  const result = uploadDocumentSchema.safeParse({ subjectId, tag: 'knowledge' });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.topicId, undefined);
});

test('question and flashcard uploads still require a topic', () => {
  for (const tag of ['questions', 'flashcards']) {
    assert.equal(uploadDocumentSchema.safeParse({ subjectId, tag }).success, false);
    assert.equal(uploadDocumentSchema.safeParse({ subjectId, topicId, tag }).success, true);
  }
});
