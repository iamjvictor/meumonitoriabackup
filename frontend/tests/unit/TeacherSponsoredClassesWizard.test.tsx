import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TeacherSponsoredClassesPage } from '../../src/modules/teacher/components/TeacherSponsoredClassesPage';
import { TeacherSponsoredSeatService } from '../../src/modules/teacher/services/TeacherSponsoredSeatService';
import { TeacherMonitorService } from '../../src/modules/teacher/services/TeacherMonitorService';

vi.mock('../../src/modules/teacher/services/TeacherSponsoredSeatService', () => ({
  TeacherSponsoredSeatApiError: class extends Error { code?: string; constructor(message: string, code?: string) { super(message); this.code = code; } },
  TeacherSponsoredSeatService: { listSponsoredBatches: vi.fn(), quoteSponsoredBatch: vi.fn(), createSponsoredBatch: vi.fn(), updateSponsoredBatch: vi.fn(), cancelSponsoredBatch: vi.fn() },
  parseSponsoredEmails: (value: string) => {
    const emails = value.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean);
    const invalid = emails.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    return { emails, invalid, duplicates: [] };
  },
}));
vi.mock('../../src/modules/teacher/services/TeacherMonitorService', () => ({ TeacherMonitorService: { listMine: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(TeacherMonitorService.listMine).mockResolvedValue([{ id: 'mon-1', name: 'Matemática', status: 'PUBLISHED', priceCents: 10000, annualPriceCents: 96000 }] as any);
  vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockResolvedValue([]);
  vi.mocked(TeacherSponsoredSeatService.quoteSponsoredBatch).mockResolvedValue({ monitorId: 'mon-1', monitorName: 'Matemática', interval: 'MONTHLY', serviceMonths: 1, seatCount: 1, beneficiaryEmails: ['a@test.com'], grossPriceCents: 10000, platformAmountCents: 7000, totalAmountCents: 7000 } as any);
  vi.mocked(TeacherSponsoredSeatService.createSponsoredBatch).mockResolvedValue({ batchId: 'batch-1', amountCents: 7000, checkoutUrl: 'https://checkout.test', expiresAt: null });
});

describe('TeacherSponsoredClassesPage purchase steps', () => {
  it('separa seleção do plano, alunos e revisão, preservando dados ao voltar', async () => {
    render(<TeacherSponsoredClassesPage />);
    fireEvent.change(await screen.findByLabelText(/escolha o monitor/i), { target: { value: 'mon-1' } });
    fireEvent.click(screen.getByRole('button', { name: /forma de pagamento/i }));
    fireEvent.click(screen.getByRole('button', { name: /cartão de crédito/i }));
    fireEvent.click(screen.getByRole('button', { name: /continuar para alunos/i }));
    expect(screen.getByRole('navigation', { name: /etapas da compra/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'Aluno@Test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.click(screen.getByRole('button', { name: /voltar ao plano/i }));
    expect(screen.getByLabelText(/escolha o monitor/i)).toHaveValue('mon-1');
    fireEvent.click(screen.getByRole('button', { name: /continuar para alunos/i }));
    expect(screen.getAllByText('aluno@test.com').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/escolha o monitor/i)).not.toBeInTheDocument();
  });

  it('não avança sem monitor e forma de pagamento e só permite checkout após revisão cotada', async () => {
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    expect(screen.getByRole('button', { name: /continuar para alunos/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/escolha o monitor/i), { target: { value: 'mon-1' } });
    expect(screen.getByRole('button', { name: /continuar para alunos/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /forma de pagamento/i }));
    fireEvent.click(screen.getByRole('button', { name: /pix/i }));
    fireEvent.click(screen.getByRole('button', { name: /continuar para alunos/i }));
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'a@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.click(screen.getByRole('button', { name: /calcular valores e revisar/i }));
    await waitFor(() => expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'mon-1', interval: 'MONTHLY', beneficiaryEmails: ['a@test.com'] }));
    expect(screen.getByLabelText(/etapa 3: revisão da compra/i)).toHaveTextContent('a@test.com');
    expect(screen.getByRole('button', { name: /ir para pagamento/i })).toBeEnabled();
  });
});
