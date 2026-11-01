import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TeacherSponsoredClassesPage } from '../../src/modules/teacher/components/TeacherSponsoredClassesPage';
import { TeacherSponsoredSeatService } from '../../src/modules/teacher/services/TeacherSponsoredSeatService';
import { TeacherMonitorService } from '../../src/modules/teacher/services/TeacherMonitorService';

vi.mock('../../src/modules/teacher/services/TeacherSponsoredSeatService', () => ({
  TeacherSponsoredSeatApiError: class extends Error { code?: string; constructor(message: string, code?: string) { super(message); this.code = code; } },
    TeacherSponsoredSeatService: {
    listSponsoredBatches: vi.fn(), quoteSponsoredBatch: vi.fn(), createSponsoredBatch: vi.fn(), updateSponsoredBatch: vi.fn(), cancelSponsoredBatch: vi.fn(),
  },
  parseSponsoredEmails: (value: string) => {
    const emails = value.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean);
    const invalid = emails.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    const seen = new Set<string>();
    const duplicates = emails.filter((email) => seen.has(email) || !seen.add(email));
    return { emails, invalid, duplicates: [...new Set(duplicates)] };
  },
}));
vi.mock('../../src/modules/teacher/services/TeacherMonitorService', () => ({ TeacherMonitorService: { listMine: vi.fn() } }));

const monitor = { id: 'mon-1', name: 'Matemática', status: 'PUBLISHED', priceCents: 10000, annualPriceCents: 96000 } as any;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(TeacherMonitorService.listMine).mockResolvedValue([monitor]);
  vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockResolvedValue([]);
  vi.mocked(TeacherSponsoredSeatService.quoteSponsoredBatch).mockResolvedValue({
    monitorId: monitor.id, monitorName: monitor.name, interval: 'MONTHLY', serviceMonths: 1,
    seatCount: 2, beneficiaryEmails: ['a@test.com', 'b@test.com'], grossPriceCents: 10000,
    platformAmountCents: 7000, totalAmountCents: 14000,
  } as any);
  vi.mocked(TeacherSponsoredSeatService.createSponsoredBatch).mockResolvedValue({ batchId: 'batch-1', amountCents: 14000, checkoutUrl: 'https://checkout.test', expiresAt: null });
  vi.mocked(TeacherSponsoredSeatService.updateSponsoredBatch).mockResolvedValue({ batchId: 'batch-1', amountCents: 14000, checkoutUrl: 'https://checkout.test/updated', expiresAt: null });
});

afterEach(() => vi.resetAllMocks());

describe('TeacherSponsoredClassesPage', () => {
  const selectMonitor = () => fireEvent.change(screen.getByLabelText(/1\. escolha o monitor/i), { target: { value: 'mon-1' } });
  const choosePaymentMethod = (method: 'Pix' | 'Cartão de crédito') => {
    fireEvent.click(screen.getByRole('button', { name: /forma de pagamento/i }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(method, 'i') }));
  };
  it('normaliza os emails, consulta o total no servidor e mostra revisão antes de cobrar', async () => {
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    expect(screen.queryByLabelText(/adicione os alunos/i)).not.toBeInTheDocument();
    selectMonitor();
    choosePaymentMethod('Cartão de crédito');
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'A@Test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'b@Test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
    expect((await screen.findAllByText(/R\$ 140,00|R\$ 140,00/)).length).toBeGreaterThanOrEqual(2);
    expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'mon-1', interval: 'MONTHLY', beneficiaryEmails: ['a@test.com', 'b@test.com'] });
    expect(screen.getAllByText(/forma de pagamento: cartão de crédito/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2 vagas · mensal, recorrente/i)).toBeInTheDocument();
    expect(screen.getByText('Mensal recorrente')).toBeInTheDocument();
    expect(screen.getByText(/não há repasse ao professor/i)).toBeInTheDocument();
  });

  it('bloqueia e sinaliza e-mails duplicados antes de pedir cotação', async () => {
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    selectMonitor();
    choosePaymentMethod('Cartão de crédito');
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'ana@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'ANA@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/já está na lista/i);
    fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
    expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalledTimes(1);
    expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'mon-1', interval: 'MONTHLY', beneficiaryEmails: ['ana@test.com'] });
  });

  it('envia a cobrança aprovada e redireciona para o checkout hospedado', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    selectMonitor();
    choosePaymentMethod('Pix');
    for (const email of ['a@test.com', 'b@test.com']) {
      fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: email } });
      fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    }
    fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
    expect(await screen.findByText(/2 vagas · mensal, pagamento único para 1 mês/i)).toBeInTheDocument();
    expect(screen.getByText('Mensal · pagamento único para 1 mês')).toBeInTheDocument();
    expect(screen.getByText(/total: r\$\s*140,00 \(pagamento único para 1 mês\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/mensal, recorrente/i)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /ir para pagamento/i }));
    await waitFor(() => expect(TeacherSponsoredSeatService.createSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'mon-1', interval: 'MONTHLY', billingType: 'PIX', beneficiaryEmails: ['a@test.com', 'b@test.com'], expectedTotalAmountCents: 14000 }));
    expect(assign).toHaveBeenCalledWith('https://checkout.test');
  });

  it('destaca Pix recomendado no anual sem anunciar desconto que não está aplicado', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    vi.mocked(TeacherSponsoredSeatService.quoteSponsoredBatch).mockResolvedValue({
      monitorId: monitor.id, monitorName: monitor.name, interval: 'ANNUAL', serviceMonths: 12,
      seatCount: 1, beneficiaryEmails: ['aluno@test.com'], grossPriceCents: 96000,
      platformAmountCents: 57600, totalAmountCents: 57600,
    });
    vi.mocked(TeacherSponsoredSeatService.createSponsoredBatch).mockResolvedValue({ batchId: 'batch-pix', amountCents: 57600, checkoutUrl: 'https://checkout.test/pix', expiresAt: null });
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    selectMonitor();
    fireEvent.click(screen.getByRole('button', { name: /anual · 12 meses/i }));
    fireEvent.click(screen.getByRole('button', { name: /forma de pagamento/i }));
    expect(screen.getByText('Recomendado')).toBeInTheDocument();
    expect(screen.queryByText('10% OFF')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pix/i }));
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'aluno@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
    expect(await screen.findByText(/Total: R\$[\s ]576,00 \(pagamento único\)/i)).toBeInTheDocument();
    expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'mon-1', interval: 'ANNUAL', beneficiaryEmails: ['aluno@test.com'] });
    fireEvent.click(screen.getByRole('button', { name: /ir para pagamento/i }));
    await waitFor(() => expect(TeacherSponsoredSeatService.createSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'mon-1', interval: 'ANNUAL', billingType: 'PIX', beneficiaryEmails: ['aluno@test.com'], expectedTotalAmountCents: 57600 }));
    expect(assign).toHaveBeenCalledWith('https://checkout.test/pix');
  });

  it('mantém a cotação e mostra a falha de checkout abaixo da ação para permitir retry', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    vi.mocked(TeacherSponsoredSeatService.createSponsoredBatch)
      .mockRejectedValueOnce(Object.assign(new Error('Internal Server Error'), { statusCode: 503 }))
      .mockResolvedValueOnce({ batchId: 'batch-1', amountCents: 14000, checkoutUrl: 'https://checkout.test/retry', expiresAt: null });
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    selectMonitor();
    choosePaymentMethod('Cartão de crédito');
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'aluno@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
    fireEvent.click(await screen.findByRole('button', { name: /ir para pagamento/i }));

    const review = screen.getByLabelText('Revisão da compra');
    const paymentButton = within(review).getByRole('button', { name: /ir para pagamento/i });
    const alert = await within(review).findByRole('alert');
    expect(alert).toHaveTextContent('O serviço de turmas está instável. Tente novamente em instantes.');
    expect(paymentButton.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(within(review).getByText(/total: R\$\s*140,00/i)).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    fireEvent.click(paymentButton);
    await waitFor(() => expect(TeacherSponsoredSeatService.createSponsoredBatch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.test/retry'));
  });

  it('permite comprar uma vaga anual pagando somente a parte da plataforma', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    vi.mocked(TeacherSponsoredSeatService.quoteSponsoredBatch).mockResolvedValue({
      monitorId: monitor.id, monitorName: monitor.name, interval: 'ANNUAL', serviceMonths: 12,
      seatCount: 1, beneficiaryEmails: ['aluno@test.com'], grossPriceCents: 96000,
      platformAmountCents: 57600, totalAmountCents: 57600,
    } as any);
    vi.mocked(TeacherSponsoredSeatService.createSponsoredBatch).mockResolvedValue({ batchId: 'annual-batch', amountCents: 57600, checkoutUrl: 'https://checkout.test/annual', expiresAt: null });
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    selectMonitor();
    fireEvent.click(screen.getByRole('button', { name: /anual · 12 meses/i }));
    choosePaymentMethod('Cartão de crédito');
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'Aluno@Test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
    await waitFor(() => expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'mon-1', interval: 'ANNUAL', beneficiaryEmails: ['aluno@test.com'] }));
    expect(await screen.findByText(/Total: R\$[\s ]576,00 \(à vista ou em até 12x no cartão\)/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ir para pagamento/i }));
    await waitFor(() => expect(TeacherSponsoredSeatService.createSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'mon-1', interval: 'ANNUAL', billingType: 'CREDIT_CARD', beneficiaryEmails: ['aluno@test.com'], expectedTotalAmountCents: 57600 }));
    expect(assign).toHaveBeenCalledWith('https://checkout.test/annual');
  });

  it.each([
    ['MONTHLY', 'Cartão de crédito', 'CREDIT_CARD'],
    ['ANNUAL', 'Pix', 'PIX'],
  ] as const)('envia %s com %s ao criar checkout', async (plan, method, billingType) => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    selectMonitor();
    if (plan === 'ANNUAL') fireEvent.click(screen.getByRole('button', { name: /anual · 12 meses/i }));
    choosePaymentMethod(method);
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'aluno@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
    expect(await screen.findByText(new RegExp(`Forma de pagamento: ${method}`, 'i'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ir para pagamento/i }));
    await waitFor(() => expect(TeacherSponsoredSeatService.createSponsoredBatch).toHaveBeenCalledWith({
      monitorId: 'mon-1', interval: plan, billingType, beneficiaryEmails: ['aluno@test.com'], expectedTotalAmountCents: 14000,
    }));
    expect(assign).toHaveBeenCalledWith('https://checkout.test');
  });

  it('persona: professor particular adiciona somente um aluno ao monitor escolhido', async () => {
    vi.mocked(TeacherSponsoredSeatService.quoteSponsoredBatch).mockResolvedValue({
      monitorId: monitor.id, monitorName: monitor.name, interval: 'MONTHLY', serviceMonths: 1,
      seatCount: 1, beneficiaryEmails: ['particular@example.test'], grossPriceCents: 10000,
      platformAmountCents: 6000, totalAmountCents: 6000,
    } as any);
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    selectMonitor();
    choosePaymentMethod('Pix');
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'Particular@Example.test' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
    expect((await screen.findAllByText('particular@example.test')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/1 aluno na compra/i)).toBeInTheDocument();
    expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'mon-1', interval: 'MONTHLY', beneficiaryEmails: ['particular@example.test'] });
  });

  it('persona: cursinho Exatas ENEM prepara uma turma com cinco alunos', async () => {
    vi.mocked(TeacherMonitorService.listMine).mockResolvedValue([{ ...monitor, name: 'Exatas ENEM' }] as any);
    vi.mocked(TeacherSponsoredSeatService.quoteSponsoredBatch).mockResolvedValue({
      monitorId: monitor.id, monitorName: 'Exatas ENEM', interval: 'MONTHLY', serviceMonths: 1,
      seatCount: 5, beneficiaryEmails: ['e1@test.com', 'e2@test.com', 'e3@test.com', 'e4@test.com', 'e5@test.com'],
      grossPriceCents: 10000, platformAmountCents: 7000, totalAmountCents: 35000,
    } as any);
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Exatas ENEM' });
    selectMonitor();
    choosePaymentMethod('Cartão de crédito');
    for (const email of ['e1@test.com', 'e2@test.com', 'e3@test.com', 'e4@test.com', 'e5@test.com']) {
      fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: email } });
      fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    }
    expect(screen.getByText(/5 alunos na compra/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
    expect(await screen.findByText(/5 vagas · mensal, recorrente/i)).toBeInTheDocument();
    expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalledWith({
      monitorId: 'mon-1', interval: 'MONTHLY', beneficiaryEmails: ['e1@test.com', 'e2@test.com', 'e3@test.com', 'e4@test.com', 'e5@test.com'],
    });
  });

  it('mostra estados das vagas e permite cancelar lote mensal ativo', async () => {
    vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockResolvedValue([{
      id: 'batch-1', monitorId: 'mon-1', monitorName: 'Matemática', interval: 'MONTHLY', billingType: 'CREDIT_CARD', serviceMonths: 1,
      status: 'ACTIVE', seatCount: 3, grossPriceCents: 10000, platformAmountCents: 7000, totalAmountCents: 21000,
      currentPeriodStart: null, currentPeriodEnd: '2026-11-01T00:00:00.000Z', cancelAtPeriodEnd: false, checkoutUrl: null,
      createdAt: '2026-10-27T00:00:00Z', seats: [
        { id: '1', email: 'paid@test.com', status: 'ACTIVE', startsAt: null, endsAt: null, studentName: 'Aluno' },
        { id: '2', email: 'unclaimed@test.com', status: 'PAID_UNCLAIMED', startsAt: null, endsAt: null, studentName: null },
        { id: '3', email: 'pending@test.com', status: 'CHECKOUT_PENDING', startsAt: null, endsAt: null, studentName: null },
      ],
    }]);
    render(<TeacherSponsoredClassesPage />);
    fireEvent.click(await screen.findByText('Matemática', { selector: 'summary' }));
    expect(await screen.findByText('paid@test.com')).toBeInTheDocument();
    expect(screen.getByText('unclaimed@test.com')).toBeInTheDocument();
    expect(screen.getByText('pending@test.com')).toBeInTheDocument();
    expect(screen.getByText(/aguardando o aluno/i)).toBeInTheDocument();
  });

  it('identifica lote mensal pago por Pix como pagamento único sem ação de cancelar renovação', async () => {
    vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockResolvedValue([{
      id: 'monthly-pix', monitorId: 'mon-1', monitorName: 'Matemática', interval: 'MONTHLY', billingType: 'PIX', serviceMonths: 1,
      status: 'ACTIVE', seatCount: 1, grossPriceCents: 10000, platformAmountCents: 7000, totalAmountCents: 7000,
      currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, checkoutUrl: null,
      createdAt: '2026-10-27T00:00:00Z', seats: [],
    }] as any);
    render(<TeacherSponsoredClassesPage />);
    fireEvent.click(await screen.findByText('Matemática', { selector: 'summary' }));
    expect(await screen.findByText(/1 vagas · total r\$\s*70,00 · pagamento único para 1 mês/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar renovação/i })).not.toBeInTheDocument();
  });

  it('oferece retorno ao painel e mantém compra disponível quando o histórico falha', async () => {
    vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockRejectedValue(Object.assign(new Error('relation sponsored_seat_batches unavailable'), { statusCode: 500 }));
    render(<TeacherSponsoredClassesPage />);
    expect(await screen.findByRole('link', { name: /voltar ao painel/i })).toHaveAttribute('href', '/professor');
    await screen.findByRole('option', { name: 'Matemática' });
    selectMonitor();
    choosePaymentMethod('Pix');
    expect(screen.getByText(/ainda pode iniciar uma nova compra/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/o serviço de turmas está instável/i);
    expect(screen.queryByText(/relation sponsored_seat_batches unavailable/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'aluno@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
    await waitFor(() => expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalled());
  });

  it('consolida falhas simultâneas em um aviso amigável com retry', async () => {
    vi.mocked(TeacherMonitorService.listMine).mockRejectedValue(new Error('Erro interno do servidor.'));
    vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockRejectedValue(new Error('Erro interno do servidor.'));
    render(<TeacherSponsoredClassesPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/não foi possível carregar os dados das turmas/i);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText('Erro interno do servidor.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    await waitFor(() => {
      expect(TeacherMonitorService.listMine).toHaveBeenCalledTimes(2);
      expect(TeacherSponsoredSeatService.listSponsoredBatches).toHaveBeenCalledTimes(2);
    });
  });

  it('mostra estado sem monitores publicados e não permite solicitar cotação', async () => {
    vi.mocked(TeacherMonitorService.listMine).mockResolvedValue([{ ...monitor, status: 'DRAFT' }] as any);
    render(<TeacherSponsoredClassesPage />);
    expect(await screen.findByText(/publique um monitor/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revisar valores/i })).not.toBeInTheDocument();
  });

  it('mostra erro de cotação sem perder os dados digitados', async () => {
    vi.mocked(TeacherSponsoredSeatService.quoteSponsoredBatch).mockRejectedValue(Object.assign(new Error('Monitor indisponível.'), { statusCode: 503 }));
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    fireEvent.change(screen.getByLabelText(/1\. escolha o monitor/i), { target: { value: 'mon-1' } });
    choosePaymentMethod('Pix');
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'aluno@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    fireEvent.click(screen.getByRole('button', { name: /revisar valores/i }));
    const quoteButton = screen.getByRole('button', { name: /revisar valores/i });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('O serviço de turmas está instável. Tente novamente em instantes.');
    expect(quoteButton.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.getAllByText('aluno@test.com').length).toBeGreaterThanOrEqual(2);
  });

  it('adiciona e remove e-mails individualmente e mostra resumo atualizado', async () => {
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    fireEvent.change(screen.getByLabelText(/1\. escolha o monitor/i), { target: { value: 'mon-1' } });
    choosePaymentMethod('Pix');
    const input = screen.getByLabelText(/adicione os alunos um por vez/i);
    fireEvent.change(input, { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(await screen.findByText(/informe um e-mail válido/i)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'A@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect((await screen.findAllByText('a@test.com')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/1 aluno na compra/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /remover a@test.com/i }));
    expect(screen.queryByText('a@test.com')).not.toBeInTheDocument();
    expect(screen.getByText(/0 alunos na compra/i)).toBeInTheDocument();
  });

  it('mostra lote sem vagas com a mensagem de turma vazia quando expandido', async () => {
    vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockResolvedValue([{
      id: 'pending-empty', monitorId: 'mon-1', monitorName: 'Matemática', interval: 'MONTHLY', serviceMonths: 1,
      status: 'CHECKOUT_PENDING', seatCount: 0, grossPriceCents: 0, platformAmountCents: 0, totalAmountCents: 0,
      currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, checkoutUrl: null, seats: [], createdAt: '2026-10-27T00:00:00Z',
    }] as any);
    render(<TeacherSponsoredClassesPage />);
    const details = await screen.findByText('Matemática', { selector: 'summary' });
    expect(details.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(details);
    expect(await screen.findByText(/ainda não há alunos nesta turma/i)).toBeInTheDocument();
  });

  it('mostra monitor publicado sem lote em accordion expansível com estado vazio', async () => {
    vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockResolvedValue([]);
    render(<TeacherSponsoredClassesPage />);
    const summary = await screen.findByText('Matemática', { selector: 'summary' });
    const detail = summary.closest('details');
    expect(detail).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(await screen.findByText(/ainda não há alunos nesta turma/i)).toBeInTheDocument();
    expect(detail).toHaveAttribute('open');
  });

  it('permite editar somente lote pendente e pede cotação antes da atualização', async () => {
    vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockResolvedValue([{
      id: 'pending', monitorId: 'mon-1', monitorName: 'Matemática', interval: 'MONTHLY', billingType: 'PIX', serviceMonths: 1,
      status: 'CHECKOUT_PENDING', seatCount: 1, grossPriceCents: 10000, platformAmountCents: 7000, totalAmountCents: 7000,
      currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, checkoutUrl: 'https://checkout.test/old',
      seats: [{ id: 's1', email: 'old@test.com', status: 'CHECKOUT_PENDING', startsAt: null, endsAt: null, studentName: null }], createdAt: '2026-10-27T00:00:00Z',
    }] as any);
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    render(<TeacherSponsoredClassesPage />);
    fireEvent.click(await screen.findByText('Matemática', { selector: 'summary' }));
    fireEvent.click(await screen.findByRole('button', { name: /editar alunos/i }));
    expect(screen.getAllByText(/forma de pagamento: pix/i).length).toBeGreaterThanOrEqual(1);
    fireEvent.change(screen.getByLabelText(/editar e-mails/i), { target: { value: 'new@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar e continuar pagamento/i }));
    await waitFor(() => expect(TeacherSponsoredSeatService.quoteSponsoredBatch).toHaveBeenCalledWith({ monitorId: 'mon-1', interval: 'MONTHLY', beneficiaryEmails: ['new@test.com'] }));
    await waitFor(() => expect(TeacherSponsoredSeatService.updateSponsoredBatch).toHaveBeenCalledWith('pending', { beneficiaryEmails: ['new@test.com'], expectedTotalAmountCents: 14000 }));
    expect(assign).toHaveBeenCalledWith('https://checkout.test/updated');
  });

  it('exige escolher método antes de cotar e reinicia a escolha ao trocar o período', async () => {
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    selectMonitor();
    fireEvent.change(screen.getByLabelText(/adicione os alunos um por vez/i), { target: { value: 'aluno@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(screen.getByRole('button', { name: /revisar valores/i })).toBeDisabled();
    expect(TeacherSponsoredSeatService.quoteSponsoredBatch).not.toHaveBeenCalled();

    choosePaymentMethod('Pix');
    expect(screen.getByRole('button', { name: /revisar valores/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /anual · 12 meses/i }));
    expect(screen.getByText(/selecione a forma de pagamento/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revisar valores/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /forma de pagamento/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('expande os métodos disponíveis em ambos os períodos', async () => {
    render(<TeacherSponsoredClassesPage />);
    await screen.findByRole('option', { name: 'Matemática' });
    selectMonitor();
    fireEvent.click(screen.getByRole('button', { name: /forma de pagamento/i }));
    expect(screen.getByText('Pix', { selector: 'span.text-sm' })).toBeInTheDocument();
    expect(screen.getByText('Cartão de crédito', { selector: 'span.block' })).toBeInTheDocument();
    expect(screen.getByText('Pagamento único para um mês; a renovação será manual.')).toBeInTheDocument();
    expect(screen.getByText('Cobrança recorrente no cartão.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Pix', { selector: 'span.text-sm' }).closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: /anual · 12 meses/i }));
    expect(screen.getByText(/selecione a forma de pagamento/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /forma de pagamento/i }));
    expect(screen.getByText('Pix', { selector: 'span.text-sm' })).toBeInTheDocument();
    expect(screen.getByText('Cartão de crédito', { selector: 'span.block' })).toBeInTheDocument();
  });

  it('não oferece edição de lotes pagos ou em processamento', async () => {
    vi.mocked(TeacherSponsoredSeatService.listSponsoredBatches).mockResolvedValue(['ACTIVE', 'CHECKOUT_PAID_PENDING_PAYMENT'].map((status, index) => ({
      id: `paid-${index}`, monitorId: 'mon-1', monitorName: 'Matemática', interval: 'MONTHLY', serviceMonths: 1,
      status, seatCount: 1, grossPriceCents: 10000, platformAmountCents: 7000, totalAmountCents: 7000,
      currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, checkoutUrl: null,
      seats: [{ id: `s${index}`, email: `paid${index}@test.com`, status, startsAt: null, endsAt: null, studentName: null }], createdAt: '2026-10-27T00:00:00Z',
    })) as any);
    render(<TeacherSponsoredClassesPage />);
    fireEvent.click(await screen.findByText('Matemática', { selector: 'summary' }));
    await screen.findByText('paid0@test.com');
    expect(screen.queryByRole('button', { name: /editar alunos/i })).not.toBeInTheDocument();
  });
});
