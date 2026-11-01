import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeacherPaymentAccountPanel } from '../../src/modules/teacher/components/TeacherPaymentAccountPanel';
import { TeacherPaymentAccountService, PaymentAccountApiError } from '../../src/modules/teacher/services/TeacherPaymentAccountService';

vi.mock('../../src/modules/teacher/services/TeacherPaymentAccountService', () => ({
  TeacherPaymentAccountService: {
    get: vi.fn(),
    create: vi.fn(),
  },
  PaymentAccountApiError: class extends Error {
    constructor(message: string, public code?: string, public fieldErrors?: Record<string, string[]>) {
      super(message);
      this.name = 'PaymentAccountApiError';
    }
  },
}));

vi.mock('../../src/modules/teacher/services/TeacherPaymentOverviewService', () => ({
  TeacherPaymentOverviewService: {
    get: vi.fn().mockResolvedValue(null),
  },
}));

const mockTeacher = {
  id: 'teacher-1',
  userId: 'user-1',
  fullName: 'Professor Teste',
  email: 'prof@example.com',
  phone: '11999998888',
  username: 'professor-teste',
  area: 'Matemática',
  pageSlug: 'professor-teste',
  bio: '',
  role: 'teacher',
  status: 'active' as const,
};

describe('TeacherPaymentAccountPanel Modal & Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(TeacherPaymentAccountService.get).mockResolvedValue(null);
  });

  it('renders modal with structured sections and accessible headers when isFormOpen is true', async () => {
    render(
      <TeacherPaymentAccountPanel
        teacher={mockTeacher}
        initialAccount={null}
        isFormOpen={true}
        onFormOpenChange={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Dados complementares da conta Asaas')).toBeInTheDocument();
    expect(screen.getByText('Identificação do Titular')).toBeInTheDocument();
    expect(screen.getByText('Contato & Financeiro')).toBeInTheDocument();
    expect(screen.getByText('Endereço')).toBeInTheDocument();
  });

  it('displays field validation errors on empty submission and does not call API', async () => {
    const { container } = render(
      <TeacherPaymentAccountPanel
        teacher={mockTeacher}
        initialAccount={null}
        isFormOpen={true}
        onFormOpenChange={vi.fn()}
      />
    );

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    expect(TeacherPaymentAccountService.create).not.toHaveBeenCalled();
    expect(await screen.findByText(/Por favor, revise os campos destacados/i)).toBeInTheDocument();
  });

  it('validates CPF checksum and blocks invalid CPF', async () => {
    const { container } = render(
      <TeacherPaymentAccountPanel
        teacher={mockTeacher}
        initialAccount={null}
        isFormOpen={true}
        onFormOpenChange={vi.fn()}
      />
    );

    const cpfInput = screen.getByLabelText(/CPF ou CNPJ/i);
    fireEvent.change(cpfInput, { target: { value: '111.111.111-11' } }); // CPF com dígitos repetidos

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    expect(TeacherPaymentAccountService.create).not.toHaveBeenCalled();
    expect(await screen.findByText(/CPF inválido/i)).toBeInTheDocument();
  });

  it('handles server rejection gracefully without displaying raw error codes', async () => {
    vi.mocked(TeacherPaymentAccountService.create).mockRejectedValueOnce(
      new PaymentAccountApiError(
        'O Asaas rejeitou os dados informados. Verifique se o CPF/CNPJ, CEP, data de nascimento e endereço correspondem aos seus dados cadastrais oficiais na Receita Federal.',
        'ASAAS_ACCOUNT_VALIDATION_ERROR',
      ),
    );

    const { container } = render(
      <TeacherPaymentAccountPanel
        teacher={mockTeacher}
        initialAccount={null}
        isFormOpen={true}
        onFormOpenChange={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'João Professor Teste' } });
    fireEvent.change(screen.getByLabelText(/E-mail para repasses/i), { target: { value: 'prof@example.com' } });
    fireEvent.change(screen.getByLabelText(/CPF ou CNPJ/i), { target: { value: '096.482.779-40' } });
    fireEvent.change(screen.getByLabelText(/Data de nascimento/i), { target: { value: '25/02/2000' } });
    fireEvent.change(screen.getByLabelText(/Celular com DDD/i), { target: { value: '(22) 99789-2096' } });
    fireEvent.change(screen.getByLabelText(/Renda ou faturamento mensal/i), { target: { value: '500000' } });
    fireEvent.change(screen.getByLabelText(/CEP/i), { target: { value: '24912-710' } });
    fireEvent.change(screen.getByLabelText(/Endereço/i), { target: { value: 'Rod. Amaral Peixoto' } });
    fireEvent.change(screen.getByLabelText(/Número/i), { target: { value: '29333' } });
    fireEvent.change(screen.getByLabelText(/Bairro/i), { target: { value: 'Centro' } });

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Atenção ao preencher os dados cadastrais/i)).toBeInTheDocument();
      expect(screen.getByText(/O Asaas rejeitou os dados informados/i)).toBeInTheDocument();
      expect(screen.queryByText(/^ASAAS_ACCOUNT_VALIDATION_ERROR$/)).not.toBeInTheDocument();
      expect(screen.getByText(/Dicas para aprovação imediata no Asaas:/i)).toBeInTheDocument();
    });
  });

  it('allows closing via Close button and Escape key', () => {
    const onFormOpenChange = vi.fn();
    render(
      <TeacherPaymentAccountPanel
        teacher={mockTeacher}
        initialAccount={null}
        isFormOpen={true}
        onFormOpenChange={onFormOpenChange}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /Fechar/i });
    fireEvent.click(closeBtn);
    expect(onFormOpenChange).toHaveBeenCalledWith(false);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onFormOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows that webhook notification setup is still being retried without mislabeling account approval', () => {
    render(<TeacherPaymentAccountPanel teacher={mockTeacher} initialAccount={{
      id: 'account-1', environment: 'SANDBOX', providerAccountId: 'asaas-1', providerWebhookId: null,
      webhookSyncState: 'PENDING', walletId: 'wallet-1', revision: 1, status: 'PENDING', generalStatus: 'PENDING',
      commercialInfoStatus: null, bankAccountStatus: null, documentationStatus: null, onboardingUrl: null,
      rejectionReason: null, verifiedAt: null, lastEventAt: null,
    }} />);

    expect(screen.getByRole('status')).toHaveTextContent(/configuração das notificações automáticas do Asaas/i);
    expect(screen.getByRole('heading', { name: 'Pendente' })).toBeInTheDocument();
  });
});
