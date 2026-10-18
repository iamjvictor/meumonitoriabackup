import { describe, expect, it, vi } from 'vitest';
import { withSessionRequestTimeout, SessionRequestTimeoutError } from '../../src/modules/student/context/student-session-request';

describe('fetchWithTimeout', () => {
  it('rejects when the session request exceeds its deadline and aborts the request', async () => {
    let signal: AbortSignal | undefined;

    await expect(withSessionRequestTimeout((requestSignal) => {
      signal = requestSignal;
      return new Promise<never>(() => {});
    }, 5)).rejects.toBeInstanceOf(SessionRequestTimeoutError);
    expect(signal?.aborted).toBe(true);
  });
});
