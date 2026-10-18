import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentSessionGuard } from '../../src/modules/student/guards/StudentSessionGuard';

const { useStudentMock, replaceMock } = vi.hoisted(() => ({
  useStudentMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock('../../src/modules/student/context/StudentContext', () => ({ useStudent: useStudentMock }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: replaceMock }) }));

describe('StudentSessionGuard', () => {
  beforeEach(() => {
    useStudentMock.mockReset();
    replaceMock.mockReset();
  });

  it('shows a retry action for a temporary session validation error', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    useStudentMock.mockReturnValue({ status: 'error', error: 'A validação demorou demais.', refreshSession: retry });

    render(<StudentSessionGuard><p>Área do aluno</p></StudentSessionGuard>);

    expect(screen.getByRole('alert')).toHaveTextContent('A validação demorou demais.');
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
