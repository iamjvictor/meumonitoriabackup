import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StudentAppShell } from '../../src/modules/student/components/StudentAppShell';

vi.mock('../../src/modules/student/components/StudentSidebar', () => ({
  StudentSidebar: () => <aside data-testid="desktop-student-sidebar" />,
}));

vi.mock('../../src/modules/student/components/StudentRightSidebar', () => ({
  StudentRightSidebar: () => <aside data-testid="desktop-chat-sidebar" />,
}));

describe('StudentAppShell', () => {
  it('keeps dashboard content above the mobile navigation safe area', () => {
    render(
      <StudentAppShell activeNav="home" header={<h1>Início</h1>}>
        <p>Conteúdo do dashboard</p>
      </StudentAppShell>,
    );

    const content = screen.getByTestId('student-app-content');
    expect(content).toContainElement(screen.getByText('Conteúdo do dashboard'));
    expect(content.tagName).toBe('MAIN');
    expect(content.className).toContain('pb-[calc(5rem+env(safe-area-inset-bottom))]');
    expect(content.className).toContain('overflow-x-clip');
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
  });
});
