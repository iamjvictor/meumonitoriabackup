import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TeacherIntelligencePanel } from '../../src/modules/teacher/components/intelligence/TeacherIntelligencePanel';
import { TeacherIntelligenceService } from '../../src/modules/teacher/services/TeacherIntelligenceService';

vi.mock('../../src/modules/teacher/services/TeacherIntelligenceService', () => ({
  isIntelligenceDemo: () => false,
  TeacherIntelligenceService: { getOverview: vi.fn(), getMonitor: vi.fn(), getStudent: vi.fn() },
}));

const metrics = { studentCount: 2, activeStudentCount: 1, attemptCount: 8, accuracy: 75, accuracyStudentCount: 1, averagePracticeDays: 2 };
const overview = { period: '30d' as const, generatedAt: new Date().toISOString(), metrics, monitors: [{ id: 'monitor-1', name: 'Matemática', metrics }] };

describe('TeacherIntelligencePanel', () => {
  afterEach(() => vi.clearAllMocks());

  it('navega da visão geral para monitor e detalhe de aluno', async () => {
    vi.mocked(TeacherIntelligenceService.getOverview).mockResolvedValue(overview);
    vi.mocked(TeacherIntelligenceService.getMonitor).mockResolvedValue({
      period: '30d', monitor: { id: 'monitor-1', name: 'Matemática' }, metrics,
      topics: { strongest: [{ name: 'Álgebra', accuracy: 90, attempts: 5, studentCount: 2 }], needsAttention: [] },
      students: [{ id: 'student-1', fullName: 'Ana Silva', email: 'ana@example.test', attemptCount: 5, accuracy: 80, lastActivityAt: new Date().toISOString() }],
      pagination: { page: 1, pageSize: 20, total: 1 },
    });
    vi.mocked(TeacherIntelligenceService.getStudent).mockResolvedValue({
      period: '30d', student: { id: 'student-1', fullName: 'Ana Silva', email: 'ana@example.test' }, monitor: { id: 'monitor-1', name: 'Matemática' },
      metrics: { attemptCount: 5, correctCount: 4, accuracy: 80, practiceDays: 2, lastActivityAt: new Date().toISOString(), flashcardReviewCount: 3 },
      topicPerformance: [{ topic: 'Álgebra', subject: 'Matemática', attemptCount: 5, accuracy: 80 }],
    });

    render(<TeacherIntelligencePanel />);
    expect(await screen.findByRole('button', { name: /Matemática/ })).toBeTruthy();
    expect(screen.getByText('0,1 questões por aluno por dia, em média')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Matemática/ }));
    expect(await screen.findByRole('button', { name: /Ana Silva/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ana Silva/ }));
    expect(await screen.findByText('4 de 5 respostas corretas')).toBeTruthy();
    await waitFor(() => expect(TeacherIntelligenceService.getStudent).toHaveBeenCalledWith('monitor-1', 'student-1', '30d'));
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    vi.mocked(TeacherIntelligenceService.getOverview).mockRejectedValue(new Error('Falha de conexão'));
    render(<TeacherIntelligencePanel />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeTruthy();
  });
});
