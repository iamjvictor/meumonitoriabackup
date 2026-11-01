export type PaymentSplit = {
  walletId: string;
  percentage: string;
};

export type HostedCheckoutCommand = {
  externalReference: string;
  customerId?: string;
  monitorName: string;
  description: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
  nextDueDate: string;
  splits: PaymentSplit[];
  billingType?: 'PIX' | 'CREDIT_CARD';
  chargeType?: 'RECURRENT' | 'DETACHED';
  chargeTypes?: ReadonlyArray<'RECURRENT' | 'DETACHED' | 'INSTALLMENT'>;
  maxInstallmentCount?: number;
  cycle?: 'MONTHLY';
  items?: Array<{ name: string; description: string; quantity: number; unitAmountCents: number }>;
};

export type HostedCheckoutResult = {
  providerCheckoutId: string;
  checkoutUrl: string;
  expiresAt: Date | null;
};

export type PaymentProvider = {
  createHostedCheckout(command: HostedCheckoutCommand): Promise<HostedCheckoutResult>;
  cancelHostedCheckout?(checkoutId: string): Promise<void>;
};
