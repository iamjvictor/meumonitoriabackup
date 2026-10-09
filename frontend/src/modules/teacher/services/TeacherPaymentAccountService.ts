import { TeacherSessionError } from './TeacherSessionError';

export type PaymentAccount = {
  id: string;
  environment?: string;
  providerAccountId: string | null;
  providerWebhookId?: string | null;
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

async function parse(response: Response) {
  if (response.status === 401 || response.status === 403) throw new TeacherSessionError();
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg =
      payload.error?.message ||
      payload.message ||
      (typeof payload.error === 'string' ? payload.error : null) ||
      'Não foi possível atualizar a conta de recebimento.';
    throw new Error(errorMsg);
  }
  return payload.data ?? null;
}

export const TeacherPaymentAccountService = {
  async get(): Promise<PaymentAccount | null> {
    const response = await fetch(`${getBackendUrl()}/api/v1/teachers/me/payment-account`, { headers: headers(), credentials: 'include' });
    return parse(response);
  },

  async create(input: PaymentAccountInput): Promise<PaymentAccount> {
    const response = await fetch(`${getBackendUrl()}/api/v1/teachers/me/payment-account`, {
      method: 'POST',
      headers: headers(),
      credentials: 'include',
      body: JSON.stringify(input),
    });
    return parse(response);
  },
};
