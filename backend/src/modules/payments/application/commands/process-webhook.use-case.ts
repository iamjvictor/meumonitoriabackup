import type { PrismaPaymentWebhookRepository } from '../../infrastructure/persistence/prisma-webhook.repository.js';
import type { PaymentAccountRepository } from '../../infrastructure/persistence/payment-account.repository.js';
import type { PaymentEventRepository } from '../../infrastructure/persistence/payment-event.repository.js';
import { ASAAS_PLATFORM_WEBHOOK_EVENTS } from '../../infrastructure/providers/asaas/asaas-webhook-events.js';

const configuredEventSet = new Set<string>(ASAAS_PLATFORM_WEBHOOK_EVENTS);
const paymentLifecycleEvents = new Set<string>(ASAAS_PLATFORM_WEBHOOK_EVENTS.filter((event) =>
  event.startsWith('PAYMENT_') && ![
    'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_REFUNDED',
    'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED',
  ].includes(event) && !event.startsWith('PAYMENT_SPLIT_')));

const WAITING_CORRELATION_EVENTS = new Set([
  'CHECKOUT_CREATED',
  'CHECKOUT_PAID',
  'CHECKOUT_CANCELED',
  'CHECKOUT_EXPIRED',
  'CHECKOUT_CREATED', 'CHECKOUT_PAID', 'CHECKOUT_CANCELED', 'CHECKOUT_EXPIRED',
]);

function getProviderEventDate(payload: unknown, fallback: Date): Date {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fallback;
  const dateCreated = (payload as Record<string, unknown>).dateCreated;
  if (typeof dateCreated !== 'string') return fallback;
  const parsed = new Date(dateCreated);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export class ProcessPaymentWebhookUseCase {
  constructor(private readonly repository: PrismaPaymentWebhookRepository, private readonly accounts?: PaymentAccountRepository, private readonly payments?: PaymentEventRepository) {}

  async execute(eventId: string) {
    console.log('Processamento de webhook Asaas iniciado', { event: 'payments.webhook_processing_started', eventId });
    const event = await this.repository.claim(eventId);
    if (!event) {
      console.log('Processamento de webhook Asaas ignorado', { event: 'payments.webhook_processing_skipped', eventId, reason: 'CLAIM_FAILED_OR_ALREADY_PROCESSED' });
      return { skipped: true };
    }

    try {
      const occurredAt = getProviderEventDate(event.payload, event.createdAt);
      if (event.eventType.startsWith('ACCOUNT_STATUS_') && configuredEventSet.has(event.eventType)) {
        const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
        const account = payload.account && typeof payload.account === 'object' ? payload.account as Record<string, unknown> : {};
        const providerAccountId = event.providerAccountId || event.sourceProviderAccountId || (typeof account.id === 'string' ? account.id : typeof payload.accountId === 'string' ? payload.accountId : undefined);
        console.log('Evento de status de conta identificado', { event: 'payments.account_status_event_identified', eventId: event.id, eventType: event.eventType, providerAccountId, hasAccountPayload: Boolean(payload.account), hasAccountStatusPayload: Boolean(payload.accountStatus) });
        if (!providerAccountId || !this.accounts) {
          await this.repository.markWaitingCorrelation(event.id, event.attempts);
          return { skipped: false, state: 'WAITING_CORRELATION' };
        }
        if (providerAccountId && this.accounts) {
          const result = await this.accounts.applyAccountStatusEvent(providerAccountId, event.eventType, occurredAt, payload.accountStatus);
          console.log('Atualização de conta pelo webhook concluída', { event: 'payments.account_status_update_completed', eventId: event.id, providerAccountId, eventType: event.eventType, updatedRows: result?.count ?? 0 });
          if ((result?.count ?? 0) === 0) {
            await this.repository.markWaitingCorrelation(event.id, event.attempts);
            console.log('Webhook de status aguardando vínculo da conta local', { event: 'payments.webhook_processing_waiting_correlation', eventId: event.id, providerAccountId });
            return { skipped: false, state: 'WAITING_CORRELATION' };
          }
        }
        await this.repository.markProcessed(event.id, 'ACCOUNT_STATUS_APPLIED');
        console.log('Webhook de status marcado como processado', { event: 'payments.webhook_processing_completed', eventId: event.id, state: 'ACCOUNT_STATUS_APPLIED' });
        return { skipped: false, state: 'ACCOUNT_STATUS_APPLIED' };
      }
      if (event.eventType === 'CHECKOUT_CREATED' || event.eventType === 'CHECKOUT_PAID' || event.eventType === 'CHECKOUT_CANCELED' || event.eventType === 'CHECKOUT_EXPIRED') {
        if (!this.payments?.applyCheckoutEvent) {
          await this.repository.markWaitingCorrelation(event.id, event.attempts);
          return { skipped: false, state: 'WAITING_CORRELATION' };
        }
        const result = await this.payments.applyCheckoutEvent({ environment: event.environment, eventId: event.id, eventType: event.eventType, payload: event.payload, occurredAt });
        if (result.updatedRows === 0) {
          await this.repository.markWaitingCorrelation(event.id, event.attempts);
          return { skipped: false, state: 'WAITING_CORRELATION' };
        }
        await this.repository.markProcessed(event.id, 'CHECKOUT_STATE_APPLIED');
        return { skipped: false, state: 'CHECKOUT_STATE_APPLIED' };
      }
      if (event.eventType === 'PAYMENT_CONFIRMED' || event.eventType === 'PAYMENT_RECEIVED') {
        console.log('Evento financeiro Asaas identificado', { event: 'payments.payment_event_identified', eventId: event.id, eventType: event.eventType, hasPaymentPayload: Boolean((event.payload as Record<string, unknown>)?.payment) });
        if (!this.payments) {
          await this.repository.markWaitingCorrelation(event.id, event.attempts);
          return { skipped: false, state: 'WAITING_CORRELATION' };
        }
        const result = await this.payments.applyPaymentEvent({ environment: event.environment, eventId: event.id, eventType: event.eventType, payload: event.payload, occurredAt });
        if (result.updatedRows === 0) {
          await this.repository.markWaitingCorrelation(event.id, event.attempts);
          console.log('Evento financeiro aguardando correlação', { event: 'payments.payment_event_waiting_correlation', eventId: event.id, eventType: event.eventType });
          return { skipped: false, state: 'WAITING_CORRELATION' };
        }
        const state = result.state ?? (result.accessGranted ? 'PAYMENT_ACCESS_APPLIED' : 'PAYMENT_STATE_APPLIED');
        await this.repository.markProcessed(event.id, state);
        console.log('Evento financeiro processado', { event: 'payments.payment_event_processing_completed', eventId: event.id, eventType: event.eventType, chargeId: result.chargeId, studentId: result.studentId, monitorId: result.monitorId, accessGranted: result.accessGranted, state });
        return { skipped: false, state };
      }
      if (event.eventType.startsWith('PAYMENT_SPLIT_') && configuredEventSet.has(event.eventType)) {
        if (!this.payments?.applySplitEvent) {
          await this.repository.markWaitingCorrelation(event.id, event.attempts);
          return { skipped: false, state: 'WAITING_CORRELATION' };
        }
        const result = await this.payments.applySplitEvent({ environment: event.environment, eventId: event.id, eventType: event.eventType, payload: event.payload, occurredAt });
        if (result.updatedRows === 0) {
          await this.repository.markWaitingCorrelation(event.id, event.attempts);
          return { skipped: false, state: 'WAITING_CORRELATION' };
        }
        await this.repository.markProcessed(event.id, 'SPLIT_STATE_APPLIED');
        return { skipped: false, state: 'SPLIT_STATE_APPLIED' };
      }
      if ((event.eventType.startsWith('SUBSCRIPTION_') && configuredEventSet.has(event.eventType)) || event.eventType === 'PAYMENT_OVERDUE' || event.eventType === 'PAYMENT_REFUNDED' || event.eventType === 'PAYMENT_PARTIALLY_REFUNDED' || event.eventType === 'PAYMENT_CHARGEBACK_REQUESTED') {
        if (!this.payments?.applySubscriptionEvent) {
          await this.repository.markWaitingCorrelation(event.id, event.attempts);
          return { skipped: false, state: 'WAITING_CORRELATION' };
        }
        const result = await this.payments.applySubscriptionEvent({ environment: event.environment, eventId: event.id, eventType: event.eventType, payload: event.payload, occurredAt });
        if (result.updatedRows === 0) {
          await this.repository.markWaitingCorrelation(event.id, event.attempts);
          return { skipped: false, state: 'WAITING_CORRELATION' };
        }
        await this.repository.markProcessed(event.id, 'SUBSCRIPTION_STATE_APPLIED');
        return { skipped: false, state: 'SUBSCRIPTION_STATE_APPLIED' };
      }
      if (paymentLifecycleEvents.has(event.eventType)) {
        if (!this.payments?.applyPaymentLifecycleEvent) {
          await this.repository.markIgnored(event.id);
          return { skipped: false, state: 'IGNORED' };
        }
        const result = await this.payments.applyPaymentLifecycleEvent({ environment: event.environment, eventId: event.id, eventType: event.eventType, payload: event.payload, occurredAt });
        if (result.updatedRows === 0) {
          await this.repository.markWaitingCorrelation(event.id, event.attempts);
          return { skipped: false, state: 'WAITING_CORRELATION' };
        }
        await this.repository.markProcessed(event.id, result.state ?? 'PAYMENT_STATE_APPLIED');
        return { skipped: false, state: result.state ?? 'PAYMENT_STATE_APPLIED' };
      }
      if (WAITING_CORRELATION_EVENTS.has(event.eventType)) {
        await this.repository.markWaitingCorrelation(event.id, event.attempts);
        return { skipped: false, state: 'WAITING_CORRELATION' };
      }
      await this.repository.markIgnored(event.id);
      return { skipped: false, state: 'IGNORED' };
    } catch (error) {
      const failureCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code.slice(0, 80)
        : error instanceof Error ? error.name : 'PAYMENT_WEBHOOK_PROCESSING_FAILED';
      await this.repository.markFailed(event.id, failureCode, event.attempts);
      throw error;
    }
  }
}
