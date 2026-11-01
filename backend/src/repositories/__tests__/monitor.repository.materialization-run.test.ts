import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../../lib/prisma.js';
import { MonitorRepository } from '../monitor.repository.js';

test('creates the materialization run in the same transaction as monitor selections', async (t) => {
  const operations: string[] = [];
  const transaction = {
    monitor: {
      async create() { operations.push('monitor'); return { id: 'monitor-1' }; },
      async findUniqueOrThrow() { return {
        id: 'monitor-1', status: 'DRAFT', teacher: { id: 'teacher-1' },
        subjects: [{ id: 'subject-1', name: 'Matemática', topics: [{ id: 'topic-1', name: 'Álgebra', questionBankSelections: [] }] }],
      }; },
    },
    monitorSubject: { async findMany() { return [{ id: 'subject-1', name: 'Matemática', topics: [{ id: 'topic-1', name: 'Álgebra', subtopics: [], subsubtopics: [] }] }]; } },
    monitorQuestionBankSelection: { async createMany() { operations.push('selections'); return { count: 1 }; } },
    questionBankMaterializationRun: { async create({ data }: { data: { totalSelected: number } }) { operations.push('run'); return { id: 'run-1', status: 'QUEUED', totalSelected: data.totalSelected }; } },
  };

  const teacherDelegate = prisma.teacher;
  const originalFindTeacher = teacherDelegate.findUnique;
  teacherDelegate.findUnique = (async () => ({ id: 'teacher-1', status: 'active' })) as unknown as typeof teacherDelegate.findUnique;
  t.after(() => { teacherDelegate.findUnique = originalFindTeacher; });
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = (async (callback: (tx: unknown) => Promise<unknown>) => callback(transaction)) as typeof prisma.$transaction;
  t.after(() => { prisma.$transaction = originalTransaction; });

  const result = await new MonitorRepository().createDraft('user-1', {
    name: 'Monitor Matemática',
    totalSelectedQuestions: 73,
    subjects: [{ name: 'Matemática', topics: [{ name: 'Álgebra' }] }],
    questionBankSelections: [{ subject: 'Matemática', topic: 'Álgebra', examType: 'ENEM' }],
  });

  assert.equal(result.kind, 'CREATED');
  if (result.kind !== 'CREATED') return;
  assert.deepEqual(result.materializationRun, { id: 'run-1', status: 'QUEUED', totalSelected: 73 });
  assert.deepEqual(operations, ['monitor', 'selections', 'run']);
});
