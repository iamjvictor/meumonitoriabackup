import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TeacherSponsoredClassesPage } from '../../src/modules/teacher/components/TeacherSponsoredClassesPage';
import { TeacherSponsoredSeatService } from '../../src/modules/teacher/services/TeacherSponsoredSeatService';
import { TeacherMonitorService } from '../../src/modules/teacher/services/TeacherMonitorService';

vi.mock('../../src/modules/teacher/services/TeacherSponsoredSeatService', () => ({
  TeacherSponsoredSeatApiError: class extends Error { code?: string; constructor(message: string, code?: string) { super(message); this.code = code; } },
  TeacherSponsoredSeatService: { listSponsoredBatches: vi.fn(), quoteSponsoredBatch: vi.fn(), createSponsoredBatch: vi.fn(), updateSponsoredBatch: vi.fn(), cancelSponsoredBatch: vi.fn() },
  parseSponsoredEmails: (value: string) => { const emails = value.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean); return { emails, invalid: [], duplicates: [] }; },
}));
vi.mock('../../src/modules/teacher/services/TeacherMonitorService', () => ({ TeacherMonitorService: { listMine: vi.fn() } }));

const monitor = { id: 'monitor-1', name: 'Matemática enem', status: 'PUBLISHED', priceCents: 30000, annualPriceCents: 28752 } as any;
const quote = (interval: 'ANNUAL' | 'MONTHLY') => ({ monitorId: monitor.id, monitorName: monitor.name, interval, serviceMonths: interval === 'ANNUAL' ? 12 : 1, seatCount: 1, beneficiaryEmails: ['student@example.test'], grossPriceCents: 28752, platformAmountCents: 28752, totalAmountCents: 28752 });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(TeacherMonitorService.listMine).mockResolvedValue([monitor]);
  vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockResolvedValue([]);
  vi.mocked(TeacherSponsoredSeatService.quoteSponsoredBatch).mockImplementation(async (input) => quote(input.interval) as any);
});
afterEach(() => vi.resetAllMocks());

async function review(interval: 'ANNUAL' | 'MONTHLY', method: 'Pix' | 'Cartão de crédito') {
  render(<TeacherSponsoredClassesPage />);
  await screen.findByRole('option', { name: 'Matemática enem' });
  fireEvent.change(screen.getByLabelText(/1\. escolha o monitor/i), { target: { value: 'monitor-1' } });
  if (interval === 'ANNUAL') fireEvent.click(screen.getByRole('button', { name: /anual · 12 meses/i }));
  fireEvent.click(screen.getByRole('button', { name: /forma de pagamento/i }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(method, 'i') }));
  fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'student@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
  fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
  return screen.findByLabelText('Revisão da compra');
}

describe('TeacherSponsoredClassesPage installment estimate', () => {
  it('shows up to 12x and the rounded estimate for annual card in review and purchase summary', async () => {
    await review('ANNUAL', 'Cartão de crédito');
    expect(screen.getAllByText(/até 12x/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/R\$\s?23,96/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/estimativa/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/valor final serão confirmados no checkout Asaas/i).length).toBeGreaterThanOrEqual(1);
  });

  it('rounds non-divisible cents to a two-decimal installment estimate', async () => {
    vi.mocked(TeacherSponsoredSeatService.quoteSponsoredBatch).mockResolvedValue({ ...quote('ANNUAL'), totalAmountCents: 28753 } as any);
    await review('ANNUAL', 'Cartão de crédito');
    expect(screen.getAllByText(/R\$\s?23,96/).length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ['ANNUAL', 'Pix'],
    ['MONTHLY', 'Cartão de crédito'],
    ['MONTHLY', 'Pix'],
  ] as const)('does not show installment estimate for %s + %s', async (interval, method) => {
    await review(interval, method);
    expect(screen.queryByText(/até 12x|estimativa.*12/i)).not.toBeInTheDocument();
  });
});
