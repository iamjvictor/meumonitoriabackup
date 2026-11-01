import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatQuestionContextService } from './chat-question-context.service.js';

test('recarrega enunciado e alternativas oficiais no escopo autorizado', async () => {
  let query: unknown;
  const service = new ChatQuestionContextService({
    async findAuthorizedQuestion(input) {
      query = input;
      return { id: input.questionId, topicId: 'topic-1', topic: 'Gráficos', statement: 'Observe o gráfico e determine a pressão.', alternatives: [{ label: 'A', text: '10 kPa' }], sourceDocumentId: 'doc-1', sourceBlockId: 'block-1' };
    },
  });
  const result = await service.load({ questionId: 'question-1', attemptId: 'attempt-1', number: 6, scope: { studentId: 'student-1', teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1' } });
  assert.equal(result?.statement, 'Observe o gráfico e determine a pressão.');
  assert.deepEqual(result?.options, [{ label: 'A', text: '10 kPa' }]);
  assert.equal(result?.sourceDocumentId, 'doc-1');
  assert.deepEqual(query, { questionId: 'question-1', teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1' });
});

test('não cria contexto oficial quando a questão não está no escopo ou não está mais aprovada', async () => {
  const service = new ChatQuestionContextService({ async findAuthorizedQuestion() { return null; } });
  const result = await service.load({ questionId: 'foreign-question', scope: { studentId: 'student-1', teacherId: 'teacher-1', monitorId: 'monitor-1', subjectId: 'subject-1' } });
  assert.equal(result, null);
});
