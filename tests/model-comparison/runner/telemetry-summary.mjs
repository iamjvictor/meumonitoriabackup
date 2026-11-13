import { readFile } from 'node:fs/promises';

const UNKNOWN = 'NAO_VERIFICADO';

function sumKnown(values) {
  if (values.length === 0 || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) return UNKNOWN;
  return values.reduce((total, value) => total + value, 0);
}

function percentile(values, percentile) {
  if (!values.length) return UNKNOWN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

export function summarizeTelemetry(jsonl) {
  const events = jsonl.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const byRound = new Map();
  for (const event of events) {
    const key = String(event.repetition ?? UNKNOWN);
    if (!byRound.has(key)) byRound.set(key, []);
    byRound.get(key).push(event);
  }
  const rounds = [...byRound.entries()].map(([round, roundEvents]) => {
    const hasNetworkAttempt = roundEvents.some((event) => !String(event.outcome ?? '').startsWith('BLOCKED'));
    const schemaFirstAttemptByOperation = new Map();
    for (const event of roundEvents) {
      if (event.stage === 'embedding') continue;
      if (event.schemaValidFirstAttempt === false || event.jsonSchemaFailureObserved === true || (event.attempt === 1 && event.responseJsonValid === false)) {
        schemaFirstAttemptByOperation.set(event.operationId, false);
      }
    }
    const calls = roundEvents.map((event) => ({
      operationId: event.operationId ?? UNKNOWN,
      agent: event.agent ?? event.stage ?? UNKNOWN,
      stage: event.stage ?? UNKNOWN,
      model: event.model ?? UNKNOWN,
      attempt: event.attempt ?? UNKNOWN,
      attemptEvidence: event.attemptEvidence ?? UNKNOWN,
      schemaValidFirstAttempt: schemaFirstAttemptByOperation.get(event.operationId) ?? event.schemaValidFirstAttempt ?? UNKNOWN,
      inputTokens: event.inputTokens ?? UNKNOWN,
      outputTokens: event.outputTokens ?? UNKNOWN,
      reasoningTokens: event.reasoningTokens ?? UNKNOWN,
      latencyMs: event.latencyMs ?? UNKNOWN,
      costUsd: event.costUsd ?? UNKNOWN,
      costSource: event.costSource ?? UNKNOWN,
      responseJsonValid: event.responseJsonValid ?? UNKNOWN,
      provider: event.provider ?? UNKNOWN,
      requestedProvider: event.requestedProvider ?? UNKNOWN,
      embeddingPurpose: event.embeddingPurpose ?? UNKNOWN,
      inputCount: event.inputCount ?? UNKNOWN,
      embeddingCount: event.embeddingCount ?? UNKNOWN,
      error: event.error ?? UNKNOWN,
      httpStatus: event.httpStatus ?? UNKNOWN,
      responseContentType: event.responseContentType ?? UNKNOWN,
      rateLimitPacingMs: event.rateLimitPacingMs ?? UNKNOWN,
      retryAfterSeconds: event.retryAfterSeconds ?? UNKNOWN,
      schemaError: event.schemaError ?? UNKNOWN,
      jsonSchemaFailureObserved: event.jsonSchemaFailureObserved ?? UNKNOWN,
      outcome: event.outcome ?? 'RESPONSE_RECEIVED',
    }));
    const byAgentMap = new Map();
    for (const event of roundEvents) {
      const agent = event.agent ?? event.stage ?? UNKNOWN;
      if (!byAgentMap.has(agent)) byAgentMap.set(agent, []);
      byAgentMap.get(agent).push(event);
    }
    const byAgent = Object.fromEntries([...byAgentMap].map(([agent, callsForAgent]) => {
      const latencies = callsForAgent.map((event) => event.latencyMs).filter((value) => typeof value === 'number' && Number.isFinite(value));
      const schemaCalls = callsForAgent.filter((event) => event.stage !== 'embedding');
      const operationIds = [...new Set(schemaCalls.map((event) => event.operationId))];
      const operationSchemaStatuses = operationIds.map((id) => schemaFirstAttemptByOperation.get(id)).filter((value) => typeof value === 'boolean');
      const firstAttempts = schemaCalls.filter((event) => event.attempt === 1);
      const jsonSyntax = firstAttempts.map((event) => event.responseJsonValid).filter((value) => typeof value === 'boolean');
      return [agent, {
        attempts: callsForAgent.length,
        retries: callsForAgent.filter((event) => typeof event.attempt === 'number' && event.attempt > 1).length,
        retriesWithSchemaFeedback: callsForAgent.filter((event) => event.attemptEvidence === 'SCHEMA_RETRY_FEEDBACK').length,
        retriesInferredAfterFailure: callsForAgent.filter((event) => event.attemptEvidence === 'REPEATED_REQUEST_AFTER_RETRYABLE_FAILURE_INFERRED').length,
        jsonSchemaFailuresObserved: callsForAgent.filter((event) => event.jsonSchemaFailureObserved === true).length,
        jsonValidFirstAttemptRate: callsForAgent.every((event) => event.stage === 'embedding') ? 'NOT_APPLICABLE' : firstAttempts.length > 0 && jsonSyntax.length === firstAttempts.length ? jsonSyntax.filter(Boolean).length / jsonSyntax.length : UNKNOWN,
        jsonSchemaValidFirstAttemptRate: callsForAgent.every((event) => event.stage === 'embedding') ? 'NOT_APPLICABLE' : operationIds.length > 0 && operationSchemaStatuses.length === operationIds.length ? operationSchemaStatuses.filter(Boolean).length / operationSchemaStatuses.length : UNKNOWN,
        inputTokens: sumKnown(callsForAgent.map((event) => event.inputTokens)),
        outputTokens: sumKnown(callsForAgent.map((event) => event.outputTokens)),
        reasoningTokens: sumKnown(callsForAgent.map((event) => event.reasoningTokens)),
        costUsd: sumKnown(callsForAgent.map((event) => event.costUsd)),
        provider: callsForAgent.every((event) => typeof event.provider === 'string' && event.provider !== UNKNOWN && event.provider === callsForAgent[0]?.provider) ? callsForAgent[0].provider : UNKNOWN,
        latencyP50Ms: percentile(latencies, 0.5),
        latencyP95Ms: percentile(latencies, 0.95),
        rateLimitPacingMsTotal: sumKnown(callsForAgent.map((event) => event.rateLimitPacingMs)),
      }];
    }));
    const allLatencies = roundEvents.map((event) => event.latencyMs).filter((value) => typeof value === 'number' && Number.isFinite(value));
    return {
      round, status: hasNetworkAttempt ? 'CALLS_RECORDED' : 'ONLY_BLOCKED_CALLS', calls, metricsByAgent: byAgent,
      metrics: {
        attempts: calls.length,
        retries: roundEvents.filter((event) => typeof event.attempt === 'number' && event.attempt > 1).length,
        retriesWithSchemaFeedback: roundEvents.filter((event) => event.attemptEvidence === 'SCHEMA_RETRY_FEEDBACK').length,
        retriesInferredAfterFailure: roundEvents.filter((event) => event.attemptEvidence === 'REPEATED_REQUEST_AFTER_RETRYABLE_FAILURE_INFERRED').length,
        jsonSchemaFailuresObserved: roundEvents.filter((event) => event.jsonSchemaFailureObserved === true).length,
        invalidJsonResponses: roundEvents.filter((event) => event.responseJsonValid === false).length,
        jsonValidFirstAttemptRate: (() => {
          const schemaEvents = roundEvents.filter((event) => event.stage !== 'embedding');
          if (!schemaEvents.length) return 'NOT_APPLICABLE';
          const firstAttempts = schemaEvents.filter((event) => event.attempt === 1);
          return firstAttempts.length > 0 && firstAttempts.every((event) => typeof event.responseJsonValid === 'boolean')
            ? firstAttempts.filter((event) => event.responseJsonValid).length / firstAttempts.length
            : UNKNOWN;
        })(),
        jsonSchemaValidFirstAttemptRate: (() => {
          const schemaEvents = roundEvents.filter((event) => event.stage !== 'embedding');
          if (!schemaEvents.length) return 'NOT_APPLICABLE';
          const operationIds = [...new Set(schemaEvents.map((event) => event.operationId))];
          const statuses = operationIds.map((id) => schemaFirstAttemptByOperation.get(id)).filter((value) => typeof value === 'boolean');
          return operationIds.length > 0 && statuses.length === operationIds.length ? statuses.filter(Boolean).length / statuses.length : UNKNOWN;
        })(),
        httpErrors: roundEvents.filter((event) => event.outcome === 'HTTP_ERROR').length,
        unexpectedProviders: roundEvents.filter((event) => event.outcome === 'UNEXPECTED_PROVIDER').length,
        blockedEvents: roundEvents.filter((event) => String(event.outcome ?? '').startsWith('BLOCKED')).length,
        apiCallsSent: roundEvents.filter((event) => !String(event.outcome ?? '').startsWith('BLOCKED')).length,
        inputTokens: sumKnown(roundEvents.map((event) => event.inputTokens)),
        outputTokens: sumKnown(roundEvents.map((event) => event.outputTokens)),
        reasoningTokens: sumKnown(roundEvents.map((event) => event.reasoningTokens)),
        costUsd: sumKnown(roundEvents.map((event) => event.costUsd)),
        latencyP50Ms: percentile(allLatencies, 0.5),
        latencyP95Ms: percentile(allLatencies, 0.95),
        rateLimitPacingMsTotal: sumKnown(roundEvents.map((event) => event.rateLimitPacingMs)),
      },
    };
  });
  const hasNetworkAttempt = events.some((event) => !String(event.outcome ?? '').startsWith('BLOCKED'));
  return {
    rounds, calls: events.length,
    apiCallsSent: events.filter((event) => !String(event.outcome ?? '').startsWith('BLOCKED')).length,
    rateLimitPacingMsTotal: sumKnown(events.map((event) => event.rateLimitPacingMs)),
    status: !events.length ? 'NAO_VERIFICADO' : hasNetworkAttempt ? 'TELEMETRY_SUMMARIZED' : 'ONLY_BLOCKED_CALLS',
    reason: events.length ? UNKNOWN : 'Nenhuma chamada foi observada; preflight/dry-run não executou o pipeline.',
  };
}

export function finalizeSummaryWithTelemetry(summary, jsonl = '') {
  const telemetry = summarizeTelemetry(jsonl);
  const roundsByNumber = new Map(telemetry.rounds.map((round) => [String(round.round), round]));
  const rounds = (summary.rounds ?? []).map((round) => {
    const collected = roundsByNumber.get(String(round.round));
    return collected ? { ...round, calls: collected.calls, callMetrics: collected.metrics, metricsByAgent: collected.metricsByAgent, telemetryStatus: collected.status } : round;
  });
  return { ...summary, calls: telemetry.rounds.flatMap((round) => round.calls), callTelemetry: telemetry, rounds };
}

export async function finalizeSummaryWithTelemetryFile(summary, jsonlPath) {
  try {
    return finalizeSummaryWithTelemetry(summary, await readFile(jsonlPath, 'utf8'));
  } catch {
    const finalized = finalizeSummaryWithTelemetry(summary, '');
    finalized.callTelemetry = {
      ...finalized.callTelemetry,
      status: 'CALL_LOG_UNAVAILABLE',
      reason: 'Arquivo JSONL de chamadas indisponível; resumo de qualidade permanece não verificado.',
    };
    return finalized;
  }
}
