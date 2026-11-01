import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeacherPaymentAccountService } from '../../src/modules/teacher/services/TeacherPaymentAccountService';

describe('TeacherPaymentAccountService provider errors', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps temporary Asaas outage to a safe retry message', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
      code: 'ASAAS_ACCOUNT_PROVIDER_UNAVAILABLE',
      message: 'private provider response',
    } }), { status: 503, headers: { 'Content-Type': 'application/json' } })));

    await expect(TeacherPaymentAccountService.create({
      name: 'Professora Teste', email: 'teacher@example.test', cpfCnpj: '09648277940', birthDate: '2002-02-25',
      mobilePhone: '22997892096', incomeValue: 1000, address: 'Rua Teste', addressNumber: '10', province: 'Centro', postalCode: '24912710',
    })).rejects.toMatchObject({
      code: 'ASAAS_ACCOUNT_PROVIDER_UNAVAILABLE',
      statusCode: 503,
      message: expect.stringMatching(/temporariamente indisponível/i),
    });
  });
});
