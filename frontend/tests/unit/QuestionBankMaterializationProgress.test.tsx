import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuestionBankMaterializationProgress } from '@/modules/teacher/components/monitor/QuestionBankMaterializationProgress';
import type { QuestionBankMaterializationRun } from '@/modules/teacher/services/TeacherMonitorService';

const run = (status: QuestionBankMaterializationRun['status'], overrides: Partial<QuestionBankMaterializationRun> = {}): QuestionBankMaterializationRun => ({
  id: 'run-1', status, totalSelected: 100, totalEligible: 80, processed: 32, created: 30, updated: 1, skipped: 1, failed: 0,
  attempts: 1, errorMessage: null, ...overrides,
});

describe('QuestionBankMaterializationProgress', () => {
  it('exibe contagem e percentual com o total efetivo', () => {
    render(<QuestionBankMaterializationProgress run={run('PROCESSING')} />);

    expect(screen.getByRole('progressbar', { name: 'Questões importadas' })).toHaveAttribute('aria-valuenow', '32');
    expect(screen.getByText('32 de 80 questões')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('identifica o total do catálogo como estimativa enquanto aguarda', () => {
    render(<QuestionBankMaterializationProgress run={run('QUEUED', { totalEligible: null, processed: 0 })} />);

    expect(screen.getByText(/estimativa do catálogo/)).toBeInTheDocument();
    expect(screen.getByText('0 de 100 questões (estimativa)')).toBeInTheDocument();
  });

  it('oferece retry somente após falha final', () => {
    const onRetry = vi.fn();
    render(<QuestionBankMaterializationProgress run={run('FAILED', { errorMessage: 'Falha ao consultar o acervo.' })} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByText('Falha ao consultar o acervo.')).toBeInTheDocument();
  });
});
