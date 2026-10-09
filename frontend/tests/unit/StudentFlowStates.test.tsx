import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PraticaPage from '../../src/app/(student-app)/areadoaluno/pratica/page';
import StudentRankingPage from '../../src/app/(student-app)/areadoaluno/ranking/page';

const { studentState, router } = vi.hoisted(() => ({
  studentState: { value: {} as Record<string, unknown> },
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }));
vi.mock('next/image', () => ({ default: ({ alt, ...props }: Record<string, unknown>) => <span aria-label={String(alt || '')} {...props} /> }));
vi.mock('@/modules/student', () => ({
  useStudent: () => studentState.value,
  StudentHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  StudentSidebar: () => <nav aria-label="Navegação principal" />,
  StudentRightSidebar: () => <aside aria-label="Chat" />,
}));

const authenticatedStudent = {
  userId: 'student-1', email: 'student@example.com', fullName: 'Aluno Teste', firstName: 'Aluno', initials: 'AT', role: 'student',
};

describe('student flow states', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    router.push.mockReset();
    router.replace.mockReset();
    studentState.value = {
      status: 'authenticated', student: authenticatedStudent, activeContext: null, setActiveContext: vi.fn(),
      fetchMonitors: vi.fn().mockResolvedValue([]),
    };
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows the practice empty state when the student has no monitors', async () => {
    render(<PraticaPage />);

    expect(await screen.findByText('Nenhum agente encontrado')).toBeVisible();
    expect(screen.getByText('Você ainda não assinou nenhum monitor de estudos.')).toBeVisible();
  });

  it('offers ranking retry after a failed request', async () => {
    let rankingAttempts = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/performance')) return new Response(JSON.stringify({ data: { monitors: [{ id: 'monitor-1', name: 'Monitor A' }] } }), { status: 200 });
      if (url.includes('/subscriptions')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      if (url.includes('/experience')) return new Response(JSON.stringify({ data: {} }), { status: 200 });
      if (!url.includes('/daily-challenge/ranking')) return new Response(JSON.stringify({ data: {} }), { status: 200 });
      rankingAttempts += 1;
      return rankingAttempts === 1
        ? new Response(JSON.stringify({ message: 'temporarily unavailable' }), { status: 503 })
        : new Response(JSON.stringify({ data: { ranking: [], currentStudent: null } }), { status: 200 });
    });

    render(<StudentRankingPage />);
    expect(await screen.findByText('Erro ao carregar dados do ranking')).toBeVisible();
    await screen.findByRole('button', { name: /Tentar novamente/i });
    await screen.getByRole('button', { name: /Tentar novamente/i }).click();
    await waitFor(() => expect(screen.getByText(/Ainda não há participantes/)).toBeVisible());
    expect(rankingAttempts).toBe(2);
  });

  it('keeps ranking in loading while monitor data is still pending', () => {
    vi.mocked(fetch).mockImplementation((input) => {
      if (String(input).includes('/performance')) return new Promise<Response>(() => {});
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    });

    render(<StudentRankingPage />);

    expect(screen.getByText('Carregando o ranking dos alunos...')).toBeVisible();
    expect(screen.queryByText('Ainda não há participantes')).not.toBeInTheDocument();
  });

});
