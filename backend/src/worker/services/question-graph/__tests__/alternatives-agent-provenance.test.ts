import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { QuestionGraphState } from '../state.js';
import { createAlternativesAgentNode } from '../alternatives.agent.js';

const choices = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Opção ${label}` }));

function state(alternatives: Array<{ label: string; text: string }>, statement = 'Enunciado da questão.') : QuestionGraphState {
  return {
    executionId: 'run-alternatives', documentId: 'doc-alternatives', documentVersion: 'doc-v1', model: 'test-model', promptVersion: 'p1',
    segments: [{ segmentId: 'segment-1', pageStart: 1, pageEnd: 2, institution: null, examName: null, year: null, modality: null, version: null, evidenceRefs: ['chunk-1'] }],
    contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: [] },
    candidates: [{ id: 'candidate-1', segmentId: 'segment-1', number: '1', statement, alternatives, correctAnswer: null, sourceChunkIds: ['chunk-1'], sourceRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], evidenceRefs: ['chunk-1'], visualAssetIds: [] }, contentVersion: 'base-v1' }],
    reviewDecisions: [{ candidateId: 'candidate-1', route: 'alternatives', missingAlternativeLabels: [], alternativesNeedRepair: true, missingAnswer: false, pendingIssues: [] }],
    agentResults: {}, selectedRoute: 'alternatives', nextNode: 'alternatives_agent', selectedCandidateId: 'candidate-1', stage: 'awaiting_alternatives',
    attempts: {}, errors: [], backendOutput: [],
  };
}

function version(base: string, alternatives: Array<{ label: string; text: string }>): string {
  return createHash('sha256').update(JSON.stringify({ base, alternatives: alternatives.map(({ label, text }) => ({ label, text })) })).digest('hex');
}

function nodeFor(contextText: string, result: unknown) {
  return createAlternativesAgentNode({
    contextProvider: { async load() { return { text: contextText, images: [] }; } },
    client: { async createStructuredChatCompletion<T>() { return result as T; } },
  });
}

test('source-supported option corrections keep SOURCE_DOCUMENT origin and record before/after versions', async () => {
  const sourceOptions = ['Apenas I e III.', 'Apenas I e II.', 'Apenas II e III.', 'Todas corretas.', 'Todas falsas.'];
  const initial = state([{ label: 'A', text: 'OCR incorreto' }]);
  const final = sourceOptions.map((text, index) => ({ label: ['A', 'B', 'C', 'D', 'E'][index]!, text, origin: 'SOURCE_DOCUMENT', evidenceQuote: text }));
  const result = await nodeFor(sourceOptions.join('\n'), { alternatives: final, corrections: [], pendingIssue: null })(initial);

  const output = result.agentResults?.['candidate-1'];
  assert.equal(output?.alternativesOrigin, 'SOURCE_DOCUMENT');
  assert.equal(output?.inputVersion, version('base-v1', initial.candidates[0]!.alternatives));
  assert.equal(output?.outputVersion, version('base-v1', sourceOptions.map((text, index) => ({ label: ['A', 'B', 'C', 'D', 'E'][index]!, text }))));
  assert.notEqual(output?.inputVersion, output?.outputVersion);
  assert.equal(output?.changes?.at(-1)?.origin, 'SOURCE_DOCUMENT');
  assert.equal(result.candidates?.[0]?.contentVersion, 'base-v1');
});

test('marks alternatives AI_GENERATED only when generated option text is actually added', async () => {
  const initial = state([{ label: 'A', text: 'Opção A' }]);
  const sourceOptions = ['Opção A', 'Opção B', 'Opção C', 'Opção D'];
  const response = {
    alternatives: [
      { label: 'A', text: 'Opção A', origin: 'SOURCE_DOCUMENT', evidenceQuote: 'Opção A' },
      ...sourceOptions.slice(1).map((text, index) => ({ label: ['B', 'C', 'D'][index]!, text, origin: 'SOURCE_DOCUMENT', evidenceQuote: text })),
      { label: 'E', text: 'Opção criada pela IA', origin: 'AI_GENERATED', evidenceQuote: null },
    ],
    corrections: [], pendingIssue: null,
  };
  const result = await nodeFor(sourceOptions.join('\n'), response)(initial);

  assert.equal(result.agentResults?.['candidate-1']?.alternativesOrigin, 'AI_GENERATED');
  assert.equal(result.agentResults?.['candidate-1']?.changes?.at(-1)?.origin, 'AI_GENERATED');
});

test('does not silently discard assertion text extracted outside the statement', async () => {
  const statement = 'Assinale a opção correta.';
  const assertion = 'I. A substância reage em meio aquoso.';
  const initial = state([{ label: 'A', text: assertion }], statement);
  const sourceOptions = ['Apenas I.', 'Apenas II.', 'I e II.', 'Todas corretas.', 'Todas falsas.'];
  const response = {
    alternatives: sourceOptions.map((text, index) => ({ label: ['A', 'B', 'C', 'D', 'E'][index]!, text, origin: 'SOURCE_DOCUMENT', evidenceQuote: text })),
    corrections: [], pendingIssue: null,
  };
  const result = await nodeFor(sourceOptions.join('\n'), response)(initial);

  assert.equal(result.candidates?.[0]?.statement, statement);
  assert.equal(result.candidates?.[0]?.originalSnapshot?.alternatives[0]?.text, assertion);
  assert.ok(result.agentResults?.['candidate-1']?.pendingIssues.includes('ALTERNATIVES_AGENT_ASSERTION_POSITION_UNVERIFIED'));
});

test('restores a source-backed assertion from an extra alternative into the statement', async () => {
  const statement = 'Assinale a opção correta.';
  const assertion = 'I. A substância reage em meio aquoso.';
  const initial = state([{ label: 'F', text: assertion }], statement);
  const sourceOptions = ['Apenas I.', 'Apenas II.', 'I e II.', 'Todas corretas.', 'Todas falsas.'];
  const response = {
    alternatives: sourceOptions.map((text, index) => ({ label: ['A', 'B', 'C', 'D', 'E'][index]!, text, origin: 'SOURCE_DOCUMENT', evidenceQuote: text })),
    corrections: [], pendingIssue: null,
  };
  const context = `[páginas 1-1; chunk chunk-1]\n${assertion}\n${statement}\n${sourceOptions.join('\n')}`;
  const result = await nodeFor(context, response)(initial);

  assert.match(result.candidates?.[0]?.statement ?? '', /I\. A substância reage em meio aquoso\./);
  assert.match(result.candidates?.[0]?.statement ?? '', /I\. A substância reage em meio aquoso\.[\s\S]*Assinale a opção correta\./);
  assert.ok(!result.agentResults?.['candidate-1']?.pendingIssues.includes('ALTERNATIVES_AGENT_ASSERTIONS_NOT_PRESERVED'));
  assert.ok(result.agentResults?.['candidate-1']?.changes?.some((change) => change.field === 'statement' && change.origin === 'SOURCE_DOCUMENT'));
});

test('assertion found only in another segment stays pending and is not inserted', async () => {
  const statement = 'Assinale a opção correta.';
  const assertion = 'I. A substância reage em meio aquoso.';
  const initial = state([{ label: 'F', text: assertion }], statement);
  initial.segments = [
    { segmentId: 'segment-1', pageStart: 1, pageEnd: 4, institution: null, examName: null, year: null, modality: null, version: null, evidenceRefs: ['chunk-1'] },
    { segmentId: 'segment-2', pageStart: 20, pageEnd: 25, institution: null, examName: null, year: null, modality: null, version: null, evidenceRefs: ['chunk-other'] },
  ];
  const sourceOptions = ['Apenas I.', 'Apenas II.', 'I e II.', 'Todas corretas.', 'Todas falsas.'];
  const response = { alternatives: sourceOptions.map((text, index) => ({ label: ['A', 'B', 'C', 'D', 'E'][index]!, text, origin: 'SOURCE_DOCUMENT', evidenceQuote: text })), corrections: [], pendingIssue: null };
  const context = `[páginas 1-1; chunk chunk-1]\n${statement}\n${sourceOptions.join('\n')}\n[páginas 22-22; chunk chunk-other]\n${assertion}`;
  const result = await nodeFor(context, response)(initial);

  assert.equal(result.candidates?.[0]?.statement, statement);
  assert.ok(result.agentResults?.['candidate-1']?.pendingIssues.includes('ALTERNATIVES_AGENT_ASSERTION_CONTEXT_UNVERIFIED'));
});

test('assertion in an unreferenced continuation chunk lacks a position anchor and stays pending', async () => {
  const statement = 'Assinale a opção correta.';
  const assertion = 'I. A substância reage em meio aquoso.';
  const initial = state([{ label: 'F', text: assertion }], statement);
  const sourceOptions = ['Apenas I.', 'Apenas II.', 'I e II.', 'Todas corretas.', 'Todas falsas.'];
  const response = { alternatives: sourceOptions.map((text, index) => ({ label: ['A', 'B', 'C', 'D', 'E'][index]!, text, origin: 'SOURCE_DOCUMENT', evidenceQuote: text })), corrections: [], pendingIssue: null };
  const context = `[páginas 1-1; chunk chunk-1]\n${statement}\n${sourceOptions.join('\n')}\n[páginas 2-2; chunk continuation-unknown]\n${assertion}`;
  const result = await nodeFor(context, response)(initial);

  assert.equal(result.candidates?.[0]?.statement, statement);
  assert.ok(result.agentResults?.['candidate-1']?.pendingIssues.includes('ALTERNATIVES_AGENT_ASSERTION_POSITION_UNVERIFIED'));
});
