import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { TeacherSponsoredClassesPage } from '../../src/modules/teacher/components/TeacherSponsoredClassesPage';
import { TeacherSponsoredSeatService } from '../../src/modules/teacher/services/TeacherSponsoredSeatService';
import { TeacherMonitorService } from '../../src/modules/teacher/services/TeacherMonitorService';

vi.mock('../../src/modules/teacher/services/TeacherSponsoredSeatService', () => ({
  TeacherSponsoredSeatService: { listSponsoredBatches: vi.fn(), quoteSponsoredBatch: vi.fn(), createSponsoredBatch: vi.fn(), updateSponsoredBatch: vi.fn(), cancelSponsoredBatch: vi.fn() },
  TeacherSponsoredSeatApiError: class extends Error {},
  parseSponsoredEmails: (value: string) => {
    const emails = value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    return { emails, invalid: emails.filter((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)), duplicates: [] };
  },
}));
vi.mock('../../src/modules/teacher/services/TeacherMonitorService', () => ({ TeacherMonitorService: { listMine: vi.fn() } }));

const monitor = { id: 'fake-monitor', name: 'Exatas ENEM', status: 'PUBLISHED', priceCents: 10000, annualPriceCents: 96000 } as any;
const fakeCheckout = 'https://checkout.mock.invalid/session-123';
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(TeacherMonitorService.listMine).mockResolvedValue([monitor]);
  vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockResolvedValue([]);
  vi.mocked(TeacherSponsoredSeatService.quoteSponsoredBatch).mockImplementation(async (input: any) => ({
    monitorId: input.monitorId, monitorName: monitor.name, interval: input.interval, serviceMonths: input.interval === 'ANNUAL' ? 12 : 1,
    seatCount: input.beneficiaryEmails.length, beneficiaryEmails: input.beneficiaryEmails, grossPriceCents: 20000,
    platformAmountCents: 12345, totalAmountCents: 12345 * input.beneficiaryEmails.length,
  } as any));
  vi.mocked(TeacherSponsoredSeatService.createSponsoredBatch).mockResolvedValue({ batchId: 'fake-batch', amountCents: 12345, checkoutUrl: fakeCheckout, expiresAt: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function preparePurchase(interval: 'MONTHLY' | 'ANNUAL', method: 'Pix' | 'Cartão de crédito', count: number) {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
  render(<TeacherSponsoredClassesPage />);
  await screen.findByRole('option', { name: 'Exatas ENEM' });
  fireEvent.change(screen.getByLabelText(/1\. escolha o monitor/i), { target: { value: monitor.id } });
  if (interval === 'ANNUAL') fireEvent.click(screen.getByRole('button', { name: /anual · 12 meses/i }));
  fireEvent.click(screen.getByRole('button', { name: /forma de pagamento/i }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${method}`, 'i') }));
  const emails = Array.from({ length: count }, (_, i) => `aluno${i + 1}@example.test`);
  for (const email of emails) {
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: email } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
  }
  fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
  await screen.findByLabelText('Revisão da compra');
  return { assign, emails };
}

describe('independent sponsored purchase flow (mocked provider)', () => {
  it.each(['MONTHLY', 'ANNUAL'] as const)('verifica compra de um aluno para cada método no plano %s', async (interval) => {
    for (const method of ['Pix', 'Cartão de crédito'] as const) {
      const { assign, emails } = await preparePurchase(interval, method, 1);
      const review = screen.getByLabelText('Revisão da compra');
      expect(within(review).getByText(/1 vaga/i)).toBeInTheDocument();
      expect(within(review).getByText(new RegExp(`Forma de pagamento: ${method}`, 'i'))).toBeInTheDocument();
      expect(within(review).getByText(/total: R\$\s*123,45/i)).toBeInTheDocument();
      expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenLastCalledWith({ monitorId: monitor.id, interval, beneficiaryEmails: emails });
      fireEvent.click(within(review).getByRole('button', { name: /ir para pagamento/i }));
      await waitFor(() => expect(TeacherSponsoredSeatService.createSponsoredBatch).toHaveBeenLastCalledWith({ monitorId: monitor.id, interval, billingType: method === 'Pix' ? 'PIX' : 'CREDIT_CARD', beneficiaryEmails: emails, expectedTotalAmountCents: 12345 }));
      expect(assign).toHaveBeenCalledWith(fakeCheckout);
      cleanup();
    }
  });
  it.each([
    ['MONTHLY', 'Pix'], ['MONTHLY', 'Cartão de crédito'], ['ANNUAL', 'Pix'], ['ANNUAL', 'Cartão de crédito'],
  ] as const)('envia 10 alunos e mostra a lista no resumo (%s, %s)', async (interval, method) => {
    const { assign, emails } = await preparePurchase(interval, method, 10);
    const review = screen.getByLabelText('Revisão da compra');
    expect(within(review).getByText(/10 vagas/i)).toBeInTheDocument();
    for (const email of emails) expect(screen.getAllByText(email).length).toBeGreaterThanOrEqual(2);
    expect(within(review).getByText(/total: R\$\s*1\.234,50/i)).toBeInTheDocument();
    expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalledWith({ monitorId: monitor.id, interval, beneficiaryEmails: emails });
    fireEvent.click(within(review).getByRole('button', { name: /ir para pagamento/i }));
    await waitFor(() => expect(TeacherSponsoredSeatService.createSponsoredBatch).toHaveBeenCalledWith({ monitorId: monitor.id, interval, billingType: method === 'Pix' ? 'PIX' : 'CREDIT_CARD', beneficiaryEmails: emails, expectedTotalAmountCents: 123450 }));
    expect(assign).toHaveBeenCalledWith(fakeCheckout);
  });
  it('bloqueia cotação quando email é inválido', async () => {
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Exatas ENEM' });
    fireEvent.change(screen.getByLabelText(/1\. escolha o monitor/i), { target: { value: monitor.id } });
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'email-invalido' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/válido/i);
    expect(TeacherSponsoredSeatService.quoteSponsoredBatch).not.toHaveBeenCalled();
    expect(TeacherSponsoredSeatService.createSponsoredBatch).not.toHaveBeenCalled();
  });
});
