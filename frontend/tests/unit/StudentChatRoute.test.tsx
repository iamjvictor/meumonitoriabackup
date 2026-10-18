import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StudentChatPage from '../../src/app/(student-app)/areadoaluno/chat/page';

vi.mock('../../src/modules/student/components/StudentRightSidebar', () => ({
  StudentRightSidebar: () => <aside data-testid="student-chat" />,
}));

describe('student chat route', () => {
  it('renders a dedicated conversation surface', () => {
    render(<StudentChatPage />);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByTestId('student-chat')).toBeInTheDocument();
    expect(screen.getByTestId('student-chat-surface').className).toContain('100dvh-3.8125rem-env(safe-area-inset-bottom)');
  });
});
