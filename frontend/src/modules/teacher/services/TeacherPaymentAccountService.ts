import { TeacherSessionError } from './TeacherSessionError';

export type PaymentAccount = {
  id: string;
  environment?: string;
  providerAccountId: string | null;
  providerWebhookId?: string | null;
  webhookSyncState?: 'PENDING' | 'ACTIVE' | 'FAILED' | string;
  walletId: string | null;
  revision: number;
  status: string;
  generalStatus: string | null;
  commercialInfoStatus: string | null;
  bankAccountStatus: string | null;
  documentationStatus: string | null;
  onboardingUrl: string | null;
  rejectionReason: string | null;
  verifiedAt: string | null;
  lastEventAt: string | null;
  paymentProfile?: {
    name: string;
    email: string;
    cpfCnpj: string;
    birthDate: string | null;
    companyType: string | null;
    mobilePhone: string;
    incomeValue: string | number;
    address: string;
    addressNumber: string;
    complement: string | null;
    province: string;
    postalCode: string;
    site: string | null;
  } | null;
};

export type PaymentAccountInput = {
  name: string;
  email: string;
  cpfCnpj: string;
  birthDate?: string;
  companyType?: 'MEI' | 'LIMITED' | 'INDIVIDUAL' | 'ASSOCIATION';
  mobilePhone: string;
  incomeValue: number;
  address: string;
  addressNumber: string;
  complement?: string;
  province: string;
  postalCode: string;
  site?: string;
};

const getBackendUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

function headers() {
  const result: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('mm_access_token');
    if (token) result.Authorization = `Bearer ${token}`;
  }
  return result;
}

export class PaymentAccountApiError extends Error {
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly statusCode: number;

  constructor(message: string, code?: string, fieldErrors?: Record<string, string[]>, statusCode = 400) {
    super(message);
    this.name = 'PaymentAccountApiError';
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.statusCode = statusCode;
  }
}

async function parse(response: Response) {
  if (response.status === 401 || response.status === 403) throw new TeacherSessionError();
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawCode = payload.error?.code || (typeof payload.error === 'string' ? payload.error : undefined);
    const rawMessage = payload.error?.message || payload.message || (typeof payload.error === 'string' ? payload.error : null);
    const fieldErrors = payload.error?.details?.fieldErrors || payload.details?.fieldErrors || undefined;

    let friendlyMessage = rawMessage || 'Não foi possível atualizar a conta de recebimento.';

    if (rawCode === 'ASAAS_ACCOUNT_VALIDATION_ERROR' || rawMessage === 'ASAAS_ACCOUNT_VALIDATION_ERROR') {
      friendlyMessage = 'O Asaas rejeitou os dados informados. Verifique se o CPF/CNPJ, CEP, data de nascimento e endereço correspondem aos seus dados cadastrais oficiais na Receita Federal.';
    } else if (rawCode === 'VALIDATION_ERROR' || rawMessage === 'VALIDATION_ERROR') {
      friendlyMessage = 'Dados cadastrais incompletos ou em formato inválido. Revise os campos do formulário.';
    } else if (rawCode === 'PAYMENT_ACCOUNT_ALREADY_EXISTS' || rawMessage === 'PAYMENT_ACCOUNT_ALREADY_EXISTS') {
      friendlyMessage = 'O professor já possui uma conta de recebimento configurada.';
    } else if (rawCode === 'TEACHER_PROFILE_NOT_FOUND' || rawMessage === 'TEACHER_PROFILE_NOT_FOUND') {
      friendlyMessage = 'Conclua seu perfil de professor antes de configurar o recebimento.';
    } else if (rawCode === 'ASAAS_ACCOUNT_PROVIDER_UNAVAILABLE') {
      friendlyMessage = 'O Asaas está temporariamente indisponível. Aguarde alguns minutos e confira o status da sua conta antes de tentar novamente.';
    } else if (rawCode === 'PAYMENT_ACCOUNT_CREATION_IN_PROGRESS') {
      friendlyMessage = 'Estamos confirmando a solicitação ao Asaas. Atualize o painel em instantes antes de tentar novamente.';
    } else if (rawCode === 'PAYMENT_ACCOUNT_RECONCILIATION_REQUIRED') {
      friendlyMessage = 'A solicitação está em confirmação com o Asaas. Não envie outra solicitação; nossa equipe vai revisar o vínculo.';
    }

    throw new PaymentAccountApiError(friendlyMessage, rawCode, fieldErrors, response.status);
  }
  return payload.data ?? null;
}

export const TeacherPaymentAccountService = {
  async get(): Promise<PaymentAccount | null> {
    const response = await fetch(`${getBackendUrl()}/api/v1/teachers/me/payment-account`, { headers: headers(), credentials: 'include' });
    return parse(response);
  },

  async create(input: PaymentAccountInput): Promise<PaymentAccount> {
    const sanitizedInput: PaymentAccountInput = {
      ...input,
      cpfCnpj: input.cpfCnpj.replace(/\D/g, ''),
      mobilePhone: input.mobilePhone.replace(/\D/g, ''),
      postalCode: input.postalCode.replace(/\D/g, ''),
    };
    const response = await fetch(`${getBackendUrl()}/api/v1/teachers/me/payment-account`, {
      method: 'POST',
      headers: headers(),
      credentials: 'include',
      body: JSON.stringify(sanitizedInput),
    });
    return parse(response);
  },
};
