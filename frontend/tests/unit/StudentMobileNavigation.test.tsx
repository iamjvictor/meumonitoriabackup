import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StudentMobileNavigation } from '../../src/modules/student/components/StudentMobileNavigation';
import { StudentMobileNavigation as PublicStudentMobileNavigation } from '../../src/modules/student';
import {
  resolveStudentNavigationKey,
  studentMobileDestinations,
} from '../../src/modules/student/components/student-navigation';

describe('student mobile navigation model', () => {
  it('is available from the student module public barrel', () => {
    expect(PublicStudentMobileNavigation).toBe(StudentMobileNavigation);
  });

  it('resolves each student destination from its route', () => {
    expect(resolveStudentNavigationKey('/areadoaluno')).toBe('home');
    expect(resolveStudentNavigationKey('/areadoaluno/pratica')).toBe('practice');
    expect(resolveStudentNavigationKey('/areadoaluno/ranking')).toBe('ranking');
    expect(resolveStudentNavigationKey('/areadoaluno/desempenho')).toBe('performance');
    expect(resolveStudentNavigationKey('/areadoaluno/desempenho/')).toBe('performance');
    expect(resolveStudentNavigationKey('/areadoaluno/chat')).toBe('chat');
  });

  it('defines five destinations with practice as the central highlighted action', () => {
    expect(studentMobileDestinations).toHaveLength(5);
    expect(studentMobileDestinations.map((destination) => destination.key)).toEqual([
      'home',
      'chat',
      'practice',
      'ranking',
      'performance',
    ]);
    expect(studentMobileDestinations[2]).toMatchObject({
      href: '/areadoaluno/pratica',
      prominent: true,
    });
    expect(studentMobileDestinations[4]).toMatchObject({
      label: 'Desempenho',
      href: '/areadoaluno/desempenho',
    });
  });

  it('exposes one accessible active destination and keeps practice reachable', () => {
    const { rerender } = render(<StudentMobileNavigation activeNav="home" />);
    const navigation = screen.getByRole('navigation', { name: 'Navegação principal' });
    const links = screen.getAllByRole('link');

    expect(navigation).toBeInTheDocument();
    expect(links).toHaveLength(5);
    expect(screen.getByRole('link', { name: /Início/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Praticar/i })).toHaveAttribute('href', '/areadoaluno/pratica');
    expect(screen.getByRole('link', { name: /Chat/i })).not.toHaveAttribute('aria-current');

    rerender(<StudentMobileNavigation activeNav="practice" />);
    const practiceLink = screen.getByRole('link', { name: /Praticar/i });
    expect(practiceLink).toHaveAttribute('aria-current', 'page');
    expect(practiceLink.className).toContain('ring-[#76D69B]');
    expect(screen.getByRole('link', { name: /Início/i })).not.toHaveAttribute('aria-current');
  });
});
