import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuestionGraphState } from '../question-graph/state.js';
import { StructuredQuestionExtractionService } from '../structured-question-extraction.service.js';

const alternatives = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Alternativa ${label}` }));
const doc = {
  id: 'doc-checkpoint-retry-qa', teacherId: 'teacher', monitorId: 'monitor', subjectId: 'subject', topicId: null,
  chunks: [{ id: 'chunk-1', chunkIndex: 0, text: 'Questão 7: determine a velocidade.', pages: [1], status: 'READY', docHash: 'c'.repeat(64) }],
  images: [],
};

test('retry restores checkpoint candidates, skips extraction LLM, and persists without rebinding origin', async () => {
  const extractionSnapshots = [
    { number: '7', statement: 'Questão 7 determina a velocidade média.', alternatives, correctAnswer: null,
      institution: 'IF', year: 2026, sourceChunkIds: ['chunk-1'], visualEvidence: [] },
    { number: '7', statement: 'Questão 7 determina aceleração média.', alternatives, correctAnswer: null,
      institution: 'IF', year: 2026, sourceChunkIds: ['chunk-1'], visualEvidence: [] },
  ];
  let extractionCalls = 0;
  let graphInvocations = 0;
  let getStateCalls = 0;
  let saveAttempts = 0;
  let terminalCheckpoint: QuestionGraphState | undefined;
  const savedCandidates: Array<Record<string, unknown>> = [];
  const graphRunner = {
    async getState(config: Record<string, unknown>) {
      getStateCalls += 1;
      if (!terminalCheckpoint) return { values: undefined, next: [], config };
      return {
        values: terminalCheckpoint,
        next: [],
        config: { ...config, configurable: { ...(config as { configurable?: object }).configurable, checkpoint_id: 'persisted-terminal' } },
      };
    },
    async invoke(input: QuestionGraphState | null) {
      graphInvocations += 1;
      if (!input) {
        assert.ok(terminalCheckpoint, 'resume should only invoke null after a saved graph checkpoint exists');
        return terminalCheckpoint;
      }
      const graphCandidate = input.candidates[0]!;
      terminalCheckpoint = {
        ...input,
        stage: 'ready',
        nextNode: 'end',
        execution: { pipelineVersion: 'questions-langgraph-v1', status: 'completed' },
        backendOutput: [{
          questionNumber: graphCandidate.number ?? null,
          statement: graphCandidate.statement,
          kind: 'MULTIPLE_CHOICE',
          alternatives: graphCandidate.alternatives,
          correctAnswer: 'B',
          institution: 'IF', year: 2026,
          alternativesGenerated: false, answerGenerated: true,
          alternativesOrigin: 'SOURCE_DOCUMENT', correctAnswerOrigin: 'AI_GENERATED',
          sourceChunkIds: graphCandidate.sourceChunkIds, visualEvidence: [],
          needsReview: true, status: 'PENDING_REVIEW', pendingIssues: ['ANSWER_PROPOSAL_REQUIRES_TEACHER_REVIEW'],
        }],
      } as QuestionGraphState;
      return terminalCheckpoint;
    },
  };
  const service = new StructuredQuestionExtractionService(
    { async createStructuredChatCompletion() { return { questions: [extractionSnapshots[extractionCalls++]!] }; } } as never,
    {
      async load() { return doc; },
      async save(_document: unknown, candidate: Record<string, unknown>) {
        saveAttempts += 1;
        if (saveAttempts === 1) throw new Error('simulated database interruption after graph completion');
        savedCandidates.push(candidate);
        return 'persisted-question';
      },
    } as never,
    1000, async () => ({ dataUrl: null, error: false }), graphRunner as never, false,
  );

  await assert.rejects(service.processDocument(doc.id), /simulated database interruption/);
  const retry = await service.processDocument(doc.id);

  assert.equal(extractionCalls, 1, 'retry must use the checkpointed original candidate instead of another nondeterministic extraction call');
  assert.equal(graphInvocations, 1, 'terminal checkpoint replay must not repeat graph nodes');
  assert.equal(getStateCalls, 2, 'retry must inspect the checkpoint before deciding to extract');
  assert.equal(saveAttempts, 2);
  assert.equal(retry.questions.length, 1);
  assert.equal(savedCandidates[0]?.statement, 'Questão 7 determina a velocidade média.');
  assert.deepEqual(savedCandidates[0]?.sourceChunkIds, ['chunk-1']);
  assert.equal(savedCandidates[0]?.correctAnswer, 'B');
  assert.equal(savedCandidates[0]?.correctAnswerOrigin, 'AI_GENERATED');
  assert.equal(savedCandidates[0]?.reviewStatus, 'PENDING_REVIEW');
});
