import { describe, expect, it } from 'vitest';
import { buildCancellationHeaders, findSubscriptionForMonitor, getCancellationErrorMessage, getCancelableSubscriptionItems } from '@/modules/student/utils/subscription-cancellation';

describe('findSubscriptionForMonitor', () => {
  it('ignora assinaturas sem itens sem lançar exceção', () => {
    expect(findSubscriptionForMonitor([
      { id: 'subscription-without-items' },
      { id: 'subscription-with-monitor', items: [{ monitorId: 'monitor-1' }] },
    ], 'monitor-1')).toEqual({
      id: 'subscription-with-monitor',
      items: [{ monitorId: 'monitor-1' }],
    });
  });
});

describe('getCancellationErrorMessage', () => {
  it('mostra a mensagem segura devolvida pela API de cancelamento', () => {
    expect(getCancellationErrorMessage({
      error: { code: 'PAYMENT_PROVIDER_ERROR', message: 'Não foi possível confirmar o cancelamento com a operadora. Tente novamente em alguns instantes.' },
    })).toBe('Não foi possível confirmar o cancelamento com a operadora. Tente novamente em alguns instantes.');
  });

  it('usa uma mensagem segura quando a resposta de erro é inválida', () => {
    expect(getCancellationErrorMessage(null)).toBe('Não foi possível processar o cancelamento no momento. Tente novamente ou entre em contato com o suporte.');
  });
});

describe('getCancelableSubscriptionItems', () => {
  it('mantém itens do mesmo monitor em assinaturas diferentes para o cancelamento correto', () => {
    expect(getCancelableSubscriptionItems([
      {
        id: 'subscription-a',
        status: 'ACTIVE',
        items: [{ id: 'item-a', monitorId: 'monitor-exatas', monitorName: 'Monitor de Exatas', status: 'ACTIVE', priceCents: 2990 }],
      },
      {
        id: 'subscription-b',
        status: 'ACTIVE',
        items: [{ id: 'item-b', monitorId: 'monitor-exatas', monitorName: 'Monitor de Exatas', status: 'ACTIVE', priceCents: 2990 }],
      },
    ])).toEqual([
      { subscriptionId: 'subscription-a', itemId: 'item-a', monitorId: 'monitor-exatas', monitorName: 'Monitor de Exatas', status: 'ACTIVE', priceCents: 2990 },
      { subscriptionId: 'subscription-b', itemId: 'item-b', monitorId: 'monitor-exatas', monitorName: 'Monitor de Exatas', status: 'ACTIVE', priceCents: 2990 },
    ]);
  });
});

describe('buildCancellationHeaders', () => {
  it('não envia content-type JSON quando o DELETE não possui body', () => {
    expect(buildCancellationHeaders({ Authorization: 'Bearer token' }, 'cancel-key-123')).toEqual({
      Authorization: 'Bearer token',
      'Idempotency-Key': 'cancel-key-123',
    });
  });
});
