import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuestionGraphState } from '../state.js';
import { createAlternativesAgentNode } from '../alternatives.agent.js';

const state = (): QuestionGraphState => ({
  executionId: 'exec-1', documentId: 'doc-1', documentVersion: 'v1', model: 'deepseek/test', promptVersion: 'p1',
  contextRefs: { chunkIds: ['chunk-1'], pageNumbers: [1], formulaEvidenceRefs: [], imageAssetIds: ['asset-1'] },
  candidates: [{ id: 'q1', number: '01', statement: 'Enunciado da questão discursiva.', alternatives: [{ label: 'A', text: 'Alternativa preservada' }], correctAnswer: null, sourceChunkIds: ['chunk-1'], visualEvidence: [], kind: 'OPEN_ENDED' }],
  reviewDecisions: [{ candidateId: 'q1', route: 'both', missingAlternativeLabels: ['B', 'C', 'D', 'E'], alternativesNeedRepair: true, missingAnswer: true, pendingIssues: ['ALTERNATIVES_INCOMPLETE_OR_INVALID', 'ANSWER_MISSING'] }],
  selectedRoute: 'both', nextNode: null, selectedCandidateId: null, stage: 'awaiting_both', attempts: {}, errors: [], agentResults: {}, backendOutput: [],
});

test('alternatives agent preserves source choices, fills requested labels, and never edits answer', async () => {
  const input = state(); let request: any;
  const node = createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: 'Contexto OCR da questão', images: [] }) },
    client: { createStructuredChatCompletion: async <T>(value: any) => { request = value; return { alternatives: ['A', 'B', 'C', 'D', 'E'].map(label => ({ label, text: label === 'A' ? 'Alternativa preservada' : `${label} gerada`, origin: 'AI_GENERATED', evidenceQuote: null })), corrections: [], pendingIssue: null } as T; } },
  });
  const output = await node(input);
  const candidate = output.candidates?.[0]; assert.ok(candidate);
  assert.deepEqual(candidate.alternatives.map(a => a.label), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(candidate.alternatives[0]?.text, 'Alternativa preservada');
  assert.equal(candidate.correctAnswer, null);
  assert.equal(output.agentResults?.q1?.alternativesOrigin, 'AI_GENERATED');
  assert.equal(request.model, 'deepseek/test');
  assert.equal(request.maxTokens, null);
  assert.equal(request.timeoutMs, null);
});

test('agent supplies relevant figure to multimodal model and leaves unresolved labels pending', async () => {
  const input = state(); let imageAttached = false;
  const node = createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: 'Contexto e figura', images: [{ assetId: 'asset-1', mimeType: 'image/png', dataUrl: 'data:image/png;base64,YQ==', pageNumber: 2 }] }) },
    client: { createStructuredChatCompletion: async <T>(value: any) => { imageAttached = value.messages.some((m: any) => Array.isArray(m.content) && m.content.some((p: any) => p.type === 'image_url' && p.image_url.url === 'data:image/png;base64,YQ==')); return { alternatives: [{ label: 'B', text: 'B' }], corrections: [], pendingIssue: 'Fonte não contém as demais alternativas.' } as T; } },
  });
  const output = await node(input);
  const candidate = output.candidates?.[0]; assert.ok(candidate);
  assert.equal(imageAttached, true);
  assert.equal(candidate.alternatives.length, 1, 'resposta não contém exatamente A–E, então não substitui a candidata');
  assert.equal(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_FAILED'), true);
});

test('agent replaces an A-H extraction with exactly A-E and preserves assertion text in the question stem', async () => {
  const input = state();
  const statement = 'Analise as afirmações I, II e III e marque a combinação correta.';
  const sourceOptions = ['Todas as afirmações são corretas.', 'Apenas I e III.', 'Apenas I e II.', 'Apenas II e III.', 'Todas são falsas.'];
  input.candidates[0] = {
    ...input.candidates[0]!, statement, correctAnswer: 'D',
    alternatives: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((label, index) => ({ label, text: `Extração ${label}: ${sourceOptions[index % sourceOptions.length]}` })),
  };
  input.reviewDecisions[0] = {
    ...input.reviewDecisions[0]!, missingAlternativeLabels: [], alternativesNeedRepair: true,
  };
  let request: any;
  const node = createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: sourceOptions.join('\n'), images: [] }) },
    client: { createStructuredChatCompletion: async <T>(value: any) => {
      request = value;
      return {
        alternatives: ['A', 'B', 'C', 'D', 'E'].map((label, index) => ({ label, text: sourceOptions[index], origin: 'SOURCE_DOCUMENT', evidenceQuote: sourceOptions[index] })),
        corrections: ['A', 'B', 'C', 'D', 'E'].map((label, index) => ({ label, text: sourceOptions[index], evidenceQuote: sourceOptions[index] })),
        pendingIssue: null,
      } as T;
    } },
  });

  const output = await node(input);
  const repaired = output.candidates?.[0];
  assert.ok(repaired);
  assert.deepEqual(repaired.alternatives.map((alternative) => alternative.label), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(repaired.alternatives.map((alternative) => alternative.text), sourceOptions);
  assert.equal(repaired.correctAnswer, null, 'a remapped answer must be recomputed against final A-E choices');
  assert.equal(output.agentResults?.q1?.correctAnswer, null);
  assert.match(repaired.statement, /afirmações I, II e III/);
  assert.match(JSON.stringify(request.messages), /lista FINAL completa com exatamente cinco alternativas, uma para cada rótulo A, B, C, D e E/);
  assert.match(JSON.stringify(request.messages), /afirmações I, II, III, mantenha-as como conteúdo do enunciado/);
});

test('agent keeps a rejected source correction pending instead of silently accepting the old choice', async () => {
  const input = state();
  const source = ['Apenas I e III.', 'Apenas I e II.', 'Apenas II e III.', 'Todas corretas.', 'Todas falsas.'];
  input.candidates[0] = {
    ...input.candidates[0]!,
    statement: 'Analise as afirmações I, II e III.',
    alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Afirmação confundida com opção ${label}` })),
  };
  const output = await createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: source.join('\n'), images: [] }) },
    client: { createStructuredChatCompletion: async <T>() => ({
      alternatives: source.map((text, index) => ({ label: ['A', 'B', 'C', 'D', 'E'][index]!, text, origin: 'SOURCE_DOCUMENT', evidenceQuote: index === 0 ? 'quote not present in source' : text })),
      corrections: [{ label: 'A', text: source[0]!, evidenceQuote: 'not present in context' }],
      pendingIssue: null,
    }) as T },
  })(input);

  assert.equal(output.candidates?.[0]?.alternatives[0]?.text, 'Afirmação confundida com opção A');
  assert.ok(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_UNVERIFIED_CORRECTION'));
});

test('agent accepts source evidence that differs only by Unicode normalization and whitespace', async () => {
  const input = state();
  input.candidates[0] = {
    ...input.candidates[0]!,
    alternatives: [{ label: 'A', text: 'Texto OCR incorreto' }],
  };
  const contextText = 'Ａpenas I,\n   e III.';
  const finalText = 'Apenas I, e III.';
  const output = await createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: contextText, images: [] }) },
    client: { createStructuredChatCompletion: async <T>() => ({
      alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({
        label,
        text: label === 'A' ? finalText : `Opção ${label}`,
        origin: label === 'A' ? 'SOURCE_DOCUMENT' : 'AI_GENERATED',
        evidenceQuote: label === 'A' ? finalText : null,
      })),
      corrections: [{ label: 'A', text: finalText, evidenceQuote: finalText }],
      pendingIssue: null,
    }) as T },
  })(input);

  assert.equal(output.candidates?.[0]?.alternatives[0]?.text, finalText);
  assert.equal(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_UNVERIFIED_CORRECTION'), false);
});

test('agent rejects source evidence whose words differ from the proposed correction', async () => {
  const input = state();
  input.candidates[0] = {
    ...input.candidates[0]!,
    alternatives: [{ label: 'A', text: 'Texto OCR incorreto' }],
  };
  const contextText = 'Apenas I e III.\nApenas II e III.';
  const finalText = 'Apenas I e III.';
  const misleadingQuote = 'Apenas II e III.';
  const output = await createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: contextText, images: [] }) },
    client: { createStructuredChatCompletion: async <T>() => ({
      alternatives: ['A', 'B', 'C', 'D', 'E'].map((label) => ({
        label,
        text: label === 'A' ? finalText : `Opção ${label}`,
        origin: label === 'A' ? 'SOURCE_DOCUMENT' : 'AI_GENERATED',
        evidenceQuote: label === 'A' ? misleadingQuote : null,
      })),
      corrections: [{ label: 'A', text: finalText, evidenceQuote: misleadingQuote }],
      pendingIssue: null,
    }) as T },
  })(input);

  assert.equal(output.candidates?.[0]?.alternatives[0]?.text, 'Texto OCR incorreto');
  assert.ok(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_UNVERIFIED_CORRECTION'));
});

test('agent accepts a source-supported option replacement when its own evidence quote is valid', async () => {
  const input = state();
  input.candidates[0] = { ...input.candidates[0]!, alternatives: [{ label: 'A', text: 'Texto OCR incorreto' }] };
  const sourceOptions = ['Apenas I e III.', 'Apenas I e II.', 'Apenas II e III.', 'Todas corretas.', 'Todas falsas.'];
  const output = await createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: sourceOptions.join('\n'), images: [] }) },
    client: { createStructuredChatCompletion: async <T>() => ({
      alternatives: sourceOptions.map((text, index) => ({
        label: ['A', 'B', 'C', 'D', 'E'][index]!, text, origin: 'SOURCE_DOCUMENT', evidenceQuote: text,
      })),
      corrections: [{ label: 'A', text: 'Texto OCR antigo realocado', evidenceQuote: sourceOptions[0]! }],
      pendingIssue: null,
    }) as T },
  })(input);

  assert.equal(output.candidates?.[0]?.alternatives[0]?.text, sourceOptions[0]);
  assert.equal(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_UNVERIFIED_CORRECTION'), false);
  assert.equal(output.candidates?.[0]?.correctAnswer, null);
});

test('agent leaves a source option pending when its evidence quote is absent from context', async () => {
  const input = state();
  input.candidates[0] = { ...input.candidates[0]!, alternatives: [{ label: 'A', text: 'Texto OCR incorreto' }] };
  const sourceOptions = ['Apenas II e III.', 'Apenas I e II.', 'Todas corretas.', 'Todas falsas.', 'Apenas I.'];
  const output = await createAlternativesAgentNode({
    contextProvider: { load: async () => ({ text: sourceOptions.join('\n'), images: [] }) },
    client: { createStructuredChatCompletion: async <T>() => ({
      alternatives: ['Apenas I e III.', ...sourceOptions.slice(1)].map((text, index) => ({
        label: ['A', 'B', 'C', 'D', 'E'][index]!, text, origin: 'SOURCE_DOCUMENT', evidenceQuote: text,
      })),
      corrections: [{ label: 'A', text: 'Texto OCR incorreto realocado', evidenceQuote: 'Apenas I e III.' }],
      pendingIssue: null,
    }) as T },
  })(input);

  assert.equal(output.candidates?.[0]?.alternatives[0]?.text, 'Texto OCR incorreto');
  assert.ok(output.agentResults?.q1?.pendingIssues.includes('ALTERNATIVES_AGENT_UNVERIFIED_CORRECTION'));
});

test('candidate outside alternatives route remains unchanged while only candidate with gaps is processed', async () => {
  const input = state(); input.candidates.push({ id: 'q2', statement: 'Completa', alternatives: ['A', 'B', 'C', 'D', 'E'].map(label => ({ label, text: `texto ${label}` })), correctAnswer: 'A', sourceChunkIds: ['chunk-1'] });
  input.reviewDecisions.push({ candidateId: 'q2', route: 'complete', missingAlternativeLabels: [], alternativesNeedRepair: false, missingAnswer: false, pendingIssues: [] });
  let calls = 0;
  const output = await createAlternativesAgentNode({ contextProvider: { load: async () => ({ text: '', images: [] }) }, client: { createStructuredChatCompletion: async () => { calls++; throw Error('unexpected'); } } })(input);
  assert.equal(calls, 1); assert.deepEqual(output.candidates?.[1], input.candidates[1]);
});
