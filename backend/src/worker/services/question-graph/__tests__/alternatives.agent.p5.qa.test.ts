import assert from 'node:assert/strict';
import test from 'node:test';
import { createAlternativesAgentNode } from '../alternatives.agent.js';
import type { QuestionGraphState } from '../state.js';

const choices = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Escolha ${label}` }));
function graphState(input: {
  candidateId: string;
  statement: string;
  alternatives: Array<{ label: string; text: string }>;
  sourceText: string;
}): QuestionGraphState {
  return {
    executionId: 'qa-p5', documentId: 'doc-1', documentVersion: 'v1', model: 'test', promptVersion: 'p1',
    contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: [] },
    candidates: [{ candidateId: input.candidateId, id: input.candidateId, number: '1', statement: input.statement, alternatives: input.alternatives, correctAnswer: null, sourceChunkIds: ['chunk-1'] }],
    reviewDecisions: [{ candidateId: input.candidateId, route: 'alternatives', missingAlternativeLabels: [], alternativesNeedRepair: true, missingAnswer: true, pendingIssues: ['ALTERNATIVES_INCOMPLETE_OR_INVALID'] }],
    agentResults: {}, selectedRoute: 'alternatives', nextNode: 'alternatives_agent', selectedCandidateId: input.candidateId,
    stage: 'awaiting_alternatives', attempts: {}, errors: [], backendOutput: [],
  };
}
function response(alternatives: Array<{ label: string; text: string; origin: 'SOURCE_DOCUMENT' | 'AI_GENERATED'; evidenceQuote: string | null }>) {
  return { alternatives, corrections: [], pendingIssue: null };
}

test('AC-007: an A-H extraction with an assertion in F restores the assertion to the question stem', async () => {
  const assertion = 'I. A água apresenta maior densidade a 4 °C.';
  const sourceText = `[páginas 1-1; chunk chunk-a-h]\nAnalise as afirmações.\n${assertion}\n${choices.map(({ text }) => text).join('\n')}`;
  const existing = [...choices, { label: 'F', text: assertion }, { label: 'G', text: 'Distrator ilegível' }, { label: 'H', text: 'Outro rótulo indevido' }];
  const node = createAlternativesAgentNode({
    contextProvider: { async load() { return { text: sourceText, images: [] }; } },
    client: { async createStructuredChatCompletion<T>() { return response(choices.map((item) => ({ ...item, origin: 'SOURCE_DOCUMENT' as const, evidenceQuote: item.text }))) as T; } },
  });
  const initial = graphState({ candidateId: 'q-a-h', statement: 'Analise as afirmações.', alternatives: existing, sourceText });
  initial.candidates[0] = {
    ...initial.candidates[0]!, segmentId: 'exam-a-h',
    sourceRefs: { chunkIds: ['chunk-a-h'], pageNumbers: [1], evidenceRefs: ['chunk-a-h'], visualAssetIds: [] },
  };
  initial.segments = [{ segmentId: 'exam-a-h', pageStart: 1, pageEnd: 1, institution: 'IF', examName: 'A-H QA', year: 2026, modality: null, version: null, evidenceRefs: ['chunk-a-h'] }];
  const result = await node(initial);
  assert.ok(result.candidates?.[0]?.statement.includes(assertion), 'assertion recovered from the source must remain in the question stem');
  assert.ok(!result.agentResults?.['q-a-h']?.pendingIssues.includes('ALTERNATIVES_AGENT_ASSERTIONS_NOT_PRESERVED'));
});

test('AC-007: source-recovered alternatives retain SOURCE_DOCUMENT origin while generated gaps mark AI_GENERATED', async () => {
  const sourceRecovered = graphState({ candidateId: 'q-source', statement: 'Enunciado suficiente.', alternatives: [
    { label: 'A', text: 'OCR errado' }, { label: 'B', text: 'OCR errado' }, { label: 'C', text: 'OCR errado' },
    { label: 'D', text: 'OCR errado' }, { label: 'E', text: 'OCR errado' }, { label: 'F', text: 'rótulo excedente' },
  ], sourceText: choices.map(({ text }) => text).join('\n') });
  const generated = graphState({ candidateId: 'q-generated', statement: 'Enunciado suficiente.', alternatives: choices.slice(0, 3), sourceText: choices.slice(0, 3).map(({ text }) => text).join('\n') });
  const responseFor = (existing: Array<{ label: string; text: string }>) => response(['A', 'B', 'C', 'D', 'E'].map((label, index) => {
    const item = choices[index]!;
    const isInSource = existing.some((choice) => choice.label === label) && sourceRecovered.candidates[0]!.sourceChunkIds.length > 0;
    return { ...item, origin: isInSource ? 'SOURCE_DOCUMENT' as const : 'AI_GENERATED' as const, evidenceQuote: isInSource ? item.text : null };
  }));
  let current: QuestionGraphState | null = null;
  const node = createAlternativesAgentNode({
    contextProvider: { async load(_state, candidate) { current = _state as QuestionGraphState; return { text: current.candidates.find(({ candidateId }) => candidateId === candidate.candidateId)?.candidateId === 'q-source'
      ? sourceRecovered.candidates[0]!.sourceChunkIds.map(() => choices.map(({ text }) => text).join('\n')).join('\n')
      : choices.slice(0, 3).map(({ text }) => text).join('\n'), images: [] }; } },
    client: { async createStructuredChatCompletion<T>(request: any) {
      const candidate = current!.candidates.find(({ candidateId }) => candidateId === current!.selectedCandidateId)!;
      return responseFor(candidate.alternatives) as T;
    } },
  });
  const run = async (input: QuestionGraphState) => {
    const result = await node(input);
    const id = input.selectedCandidateId!;
    assert.deepEqual(result.agentResults?.[id]?.alternativesOrigin, id === 'q-source' ? 'SOURCE_DOCUMENT' : 'AI_GENERATED');
    assert.deepEqual(result.agentResults?.[id]?.changes?.[0]?.origin, id === 'q-source' ? 'SOURCE_DOCUMENT' : 'AI_GENERATED');
  };
  await run(sourceRecovered);
  await run(generated);
});
