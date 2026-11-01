import { digitsOnly } from '../../../../../models/person-data.validation.js';
import { ASAAS_SUBACCOUNT_WEBHOOK_EVENTS } from './asaas-webhook-events.js';

type AsaasAccountRequestClient = {
  request<T>(path: string, request: { method: 'GET' | 'POST' | 'PUT'; body?: unknown; credential?: string }): Promise<T>;
};

export type AsaasAccountProviderOptions = {
  webhookUrl?: string;
  webhookEmail?: string;
  webhookAuthToken?: string;
};

export type CreateSubaccountCommand = {
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

type AsaasSubaccountResponse = {
  id: string;
  walletId: string;
  apiKey?: string;
  status?: string;
  onboardingUrl?: string | null;
  webhooks?: Array<{ id?: string }>;
};

type AsaasWebhook = {
  id?: string;
  url?: string;
};

export type CreatedSubaccount = {
  providerAccountId: string;
  walletId: string;
  status: string;
  onboardingUrl: string | null;
  webhookId: string | null;
  /** Internal one-shot credential; never serialize or log this value. */
  readonly apiKey?: string;
};

export class AsaasAccountProvider {
  constructor(private readonly client: AsaasAccountRequestClient, private readonly options: AsaasAccountProviderOptions = {}) {}

  async createSubaccount(command: CreateSubaccountCommand): Promise<CreatedSubaccount> {
    const webhook = this.buildAccountStatusWebhook();
    if (!webhook) throw new Error('ASAAS_ACCOUNT_STATUS_WEBHOOK_CONFIGURATION_MISSING');
    const sanitizedCommand: CreateSubaccountCommand = {
      ...command,
      cpfCnpj: digitsOnly(command.cpfCnpj),
      mobilePhone: digitsOnly(command.mobilePhone),
      postalCode: digitsOnly(command.postalCode),
    };
    const payload = compact({ ...sanitizedCommand, webhooks: webhook ? [webhook] : undefined });
    console.log('Preparando criação de subconta no Asaas', {
      event: 'payments.asaas_subaccount_request_prepared',
      path: '/accounts',
      fieldsSent: Object.keys(payload),
      companyType: command.companyType ?? null,
      payload: maskAsaasPayload(payload),
    });
    const response = await this.client.request<AsaasSubaccountResponse>('/accounts', {
      method: 'POST',
      body: payload,
    });

    const created = {
      providerAccountId: response.id,
      walletId: response.walletId,
      status: normalizeAccountStatus(response.status),
      onboardingUrl: response.onboardingUrl ?? null,
      webhookId: response.webhooks?.[0]?.id ?? null,
    };
    if (response.apiKey) {
      // Keep the transient credential available to the application layer without
      // making it part of normal object serialization/public responses.
      Object.defineProperty(created, 'apiKey', { value: response.apiKey, enumerable: false, writable: false, configurable: false });
    }
    console.log('Resposta de subconta normalizada', {
      event: 'payments.asaas_subaccount_response_normalized',
      providerAccountId: created.providerAccountId,
      walletId: created.walletId,
      status: created.status,
      hasOnboardingUrl: Boolean(created.onboardingUrl),
      webhookId: created.webhookId,
    });
    return created;
  }

  async ensureAccountStatusWebhook(credential: string): Promise<{ webhookId: string }> {
    const webhook = this.buildAccountStatusWebhook();
    if (!webhook) throw new Error('ASAAS_ACCOUNT_STATUS_WEBHOOK_CONFIGURATION_MISSING');

    const current = await this.client.request<{ data?: AsaasWebhook[] }>('/webhooks?limit=100', {
      method: 'GET',
      credential,
    });
    const existing = current.data?.find((candidate) => candidate.url === webhook.url && candidate.id);
    const path = existing?.id ? `/webhooks/${existing.id}` : '/webhooks';
    const response = await this.client.request<AsaasWebhook>(path, {
      method: existing?.id ? 'PUT' : 'POST',
      body: webhook,
      credential,
    });
    const webhookId = response.id ?? existing?.id;
    if (!webhookId) throw new Error('ASAAS_ACCOUNT_STATUS_WEBHOOK_ID_MISSING');
    return { webhookId };
  }

  private buildAccountStatusWebhook() {
    if (!this.options.webhookUrl || !this.options.webhookEmail || !this.options.webhookAuthToken) return null;
    return {
      name: 'MeuMonitor AI - Status da Conta',
      url: this.options.webhookUrl,
      email: this.options.webhookEmail,
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: this.options.webhookAuthToken,
      sendType: 'SEQUENTIALLY',
      events: ASAAS_SUBACCOUNT_WEBHOOK_EVENTS,
    };
  }
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''));
}

function normalizeAccountStatus(value: string | undefined) {
  return value?.trim().toUpperCase() || 'PENDING';
}

function maskAsaasPayload(payload: Record<string, unknown>) {
  const mask = (value: unknown, visible = 2) => {
    const text = String(value ?? '');
    if (text.length <= visible) return '*'.repeat(text.length);
    return `${text.slice(0, visible)}${'*'.repeat(Math.max(4, text.length - visible - 2))}${text.slice(-2)}`;
  };

  const maskedWebhooks = Array.isArray(payload.webhooks)
    ? payload.webhooks.map((webhook) => {
        if (!webhook || typeof webhook !== 'object') return webhook;
        const { authToken, ...safeWebhook } = webhook as Record<string, unknown>;
        return { ...safeWebhook, authToken: authToken ? '[REDACTED]' : undefined };
      })
    : payload.webhooks;

  return {
    ...payload,
    webhooks: maskedWebhooks,
    cpfCnpj: payload.cpfCnpj ? mask(payload.cpfCnpj, 3) : undefined,
    email: payload.email ? mask(payload.email, 2) : undefined,
    mobilePhone: payload.mobilePhone ? mask(payload.mobilePhone, 2) : undefined,
    address: payload.address ? '[REDACTED]' : undefined,
    addressNumber: payload.addressNumber ? '[REDACTED]' : undefined,
    province: payload.province ? '[REDACTED]' : undefined,
    postalCode: payload.postalCode ? mask(payload.postalCode, 2) : undefined,
    incomeValue: payload.incomeValue !== undefined ? '[REDACTED]' : undefined,
  };
}
