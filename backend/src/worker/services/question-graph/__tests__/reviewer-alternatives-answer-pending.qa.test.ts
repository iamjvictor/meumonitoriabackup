import assert from 'node:assert/strict';
import test from 'node:test';
import { StructuredCompletionError } from '../../../client/openrouter.client.js';
import { createQuestionGraphInput, createQuestionReviewerGraph } from '../reviewer.js';

const labels = ['A', 'B', 'C', 'D', 'E'] as const;

function alternatives(evidenceQuote: string | null, pendingIssue: string | null, optionsUsable = true) {
  return {
    alternatives: labels.map((label) => ({
      label,
      text: label === 'A' ? 'A reação libera energia.' : `Opção plausível ${label}.`,
      origin: 'AI_GENERATED',
      evidenceQuote,
    })),
    corrections: [],
    pendingIssue,
    optionsUsable,
  };
}

function input(runId: string) {
  return createQuestionGraphInput({
    executionId: runId,
    documentId: 'doc-qa',
    documentVersion: 'sha256:doc-v1',
    model: 'deepseek/test',
    promptVersion: 'prompt-qa',
    contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: [] },
    candidates: [{
      id: 'candidate-1', candidateId: 'candidate-1', number: '4',
      statement: 'Explique a reação química descrita no documento.', alternatives: [{ label: 'A', text: 'Resposta parcial.' }],
      correctAnswer: null, sourceChunkIds: ['chunk-1'],
    }],
  });
}

function structuredResponse(request: any, value: unknown) {
  try {
    return request.validate ? request.validate(value) : value;
  } catch (error) {
    throw new StructuredCompletionError('INVALID_SCHEMA', 'Saída estruturada inválida.', {
      model: 'deepseek/test',
      validationError: error,
      responseContent: JSON.stringify(value),
    });
  }
}

test('AI_GENERATED com evidenceQuote não nulo é corrigido e pendência pedagógica segue após answer', async () => {
  const requests: Array<{ schemaName: string; messages: Array<{ role: string; content: unknown }> }> = [];
  const responses = [
    alternatives('trecho que não é evidência literal', 'Opções geradas precisam de revisão pedagógica.'),
    alternatives(null, 'Opções geradas precisam de revisão pedagógica.'),
    { answerLabel: 'A', foundInSource: false, evidence: 'Resolução proposta a partir do enunciado.', confidence: 0.72, unresolvedReason: 'Gabarito não consta do contexto recuperado.' },
  ];
  const graph = createQuestionReviewerGraph({
    contextProvider: { load: async () => ({ text: 'Contexto OCR da questão.', images: [] }) },
    client: { createStructuredChatCompletion: async (request: any) => {
      requests.push(request);
      const value = responses.shift();
      assert.ok(value, 'nenhuma chamada LLM adicional deve ocorrer');
      return structuredResponse(request, value);
    } },
  });

  const result = await graph.invoke(input('qa-generated-pedagogical-pending'));
  const schemas = requests.map(({ schemaName }) => schemaName);
  assert.deepEqual(schemas, ['question_alternatives_completion', 'question_alternatives_completion', 'question_answer_key']);
  const answerPrompt = JSON.stringify(requests[2]?.messages);
  for (const label of labels) assert.match(answerPrompt, new RegExp(`${label}\\)`));
  assert.match(answerPrompt, /Opção plausível E\./);

  const [saved] = result.backendOutput;
  assert.deepEqual(saved?.alternatives.map(({ label }) => label), [...labels]);
  assert.equal(new Set(saved?.alternatives.map(({ label }) => label)).size, 5);
  assert.equal(saved?.correctAnswer, 'A');
  assert.equal(saved?.alternativesOrigin, 'AI_GENERATED');
  assert.equal(saved?.answerGenerated, true);
  assert.equal(saved?.status, 'PENDING_REVIEW');
  assert.equal(saved?.needsReview, true);
  assert.ok(saved?.pendingIssues.includes('ALTERNATIVES_CONTENT_REQUIRES_TEACHER_REVIEW'));
  assert.ok(saved?.pendingIssues.includes('Opções geradas precisam de revisão pedagógica.'));
  assert.ok(!saved?.pendingIssues.includes('ALTERNATIVES_AGENT_INCOMPLETE'));
});

test('pendingIssue que declara impossibilidade de criar opções coerentes não libera o agente de gabarito', async () => {
  const schemas: string[] = [];
  const graph = createQuestionReviewerGraph({
    contextProvider: { load: async () => ({ text: 'Contexto insuficiente para recuperar a questão.', images: [] }) },
    client: { createStructuredChatCompletion: async (request: any) => {
      schemas.push(request.schemaName);
      const value = request.schemaName === 'question_alternatives_completion'
        ? alternatives(null, 'Não foi possível criar cinco alternativas coerentes ou legíveis com o contexto disponível.', false)
        : { answerLabel: 'A', foundInSource: false, evidence: 'Resposta inventada.', confidence: 0.99, unresolvedReason: null };
      return structuredResponse(request, value);
    } },
  });

  const result = await graph.invoke(input('qa-alternatives-impossible-pending'));
  const [saved] = result.backendOutput;
  assert.deepEqual(schemas, ['question_alternatives_completion'], 'não deve haver gabarito sobre opções que o agente declarou incoerentes');
  assert.equal(saved?.correctAnswer, null);
  assert.equal(saved?.status, 'PENDING_REVIEW');
  assert.equal(saved?.needsReview, true);
  assert.ok(saved?.pendingIssues.some((issue) => /coerentes|legíveis/i.test(issue)));
  assert.ok(saved?.pendingIssues.includes('ALTERNATIVES_AGENT_INCOMPLETE'));
});
