import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TeacherSponsoredClassesPage } from '../../src/modules/teacher/components/TeacherSponsoredClassesPage';
import { TeacherSponsoredSeatService } from '../../src/modules/teacher/services/TeacherSponsoredSeatService';
import { TeacherMonitorService } from '../../src/modules/teacher/services/TeacherMonitorService';

vi.mock('../../src/modules/teacher/services/TeacherSponsoredSeatService', () => ({
  TeacherSponsoredSeatApiError: class extends Error {},
  TeacherSponsoredSeatService: { listSponsoredBatches: vi.fn(), quoteSponsoredBatch: vi.fn(), createSponsoredBatch: vi.fn(), updateSponsoredBatch: vi.fn(), cancelSponsoredBatch: vi.fn() },
  parseSponsoredEmails: (value: string) => ({ emails: value.split(/\s+/).filter(Boolean), invalid: [], duplicates: [] }),
}));
vi.mock('../../src/modules/teacher/services/TeacherMonitorService', () => ({ TeacherMonitorService: { listMine: vi.fn() } }));

const seat = (id: string, email: string, status: string, endsAt: string | null, studentName: string | null = null) => ({ id, email, status, startsAt: null, endsAt, studentName });
const batch = (id: string, interval: 'MONTHLY' | 'ANNUAL', seats: ReturnType<typeof seat>[]) => ({
  id, monitorId: 'm1', monitorName: 'Biologia', interval, billingType: 'PIX' as const, serviceMonths: interval === 'ANNUAL' ? 12 : 1,
  status: 'ACTIVE', seatCount: seats.length, grossPriceCents: 10000, platformAmountCents: 7000, totalAmountCents: 7000,
  currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, checkoutUrl: null, createdAt: '2026-01-01T00:00:00Z', seats,
});

describe('roster de turmas patrocinadas', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(TeacherMonitorService.listMine).mockResolvedValue([{ id: 'm1', name: 'Biologia', status: 'PUBLISHED', priceCents: 10000, annualPriceCents: 90000 }] as any);
    vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockResolvedValue([
      batch('monthly', 'MONTHLY', [seat('s1', 'Ana@exemplo.com', 'ACTIVE', '2099-12-31T00:00:00Z', 'Ana'), seat('s2', 'espera@exemplo.com', 'PAID_UNCLAIMED', '2099-12-31T00:00:00Z'), seat('s4', 'sem-data@exemplo.com', 'ACTIVE', null)]),
      { ...batch('annual', 'ANNUAL', [seat('s3', 'ana@exemplo.com', 'ACTIVE', '2020-01-01T00:00:00Z')]), createdAt: '2026-02-01T00:00:00Z' },
    ] as any);
  });

  it('filtra por plano, conta emails únicos e mostra status e expiração por aluno', async () => {
    render(<TeacherSponsoredClassesPage />);
    const monitorSummary = await screen.findByText('Biologia', { selector: 'summary' });
    fireEvent.click(monitorSummary);
    const group = await screen.findByRole('group', { name: /filtrar alunos de biologia por plano/i });
    expect(within(group).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('3 alunos')).toHaveLength(2);
    expect(screen.getAllByText(/ana@exemplo.com/i)).toHaveLength(1);
    expect(screen.getAllByRole('table').flatMap((table) => within(table).getAllByRole('row').slice(1))).toHaveLength(3);
    expect(screen.getByText('Pago · aguardando vínculo')).toBeInTheDocument();
    expect(screen.getByText('Expirado')).toBeInTheDocument();
    expect(screen.getByText('Data indisponível')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Comprar novamente' })).toHaveLength(1);

    fireEvent.click(within(group).getByRole('button', { name: 'Mensal' }));
    expect(screen.getAllByText('3 alunos')).toHaveLength(2);
    expect(screen.queryByText('Plano anual · 12 meses')).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('2099');

    fireEvent.click(within(group).getByRole('button', { name: 'Anual' }));
    expect(screen.getAllByText('1 aluno')).toHaveLength(1);
    expect(screen.getByText('Expirado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar renovação individual/i })).not.toBeInTheDocument();
  });

  it('calcula e inicia checkout para renovar individualmente o acesso expirado', async () => {
    vi.mocked(TeacherSponsoredSeatService.quoteSponsoredBatch).mockResolvedValue({ monitorId: 'm1', monitorName: 'Biologia', interval: 'ANNUAL', serviceMonths: 12, seatCount: 1, beneficiaryEmails: ['ana@exemplo.com'], grossPriceCents: 90000, platformAmountCents: 63000, totalAmountCents: 63000 } as any);
    vi.mocked(TeacherSponsoredSeatService.createSponsoredBatch).mockResolvedValue({ batchId: 'renewal-batch', amountCents: 63000, checkoutUrl: 'https://checkout.test/renewal', expiresAt: null });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    render(<TeacherSponsoredClassesPage />);
    fireEvent.click(await screen.findByText('Biologia', { selector: 'summary' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Comprar novamente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renovar acesso' });
    expect(within(dialog).getByText(/ana@exemplo.com/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /anual · 12 meses/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cartão de crédito' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Calcular valor' }));
    expect(await within(dialog).findByText(/Total:.*630,00/)).toBeInTheDocument();
    expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'm1', interval: 'ANNUAL', beneficiaryEmails: ['ana@exemplo.com'] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ir para pagamento' }));
    expect(screen.getByRole('dialog', { name: 'Renovar acesso' })).toBeInTheDocument();
    expect(TeacherSponsoredSeatService.createSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'm1', interval: 'ANNUAL', billingType: 'CREDIT_CARD', beneficiaryEmails: ['ana@exemplo.com'], expectedTotalAmountCents: 63000 });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.test/renewal'));
  });
});
