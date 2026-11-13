import test from 'node:test';
import assert from 'node:assert/strict';
import { localPracticeDay, splitTopicLeaders, summarize } from '../teacher-intelligence.metrics.js';

test('summarize weights accuracy per student, includes inactive students in practice average, and distinguishes no data', () => {
  const result = summarize([
    { studentId: 'a', isCorrect: true, answeredAt: new Date('2026-11-06T12:00:00Z') },
    { studentId: 'a', isCorrect: false, answeredAt: new Date('2026-11-06T13:00:00Z') },
    { studentId: 'b', isCorrect: true, answeredAt: new Date('2026-11-06T13:00:00Z') },
  ], [{ studentId: 'a', at: new Date('2026-11-06T02:00:00Z') }], ['a', 'b', 'c']);
  assert.equal(result.accuracy, 75);
  assert.equal(result.accuracyStudentCount, 2);
  assert.equal(result.inactiveStudentCount, 2);
  assert.equal(result.averagePracticeDays, 1 / 3);
});

test('localPracticeDay groups UTC timestamps by São Paulo calendar day', () => {
  assert.equal(localPracticeDay(new Date('2026-11-06T02:30:00Z')), '2026-11-05');
});

test('topic leader lists do not overlap and preserve only available topics', () => {
  const topics = Array.from({ length: 5 }, (_, index) => ({ name: `T${index}`, accuracy: index * 20, attempts: 5 }));
  const result = splitTopicLeaders(topics);
  assert.deepEqual(result.needsAttention.map((item) => item.name), ['T0', 'T1', 'T2']);
  assert.deepEqual(result.strongest.map((item) => item.name), ['T4', 'T3']);
});
