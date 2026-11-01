import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentRightSidebar } from '../../src/modules/student/components/StudentRightSidebar';

const { studentContext } = vi.hoisted(() => ({
  studentContext: { value: {} as Record<string, unknown> },
}));

vi.mock('../../src/modules/student/context/StudentContext', () => ({
  useStudent: () => studentContext.value,
}));

const baseContext = () => ({
  monitors: [
    {
      id: 'monitor-1',
      name: 'Monitor Principal',
      teacher: { fullName: 'Ada Lovelace' },
      subjects: [
        { id: 'subject-math', name: 'Matemática' },
        { id: 'subject-history', name: 'História' },
      ],
    },
  ],
  activeContext: null,
  setActiveContext: vi.fn(),
  activeFlashcardContext: null,
  setActiveFlashcardContext: vi.fn(),
  chatMessages: [],
  chatScopeKey: 'monitor-1:subject-math',
  chatHistoryLoaded: true,
  setChatState: vi.fn(),
  chatSelectedScopeKey: 'monitor-1:subject-math',
  setChatSelectedScopeKey: vi.fn(),
});

describe('StudentRightSidebar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    studentContext.value = baseContext();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('switches the active subject and loads its history', async () => {
    const user = userEvent.setup();
    render(<StudentRightSidebar />);

    await user.click(screen.getByRole('button', { name: /Matemática.*Ada Lovelace/i }));
    await user.click(screen.getByRole('button', { name: /História.*Ada Lovelace/i }));

    expect(studentContext.value.setChatSelectedScopeKey).toHaveBeenCalledWith('monitor-1:subject-history');
  });

  it('shows a retry action after chat failure and succeeds on retry', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'CHAT_GENERATION_FAILED' }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { message: 'Resposta recuperada', messageId: 'msg-1' } }), { status: 200 }));
    render(<StudentRightSidebar />);

    const input = screen.getByPlaceholderText(/Digite sua dúvida/i);
    await user.type(input, 'Explique a questão');
    await user.click(screen.getByRole('button', { name: /Enviar mensagem/i }));

    expect(await screen.findByText(/Não foi possível gerar uma resposta agora/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(await screen.findByText('Resposta recuperada')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('renders and sends a flashcard attachment', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { message: 'Entendi o flashcard' } }), { status: 200 }));
    studentContext.value = {
      ...baseContext(),
      activeFlashcardContext: {
        id: 'flashcard-1', monitorId: 'monitor-1', subjectId: 'subject-math', front: 'O que é uma função?', back: 'Uma relação entre conjuntos.',
      },
    };
    render(<StudentRightSidebar />);

    expect(screen.getByText('Flashcard anexado')).toBeVisible();
    await user.type(screen.getByPlaceholderText(/flashcard/i), 'Pode explicar?');
    await user.click(screen.getByRole('button', { name: /Enviar mensagem/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/subjects/subject-math/messages'),
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('FLASHCARD') }),
    ));
  });

  it('sends a question attachment with its structured context', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { message: 'Resposta da questão' } }), { status: 200 }));
    studentContext.value = {
      ...baseContext(),
      activeContext: {
        id: 'question-1', monitorId: 'monitor-1', subjectId: 'subject-math', number: 7, statement: 'Quanto é 2 + 2?', options: [],
      },
    };
    render(<StudentRightSidebar />);

    await user.type(screen.getByPlaceholderText(/Questão #7/i), 'Explique a resposta');
    await user.click(screen.getByRole('button', { name: /Enviar mensagem/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/subjects/subject-math/messages'),
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('questionId') }),
    ));
  });

  it('uploads an image privately and sends its attachment ID with the chat message', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAT_IMAGE_INPUT_ENABLED', 'true');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { attachmentId: 'attachment-1', expiresAt: '2026-10-28T00:00:00.000Z' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { message: 'Vi a figura.' } }), { status: 200 }));
    render(<StudentRightSidebar />);

    await user.click(screen.getByRole('button', { name: /Anexar arquivo ou imagem/i }));
    await user.click(screen.getByRole('button', { name: /Imagem \(até 5 MB\)/i }));
    const file = new File(['fake-png'], 'grafico.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Selecionar imagem para anexar'), file);
    expect(await screen.findByText(/grafico.png/)).toBeVisible();
    await user.type(screen.getByPlaceholderText(/Digite sua dúvida/i), 'O que mostra?');
    await user.click(screen.getByRole('button', { name: /Enviar mensagem/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const chatCall = fetchMock.mock.calls[1];
    const body = JSON.parse(String(chatCall?.[1]?.body));
    expect(body.imageAttachmentIds).toEqual(['attachment-1']);
    expect(chatCall?.[1]?.credentials).toBe('include');
  });

  it('renders a real empty state when there are no monitors', () => {
    studentContext.value = { ...baseContext(), monitors: [] };
    render(<StudentRightSidebar />);

    expect(screen.getByText('Nenhum monitor ou matéria disponível para o chat.')).toBeVisible();
  });
});
