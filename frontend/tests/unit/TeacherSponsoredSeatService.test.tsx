import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSponsoredEmails, TeacherSponsoredSeatService } from '../../src/modules/teacher/services/TeacherSponsoredSeatService';

describe('TeacherSponsoredSeatService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normaliza emails e detecta inválidos e repetidos sem perder o valor original', () => {
    expect(parseSponsoredEmails(' Ana@Exemplo.com \nana@exemplo.com\nruim\n bia@exemplo.com ')).toEqual({
      emails: ['ana@exemplo.com', 'ana@exemplo.com', 'ruim', 'bia@exemplo.com'],
      invalid: ['ruim'],
      duplicates: ['ana@exemplo.com'],
    });
  });

  it.each(['PIX', 'CREDIT_CARD'] as const)('cria lote com método %s, credenciais, idempotência e body explícito', async (billingType) => {
    sessionStorage.clear();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { batchId: 'batch-1', amountCents: 3000, checkoutUrl: 'https://checkout.test' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => `uuid-${billingType}` });
    const input = { monitorId: 'monitor-1', interval: 'MONTHLY' as const, billingType, beneficiaryEmails: ['a@test.com'] };
    const result = await TeacherSponsoredSeatService.createSponsoredBatch(input);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/payments/teacher-sponsored-batches');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe(`uuid-${billingType}`);
    expect(JSON.parse(String(init.body))).toEqual(input);
    expect(result.checkoutUrl).toBe('https://checkout.test');
  });

  it('consulta cotação no backend antes de confirmar a compra', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { totalAmountCents: 14000 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const input = { monitorId: 'monitor-1', interval: 'MONTHLY' as const, beneficiaryEmails: ['a@test.com', 'b@test.com'] };
    const result = await TeacherSponsoredSeatService.quoteSponsoredBatch(input);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/teacher-sponsored-batches/quote');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(input);
    expect(result.totalAmountCents).toBe(14000);
  });

  it('reutiliza a chave de idempotência quando a mesma tentativa precisa ser repetida', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Tente novamente' } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { batchId: 'batch-retry', amountCents: 1000, checkoutUrl: 'https://checkout.test' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'stable-retry-key' });
    const input = { monitorId: 'monitor-retry', interval: 'ANNUAL' as const, billingType: 'PIX' as const, beneficiaryEmails: ['a@test.com'] };
    await expect(TeacherSponsoredSeatService.createSponsoredBatch(input)).rejects.toThrow('Tente novamente');
    await TeacherSponsoredSeatService.createSponsoredBatch(input);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe('stable-retry-key');
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Idempotency-Key')).toBe('stable-retry-key');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(input);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual(input);
  });

  it('usa chave de idempotência distinta por método e mantém cada chave na repetição correspondente', async () => {
    sessionStorage.clear();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Tente novamente' } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { batchId: 'card', amountCents: 1000, checkoutUrl: 'https://checkout.test/card' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { batchId: 'pix', amountCents: 1000, checkoutUrl: 'https://checkout.test/pix' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    let uuid = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `method-key-${++uuid}` });
    const pix = { monitorId: 'monitor-method', interval: 'MONTHLY' as const, billingType: 'PIX' as const, beneficiaryEmails: ['a@test.com'] };
    const card = { ...pix, billingType: 'CREDIT_CARD' as const };

    await expect(TeacherSponsoredSeatService.createSponsoredBatch(pix)).rejects.toThrow('Tente novamente');
    await TeacherSponsoredSeatService.createSponsoredBatch(card);
    await TeacherSponsoredSeatService.createSponsoredBatch(pix);

    const keys = fetchMock.mock.calls.map(([, init]) => new Headers((init as RequestInit).headers).get('Idempotency-Key'));
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[2]).toBe(keys[0]);
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).billingType)).toEqual(['PIX', 'CREDIT_CARD', 'PIX']);
  });

  it('preserva billingType salvo e assume cartão nos lotes históricos sem método', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: 'pix-batch', billingType: 'PIX' },
      { id: 'legacy-batch' },
    ] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const batches = await TeacherSponsoredSeatService.listSponsoredBatches();
    expect(batches.map((batch) => batch.billingType)).toEqual(['PIX', 'CREDIT_CARD']);
  });
});
