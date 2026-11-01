import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { StudentProvider, useStudent } from '../../src/modules/student/context/StudentContext';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

function SessionProbe() {
  const { status } = useStudent();
  return <span>{status}</span>;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
});

describe('automatic claim for sponsored student seats', () => {
  it('claims paid seats only after the verified student session loads and refreshes entitlements', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/api/v1/session')) return Promise.resolve(new Response(JSON.stringify({ data: { userId: 'u-1', email: 'aluno@example.com', emailVerified: true, role: 'student' } }), { status: 200 }));
      if (url.endsWith('/student/sponsored-seats/claim')) return Promise.resolve(new Response(JSON.stringify({ data: { claimedCount: 1 } }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ data: { monitors: [] } }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StudentProvider><SessionProbe /></StudentProvider>);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/student/sponsored-seats/claim'))).toBe(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it('does not call claim when the authenticated email is not verified', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/api/v1/session')) return Promise.resolve(new Response(JSON.stringify({ data: { userId: 'u-2', email: 'aluno@example.com', emailVerified: false, role: 'student' } }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({ data: { monitors: [] } }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<StudentProvider><SessionProbe /></StudentProvider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/student/sponsored-seats/claim'))).toBe(false);
  });
});
