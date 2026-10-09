import { describe, expect, it } from 'vitest';
import { dedupeAsyncRequest, type InFlightRequest } from '@/shared/utils/async-request-deduper';

describe('dedupeAsyncRequest', () => {
  it('compartilha uma requisição enquanto ela está em andamento', async () => {
    const state: InFlightRequest<number> = { current: null };
    let calls = 0;
    let resolveRequest!: (value: number) => void;
    const factory = () => {
      calls += 1;
      return new Promise<number>((resolve) => { resolveRequest = resolve; });
    };

    const first = dedupeAsyncRequest(state, factory);
    const second = dedupeAsyncRequest(state, factory);
    expect(first).toBe(second);
    expect(calls).toBe(0);

    await Promise.resolve();
    resolveRequest(42);
    await expect(first).resolves.toBe(42);
    expect(calls).toBe(1);
    expect(state.current).toBeNull();
  });

  it('permite nova requisição depois da anterior terminar', async () => {
    const state: InFlightRequest<number> = { current: null };
    let calls = 0;
    const factory = async () => ++calls;

    await expect(dedupeAsyncRequest(state, factory)).resolves.toBe(1);
    await expect(dedupeAsyncRequest(state, factory)).resolves.toBe(2);
  });
});
