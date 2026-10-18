import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherMonitorCreationModal } from '../../src/modules/teacher/components/TeacherMonitorCreationModal';

const { getCatalogMock, replaceMock } = vi.hoisted(() => ({
  getCatalogMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock('../../src/modules/teacher/services/TeacherMonitorService', () => ({
  TeacherMonitorService: { getQuestionBankCatalog: getCatalogMock },
}));
vi.mock('next/navigation', () => {
  const router = { replace: replaceMock, push: vi.fn() };
  return { useRouter: () => router };
});

const catalogFixture = {
  totalQuestions: 17,
  examProfiles: [
    { id: 'enem', name: 'ENEM', examType: 'ENEM', board: null, category: 'Vestibulares & ENEM', description: 'Prova nacional', badge: 'OFICIAL', questionCount: 10 },
    { id: 'concurso-fgv', name: 'Fundação CESGRANRIO', examType: 'CONCURSO', board: 'CESGRANRIO', category: 'Concursos', description: 'Prova da banca', badge: 'OFICIAL', questionCount: 7 },
  ],
  subjects: [{
    id: 'matematica', name: 'Matemática', category: 'Ciências Exatas', totalQuestions: 17,
    examProfileIds: ['enem', 'concurso-fgv'], questionCountsByProfile: { enem: 10, 'concurso-fgv': 7 },
    topics: [{
      id: 'algebra', name: 'Álgebra', totalQuestions: 17,
      examProfileIds: ['enem', 'concurso-fgv'], questionCountsByProfile: { enem: 10, 'concurso-fgv': 7 },
      subtopics: [
        { id: 'linear', name: 'Álgebra Linear', questionCount: 6, examProfileIds: ['enem', 'concurso-fgv'], questionCountsByProfile: { enem: 4, 'concurso-fgv': 2 }, subsubtopics: [] },
        { id: 'funcoes', name: 'Funções ENEM', questionCount: 5, examProfileIds: ['enem'], questionCountsByProfile: { enem: 5 }, subsubtopics: [] },
        { id: 'geometria', name: 'Geometria CESGRANRIO', questionCount: 5, examProfileIds: ['concurso-fgv'], questionCountsByProfile: { 'concurso-fgv': 5 }, subsubtopics: [] },
      ],
    }],
  }],
};

async function reachProfileStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: /Entendi a importância de escolher um tema específico/ }));
  await user.click(screen.getAllByRole('button', { name: 'Começar estruturação' })[0]!);
  await user.type(screen.getByRole('textbox', { name: 'Nome do Monitor de IA' }), 'Monitor de provas');
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByText(/perfil de prova selecionado/);
}

function renderModal() {
  return render(<TeacherMonitorCreationModal isOpen onClose={vi.fn()} onCreated={async () => {}} />);
}

describe('TeacherMonitorCreationModal bank selection', () => {
  beforeEach(() => {
    getCatalogMock.mockReset().mockResolvedValue(catalogFixture);
    replaceMock.mockReset();
  });

  it('starts with no exam profile selected and keeps that state after reset', async () => {
    const user = userEvent.setup();
    const view = renderModal();
    await reachProfileStep(user);

    const initialCheckboxes = screen.getAllByRole('checkbox');
    expect(initialCheckboxes).toHaveLength(2);
    expect(initialCheckboxes.every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true);

    await user.click(screen.getByRole('checkbox', { name: /Fundação CESGRANRIO/ }));
    await user.click(screen.getByTitle('Fechar'));
    view.rerender(<TeacherMonitorCreationModal isOpen onClose={vi.fn()} onCreated={async () => {}} />);
    await reachProfileStep(user);

    expect(screen.getAllByRole('checkbox').every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true);
  });

  it('shows only the selected profile taxonomy and its question counts', async () => {
    const user = userEvent.setup();
    renderModal();
    await reachProfileStep(user);
    await user.click(screen.getByRole('checkbox', { name: /Fundação CESGRANRIO/ }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText('7 questões')).toBeVisible();
    await user.click(screen.getByTitle('Expandir subtópicos'));
    expect(screen.getByText('Geometria CESGRANRIO')).toBeVisible();
    expect(screen.queryByText('Funções ENEM')).not.toBeInTheDocument();
    expect(screen.getByText('5 q.')).toBeVisible();
  });

  it('shows a prompt instead of unfiltered catalog rows when no profile is selected', async () => {
    const user = userEvent.setup();
    renderModal();
    await reachProfileStep(user);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText(/Selecione uma ou mais bancas para filtrar o acervo/)).toBeVisible();
    expect(screen.queryByText('Matemática')).not.toBeInTheDocument();
  });

  it('shows an unavailable state instead of a fabricated ENEM profile when catalog loading fails', async () => {
    const user = userEvent.setup();
    getCatalogMock.mockRejectedValueOnce(new Error('API indisponível'));
    renderModal();
    await reachProfileStep(user);

    expect(await screen.findByText(/Não foi possível carregar as bancas e matérias do banco/)).toBeVisible();
    expect(screen.queryByText('1.538 questões no banco')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /ENEM/ })).not.toBeInTheDocument();
  });

  it('uses each selected profile name in the summary chip', async () => {
    const user = userEvent.setup();
    renderModal();
    await reachProfileStep(user);
    await user.click(screen.getByRole('checkbox', { name: /Fundação CESGRANRIO/ }));

    expect(screen.getAllByText('Fundação CESGRANRIO').length).toBeGreaterThan(1);
  });
});
