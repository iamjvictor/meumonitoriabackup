import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../../../..', 'prisma/schema.prisma');

async function schema() {
  return readFile(schemaPath, 'utf8');
}

test('o schema preserva o legado e adiciona preço e regras financeiras do professor', async () => {
  const source = await schema();

  assert.match(source, /model Teacher \{/);
  assert.match(source, /teacherPercentage\s+Decimal\s+@default\(50\)[^\n]*@db\.Decimal\(7,\s*4\)/);
  assert.doesNotMatch(source, /referralPercentage\s+Decimal/);
  assert.doesNotMatch(source, /referrerTeacherId\s+String\?/);
  assert.match(source, /model TeacherReferral \{/);
  assert.match(source, /referredTeacherId\s+String\s+@unique/);
  assert.match(source, /indicatorTeacherId\s+String/);
  assert.match(source, /percentage\s+Decimal[^\n]*@db\.Decimal\(7,\s*4\)/);
  assert.match(source, /model Monitor \{/);
  assert.match(source, /priceCents\s+Int\s+@default\(5990\)/);
  assert.match(source, /model StripeCustomer \{/);
  assert.match(source, /model BillingSubscription \{/);
  assert.match(source, /model StudentPurchase \{/);
});

test('o schema contém entidades financeiras com identidade externa e snapshots', async () => {
  const source = await schema();

  for (const model of [
    'PaymentAccount',
    'PaymentCustomer',
    'PaymentOrder',
    'PaymentOrderItem',
    'PaymentCheckout',
    'PaymentSubscription',
    'PaymentSubscriptionItem',
    'PaymentCharge',
    'PaymentSplit',
    'PaymentIdempotencyKey',
    'PaymentWebhookEvent',
    'PaymentOutboxEvent',
    'PaymentAuditEntry',
    'StudentAccessPaymentEvent',
  ]) {
    assert.match(source, new RegExp(`model ${model} \\{`), `model ${model} ausente`);
  }

  assert.match(source, /teacherPercentageSnapshot\s+Decimal[^\n]*@db\.Decimal\(7,\s*4\)/);
  assert.match(source, /priceCentsSnapshot\s+Int/);
  assert.match(source, /providerEventId\s+String/);
  assert.match(source, /externalReference\s+String/);
});

test('StudentEnrollment e StudentSubscription possuem ponte para o domínio de pagamentos', async () => {
  const source = await schema();

  assert.match(source, /paymentSubscriptionItemId\s+String\?/);
  assert.match(source, /lastPaymentChargeId\s+String\?/);
});

test('o preço anual é derivado e pedidos diretos congelam duração e política de split', async () => {
  const source = await schema();
  const monitor = source.match(/model Monitor \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const order = source.match(/model PaymentOrder \{([\s\S]*?)\n\}/)?.[1] ?? '';

  assert.doesNotMatch(monitor, /annualPriceCents/);
  assert.match(order, /billingInterval\s+String\s+@default\("MONTHLY"\)/);
  assert.match(order, /serviceMonths\s+Int\s+@default\(1\)/);
  assert.match(order, /splitPolicy\s+String\s+@default\("TEACHER_ELIGIBLE"\)/);
});

test('lote patrocinado registra pagador, ambiente e checkout sem exigir conta para cada beneficiário', async () => {
  const source = await schema();
  const batch = source.match(/model SponsoredSeatBatch \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const seat = source.match(/model SponsoredSeat \{([\s\S]*?)\n\}/)?.[1] ?? '';

  assert.match(source, /model SponsoredSeatBatch \{/);
  assert.match(batch, /teacherId\s+String/);
  assert.match(batch, /monitorId\s+String/);
  assert.match(batch, /environment\s+String/);
  assert.match(batch, /billingInterval\s+String/);
  assert.match(batch, /externalReference\s+String/);
  assert.match(batch, /idempotencyKey\s+String/);
  assert.match(batch, /platformAmountCents\s+Int/);
  assert.match(batch, /providerCheckoutId\s+String\?/);
  assert.match(batch, /@@unique\(\[environment, externalReference\]\)/);
  assert.match(seat, /emailNormalized\s+String/);
  assert.match(seat, /studentId\s+String\?/);
  assert.match(seat, /startsAt\s+DateTime\?/);
  assert.match(seat, /endsAt\s+DateTime\?/);
  assert.match(seat, /@@unique\(\[batchId, emailNormalized\]\)/);
});
