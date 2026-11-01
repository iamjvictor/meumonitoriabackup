import type {
  HostedCheckoutCommand,
  HostedCheckoutResult,
  PaymentProvider,
} from '../../../domain/ports/payment-provider.port.js';

type AsaasRequestClient = {
  request<T>(path: string, request: { method: 'POST'; body?: unknown }): Promise<T>;
};

type AsaasCheckoutResponse = {
  id: string;
  link?: string | null;
  url?: string | null;
  expiresAt?: string | null;
};

export class AsaasCheckoutProvider implements PaymentProvider {
  constructor(
    private readonly client: AsaasRequestClient,
    private readonly environment: 'sandbox' | 'production' = 'production',
  ) {}

  async createHostedCheckout(command: HostedCheckoutCommand): Promise<HostedCheckoutResult> {
    if (!Number.isInteger(command.amountCents) || command.amountCents <= 0) {
      throw new Error('amountCents must be a positive integer');
    }

    const splits = command.splits.map((split) => ({
      walletId: split.walletId,
      percentageValue: Number(split.percentage),
    }));
    const chargeType = command.chargeType ?? 'RECURRENT';
    const chargeTypes = command.chargeTypes ?? [chargeType];
    if (chargeTypes.includes('INSTALLMENT') && (!Number.isInteger(command.maxInstallmentCount) || (command.maxInstallmentCount ?? 0) < 1 || (command.maxInstallmentCount ?? 0) > 21)) {
      throw new Error('maxInstallmentCount must be an integer between 1 and 21');
    }
    const items = command.items?.map((item) => ({
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      value: item.unitAmountCents / 100,
    })) ?? [{
      name: command.monitorName,
      description: command.description,
      quantity: 1,
      value: command.amountCents / 100,
    }];
    console.log('Preparando checkout Asaas', {
      event: 'payments.asaas_checkout_request_prepared',
      externalReference: command.externalReference,
      billingTypes: [command.billingType ?? 'CREDIT_CARD'],
      chargeTypes,
      cycle: chargeType === 'RECURRENT' ? command.cycle ?? 'MONTHLY' : undefined,
      nextDueDate: command.nextDueDate,
      splitCount: splits.length,
      splits: splits.map((split) => ({ walletId: `${split.walletId.slice(0, 8)}...`, percentageValue: split.percentageValue })),
    });

    const response = await this.client.request<AsaasCheckoutResponse>('/checkouts', {
      method: 'POST',
      body: {
        billingTypes: [command.billingType ?? 'CREDIT_CARD'],
        chargeTypes,
        externalReference: command.externalReference,
        ...(command.customerId ? { customer: command.customerId } : {}),
        items,
        ...(chargeType === 'RECURRENT' ? { subscription: { cycle: command.cycle ?? 'MONTHLY', nextDueDate: command.nextDueDate } } : {}),
        ...(chargeTypes.includes('INSTALLMENT') ? { installment: { maxInstallmentCount: command.maxInstallmentCount } } : {}),
        callback: {
          successUrl: command.successUrl,
          cancelUrl: command.cancelUrl,
          expiredUrl: command.expiredUrl,
          autoRedirect: true,
        },
        splits,
      },
    });

    const checkoutUrl = response.link ?? response.url ?? buildCheckoutUrl(this.environment, response.id);
    console.log('Resposta de checkout Asaas normalizada', {
      event: 'payments.asaas_checkout_response_normalized',
      providerCheckoutId: response.id,
      hasLink: Boolean(response.link),
      hasUrl: Boolean(response.url),
      checkoutUrlOrigin: response.link ? 'link' : response.url ? 'url' : 'constructed',
    });

    return {
      providerCheckoutId: response.id,
      checkoutUrl,
      expiresAt: response.expiresAt ? new Date(response.expiresAt) : null,
    };
  }

  async cancelHostedCheckout(checkoutId: string): Promise<void> {
    await this.client.request(`/checkouts/${encodeURIComponent(checkoutId)}/cancel`, { method: 'POST' });
  }
}

function buildCheckoutUrl(environment: 'sandbox' | 'production', checkoutId: string) {
  const origin = environment === 'sandbox' ? 'https://sandbox.asaas.com' : 'https://asaas.com';
  return `${origin}/checkoutSession/show/${encodeURIComponent(checkoutId)}`;
}
