import assert from 'node:assert/strict';
import test from 'node:test';
import { StructuredCompletionError } from '../../../client/openrouter.client.js';
import type { QuestionGraphState } from '../state.js';
import { createAlternativesAgentNode } from '../alternatives.agent.js';

function makeState(): QuestionGraphState {
  return {
    executionId: 'exec-retry', documentId: 'doc-retry', documentVersion: 'version-1', model: 'deepseek/test', promptVersion: 'prompt-1',
    contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: [] },
    candidates: [{ id: 'q1', candidateId: 'q1', number: '1', statement: 'Uma questão discursiva válida sobre química.',
      alternatives: [], correctAnswer: null, sourceChunkIds: ['chunk-1'], visualEvidence: [] }],
    reviewDecisions: [{ candidateId: 'q1', route: 'both', missingAlternativeLabels: ['A', 'B', 'C', 'D', 'E'], alternativesNeedRepair: true, missingAnswer: true, pendingIssues: [] }],
    agentResults: {}, selectedRoute: 'both', nextNode: 'alternatives_agent', selectedCandidateId: 'q1', stage: 'awaiting_both',
    attempts: {}, errors: [], backendOutput: [],
  };
}

function generatedAlternatives(evidenceQuote: string | null, optionsUsable = true) {
  return {
    alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Opção ${label}`, origin: 'AI_GENERATED', evidenceQuote })),
    corrections: [],
    optionsUsable,
    pendingIssue: 'O documento é discursivo; opções foram criadas para revisão docente.',
  };
}

test('corrige uma saída de schema com feedback e exige evidenceQuote nulo para opções geradas', async () => {
  const requests: Array<{ messages: Array<{ role: string; content: unknown }>; validate?: (value: unknown) => unknown }> = [];
  const responses = [generatedAlternatives('trecho citado sem suporte'), generatedAlternatives(null)];
  const node = createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: 'Contexto OCR da questão.', images: [] }) },
    client: { createStructuredChatCompletion: async <T>(request: { messages: Array<{ role: string; content: unknown }>; validate?: (value: unknown) => T }) => {
      requests.push(request);
      const raw = responses.shift();
      assert.ok(raw);
      try {
        return request.validate ? request.validate(raw) : raw as T;
      } catch (error) {
        throw new StructuredCompletionError('INVALID_SCHEMA', 'Saída estruturada inválida.', {
          model: 'deepseek/test', validationError: error, responseContent: JSON.stringify(raw),
        });
      }
    } },
  });

  const output = await node(makeState());

  assert.equal(requests.length, 2, 'uma falha de schema deve receber uma única tentativa corretiva');
  assert.match(JSON.stringify(requests[0]?.messages), /evidenceQuote.*null.*AI_GENERATED|AI_GENERATED.*evidenceQuote.*null/s);
  assert.match(JSON.stringify(requests[1]?.messages), /violou o schema|validation|refaça|refazer/i);
  assert.equal(output.candidates?.[0]?.alternatives.length, 5);
  assert.deepEqual(output.candidates?.[0]?.alternatives.map(({ label }) => label), ['A', 'B', 'C', 'D', 'E']);
  assert.ok(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_CONTENT_REQUIRES_TEACHER_REVIEW'));
  assert.ok(output.agentResults?.q1?.pendingIssues.includes('O documento é discursivo; opções foram criadas para revisão docente.'));
  assert.ok(!output.agentResults?.q1?.pendingIssues.some((issue) => issue === 'ALTERNATIVES_AGENT_INCOMPLETE'));
  assert.equal(output.errors?.length, 0);
});

test('não repete mais de uma vez após duas respostas de schema inválidas', async () => {
  let calls = 0;
  const node = createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: 'Contexto OCR da questão.', images: [] }) },
    client: { createStructuredChatCompletion: async () => {
      calls += 1;
      throw new StructuredCompletionError('INVALID_JSON', 'JSON inválido.', { model: 'deepseek/test' });
    } },
  });

  const output = await node(makeState());

  assert.equal(calls, 2);
  assert.ok(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_FAILED'));
});

test('corrige uma resposta vazia ou truncada exatamente uma vez', async () => {
  for (const code of ['EMPTY_RESPONSE', 'MODEL_OUTPUT_TRUNCATED'] as const) {
    let calls = 0;
    const node = createAlternativesAgentNode({
      contextProvider: { load: async () => ({ text: 'Contexto OCR da questão.', images: [] }) },
      client: { createStructuredChatCompletion: async <T>() => {
        calls += 1;
        if (calls === 1) throw new StructuredCompletionError(code, 'Resposta estruturada incompleta.', { model: 'deepseek/test' });
        return generatedAlternatives(null) as T;
      } },
    });

    const output = await node(makeState());

    assert.equal(calls, 2, `${code} deve permitir uma única tentativa corretiva`);
    assert.equal(output.candidates?.[0]?.alternatives.length, 5);
    assert.ok(!output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_FAILED'));
  }
});

test('não repete erro do provider', async () => {
  let calls = 0;
  const node = createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: 'Contexto OCR da questão.', images: [] }) },
    client: { createStructuredChatCompletion: async () => {
      calls += 1;
      throw new StructuredCompletionError('PROVIDER_ERROR', 'Falha do provider.', { model: 'deepseek/test', statusCode: 401 });
    } },
  });

  const output = await node(makeState());

  assert.equal(calls, 1);
  assert.ok(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_FAILED'));
});

test('mantém issue estrutural quando a resposta declara opções A–E não utilizáveis', async () => {
  const node = createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: 'Contexto insuficiente.', images: [] }) },
    client: { createStructuredChatCompletion: async <T>() => generatedAlternatives(null, false) as T },
  });

  const output = await node(makeState());

  assert.equal(output.candidates?.[0]?.alternatives.length, 5);
  assert.ok(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_INCOMPLETE'));
  assert.ok(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_CONTENT_REQUIRES_TEACHER_REVIEW'));
  assert.ok(output.agentResults?.q1?.pendingIssues.includes('O documento é discursivo; opções foram criadas para revisão docente.'));
});

test('trata campo optionsUsable ausente como não verificado e bloqueia avanço', async () => {
  const legacy = generatedAlternatives(null) as Record<string, unknown>;
  delete legacy.optionsUsable;
  const node = createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: 'Contexto OCR.', images: [] }) },
    client: { createStructuredChatCompletion: async <T>() => legacy as T },
  });

  const output = await node(makeState());

  assert.ok(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_INCOMPLETE'));
});
