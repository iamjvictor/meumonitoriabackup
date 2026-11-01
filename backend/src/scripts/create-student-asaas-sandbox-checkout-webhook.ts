import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { createPaymentsModule } from '../modules/payments/payments.module.js';
import { getAsaasBaseUrl, selectAsaasApiKey } from '../modules/payments/infrastructure/providers/asaas/asaas.config.js';
import { assertNgrokSandboxWebhookTarget, assertSandboxTestDatabase } from '../modules/payments/infrastructure/providers/asaas/asaas-test-target.guard.js';
import { ASAAS_PLATFORM_WEBHOOK_EVENTS } from '../modules/payments/infrastructure/providers/asaas/asaas-webhook-events.js';

const PORT = Number(process.env.ASAAS_SANDBOX_TEST_PORT ?? '3017');
const WEBHOOK_PATH = '/api/v1/payments/webhooks/asaas';
const API_BASE = getAsaasBaseUrl('sandbox');
const apiKey = selectAsaasApiKey('sandbox', { sandbox: env.ASAAS_API_KEY_SANDBOX, production: undefined });
const children: ChildProcess[] = [];

function assertConfiguration() {
  if (env.ASAAS_ENV !== 'sandbox') throw new Error('Este roteiro exige ASAAS_ENV=sandbox.');
  if (!apiKey) throw new Error('ASAAS_API_KEY_SANDBOX não está configurada.');
  if (!env.ASAAS_WEBHOOK_AUTH_TOKEN) throw new Error('ASAAS_WEBHOOK_AUTH_TOKEN não está configurado.');
  if (!env.ASAAS_WEBHOOK_EMAIL) throw new Error('ASAAS_WEBHOOK_EMAIL é necessário para cadastrar o webhook temporário.');
  assertSandboxTestDatabase(env.DATABASE_URL);
}

async function waitForLocalApi() {
  const healthUrl = `http://127.0.0.1:${PORT}/health`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) return;
    } catch { /* aguarda a inicialização local */ }
    await delay(500);
  }
  throw new Error(`API local não iniciou em ${healthUrl}.`);
}

async function startNgrok() {
  const child = spawn('ngrok', ['http', String(PORT), '--log', 'stdout', '--log-format', 'json'], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  children.push(child);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error('ngrok encerrou antes de abrir o túnel.');
    try {
      const response = await fetch('http://127.0.0.1:4040/api/tunnels');
      const payload = await response.json() as { tunnels?: Array<{ public_url?: string; proto?: string }> };
      const url = payload.tunnels?.find((tunnel) => tunnel.proto === 'https')?.public_url;
      if (url) {
        const webhookUrl = `${url}${WEBHOOK_PATH}`;
        assertNgrokSandboxWebhookTarget(env.ASAAS_ENV, webhookUrl);
        return webhookUrl;
      }
    } catch { /* ngrok ainda está iniciando */ }
    await delay(500);
  }
  throw new Error('Não foi possível obter uma URL HTTPS do ngrok local.');
}

async function asaasRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      access_token: apiKey!,
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(`Asaas Sandbox ${init.method ?? 'GET'} ${path} respondeu HTTP ${response.status}.`);
  return body;
}

async function createTemporaryWebhook(url: string) {
  const result = await asaasRequest('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      name: `MeuMonitorAI teste local ${randomUUID().slice(0, 8)}`,
      url,
      email: env.ASAAS_WEBHOOK_EMAIL,
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken: env.ASAAS_WEBHOOK_AUTH_TOKEN,
      sendType: 'SEQUENTIALLY',
      events: ASAAS_PLATFORM_WEBHOOK_EVENTS,
    }),
  });
  if (typeof result?.id !== 'string') throw new Error('Asaas Sandbox não retornou o ID do webhook temporário.');
  console.log('Webhook temporário Sandbox registrado', { webhookId: result.id, eventCount: ASAAS_PLATFORM_WEBHOOK_EVENTS.length, host: new URL(url).hostname });
  return result.id;
}

async function removeTemporaryWebhook(webhookId: string) {
  await asaasRequest(`/webhooks/${encodeURIComponent(webhookId)}`, { method: 'DELETE' });
  console.log('Webhook temporário Sandbox removido', { webhookId });
}

async function seedTestEntities() {
  const tag = randomUUID().slice(0, 8);
  const teacher = await prisma.teacher.create({
    data: {
      userId: randomUUID(), fullName: `Professor Sandbox ${tag}`, email: `prof-sandbox-${tag}@example.test`,
      username: `prof-sandbox-${tag}`, area: 'Teste de pagamentos', pageSlug: `prof-sandbox-${tag}`,
      termsAcceptedAt: new Date(), status: 'active',
    },
    select: { id: true },
  });
  const monitor = await prisma.monitor.create({
    data: { teacherId: teacher.id, name: `Monitor Sandbox ${tag}`, description: 'Checkout de teste Asaas', priceCents: 1990, status: 'PUBLISHED', publishedAt: new Date() },
    select: { id: true, name: true },
  });
  const student = await prisma.student.create({
    data: { userId: randomUUID(), fullName: `Aluno Sandbox ${tag}`, email: `aluno-sandbox-${tag}@example.test`, role: 'student', status: 'active' },
    select: { id: true, userId: true, email: true },
  });
  return { teacherId: teacher.id, monitor, student };
}

function startLocalServices() {
  const childEnv = { ...process.env, HOST: '0.0.0.0', PORT: String(PORT), ASAAS_ENV: 'sandbox', PAYMENTS_PROVIDER: 'ASAAS' };
  children.push(spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { env: childEnv, stdio: 'inherit' }));
  children.push(spawn(process.execPath, ['--import', 'tsx', 'src/worker.ts'], { env: childEnv, stdio: 'inherit' }));
}

function findRelatedEvent(payload: unknown, checkoutId: string, orderId: string) {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as { checkout?: { id?: string; externalReference?: string }; payment?: { checkoutSession?: string; externalReference?: string } };
  return value.checkout?.id === checkoutId || value.checkout?.externalReference === orderId
    || value.payment?.checkoutSession === checkoutId || value.payment?.externalReference === orderId;
}

async function waitForEvent(checkoutId: string, orderId: string, eventTypes: string[], timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const events = await prisma.paymentWebhookEvent.findMany({
      where: { environment: 'SANDBOX', eventType: { in: eventTypes } },
      orderBy: { createdAt: 'desc' }, take: 100, select: { eventType: true, state: true, providerEventId: true, payload: true },
    });
    const match = events.find((event) => findRelatedEvent(event.payload, checkoutId, orderId));
    if (match) return match;
    await delay(1500);
  }
  return null;
}

async function main() {
  assertConfiguration();
  const webhookUrl = await startNgrok();
  const publicApiUrl = webhookUrl.slice(0, -WEBHOOK_PATH.length);
  process.env.ASAAS_WEBHOOK_URL = webhookUrl;
  process.env.PUBLIC_API_URL = publicApiUrl;
  startLocalServices();
  await waitForLocalApi();
  let temporaryWebhookId: string | undefined;
  try {
    temporaryWebhookId = await createTemporaryWebhook(webhookUrl);
    const seeded = await seedTestEntities();
    const returnBaseUrl = env.PAYMENTS_RETURN_BASE_URL ?? env.PUBLIC_FRONT_URL;
    if (!returnBaseUrl) throw new Error('Configure PAYMENTS_RETURN_BASE_URL ou PUBLIC_FRONT_URL para o checkout.');
    const payments = createPaymentsModule({ apiKey: apiKey!, baseUrl: API_BASE, environment: 'sandbox', timeoutMs: env.ASAAS_HTTP_TIMEOUT_MS, returnBaseUrl });
    const checkout = await payments.createCheckout.execute(seeded.student.userId, {
      monitorId: seeded.monitor.id,
      idempotencyKey: randomUUID(),
      returnBaseUrl,
    });
    const storedCheckout = await prisma.paymentCheckout.findFirst({ where: { orderId: checkout.orderId, environment: 'SANDBOX' }, orderBy: { attempt: 'desc' }, select: { providerCheckoutId: true } });
    const providerCheckoutId = storedCheckout?.providerCheckoutId;
    if (!providerCheckoutId || !checkout.checkoutUrl) throw new Error(`Checkout Sandbox sem URL/ID Asaas (pedido ${checkout.orderId}).`);

    console.log('Checkout Sandbox pronto. Abra o link e conclua o pagamento de teste; o script aguardará o webhook real.', {
      studentEmail: seeded.student.email,
      monitor: seeded.monitor.name,
      amountCents: checkout.amountCents,
      orderId: checkout.orderId,
      providerCheckoutId,
      webhookUrl,
      checkoutUrl: checkout.checkoutUrl,
    });

    const createdEvent = await waitForEvent(providerCheckoutId, checkout.orderId, ['CHECKOUT_CREATED'], 120_000);
    console.log('Resultado do evento CHECKOUT_CREATED', createdEvent
      ? { received: true, eventType: createdEvent.eventType, state: createdEvent.state, providerEventId: createdEvent.providerEventId }
      : { received: false, timeoutSeconds: 120 });

    const paidEvent = await waitForEvent(providerCheckoutId, checkout.orderId, ['CHECKOUT_PAID', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'], Number(process.env.ASAAS_SANDBOX_WAIT_FOR_PAYMENT_MS ?? 600_000));
    console.log('Resultado do evento de pagamento confirmado', paidEvent
      ? { received: true, eventType: paidEvent.eventType, state: paidEvent.state, providerEventId: paidEvent.providerEventId }
      : { received: false, checkoutOrderId: checkout.orderId, timeoutReached: true });
    if (!createdEvent || !paidEvent) process.exitCode = 1;
  } finally {
    if (temporaryWebhookId) {
      try { await removeTemporaryWebhook(temporaryWebhookId); }
      catch (error) { console.error('Falha ao remover webhook temporário Sandbox; remova manualmente no painel', { webhookId: temporaryWebhookId, errorType: error instanceof Error ? error.name : 'UnknownError' }); process.exitCode = 1; }
    }
    for (const child of children) child.kill('SIGTERM');
    await prisma.$disconnect();
  }
}

try {
  await main();
} catch (error) {
  console.error('Teste Asaas Sandbox interrompido', { errorType: error instanceof Error ? error.name : 'UnknownError', message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
} finally {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}
