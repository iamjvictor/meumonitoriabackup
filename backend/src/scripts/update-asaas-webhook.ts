import { env } from '../config/env.js';
import { getAsaasBaseUrl, selectAsaasApiKey } from '../modules/payments/infrastructure/providers/asaas/asaas.config.js';
import { ASAAS_PLATFORM_WEBHOOK_EVENTS } from '../modules/payments/infrastructure/providers/asaas/asaas-webhook-events.js';

const webhookUrl = env.ASAAS_WEBHOOK_URL ?? (env.PUBLIC_API_URL ? `${env.PUBLIC_API_URL.replace(/\/$/, '')}/api/v1/payments/webhooks/asaas` : undefined);
const webhookEmail = process.env.ASAAS_WEBHOOK_EMAIL;

if (!webhookUrl) throw new Error('Defina ASAAS_WEBHOOK_URL ou PUBLIC_API_URL antes de atualizar o webhook.');
if (!webhookEmail) throw new Error('Defina ASAAS_WEBHOOK_EMAIL com o e-mail de alertas da conta principal do Asaas.');
if (!env.ASAAS_WEBHOOK_AUTH_TOKEN) throw new Error('Defina ASAAS_WEBHOOK_AUTH_TOKEN antes de atualizar o webhook.');

const events = ASAAS_PLATFORM_WEBHOOK_EVENTS;

let webhookId = env.ASAAS_WEBHOOK_ID;
if (!webhookId) {
  const listResponse = await fetch(`${getAsaasBaseUrl(env.ASAAS_ENV)}/webhooks`, {
    headers: { accept: 'application/json', access_token: selectAsaasApiKey(env.ASAAS_ENV, { sandbox: env.ASAAS_API_KEY_SANDBOX, production: env.ASAAS_API_KEY })! },
  });
  const listPayload = await listResponse.json().catch(() => null) as { data?: Array<{ id?: string; url?: string }> } | null;
  webhookId = listPayload?.data?.find((webhook) => webhook.url === webhookUrl)?.id;
  if (webhookId) {
    console.log('Webhook atual localizado pela URL', { event: 'payments.asaas_webhook_discovered', webhookId, url: webhookUrl });
  }
}
if (!webhookId) throw new Error('Nenhum webhook foi encontrado para esta URL. Defina ASAAS_WEBHOOK_ID ou registre o webhook primeiro.');

const response = await fetch(`${getAsaasBaseUrl(env.ASAAS_ENV)}/webhooks/${webhookId}`, {
  method: 'PUT',
  headers: { accept: 'application/json', 'content-type': 'application/json', access_token: selectAsaasApiKey(env.ASAAS_ENV, { sandbox: env.ASAAS_API_KEY_SANDBOX, production: env.ASAAS_API_KEY })! },
  body: JSON.stringify({
    name: 'MeuMonitorAI - Pagamentos e subcontas',
    url: webhookUrl,
    email: webhookEmail,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: env.ASAAS_WEBHOOK_AUTH_TOKEN,
    sendType: 'SEQUENTIALLY',
    events,
  }),
});

const payload = await response.json().catch(() => null) as { id?: string; url?: string; enabled?: boolean; errors?: unknown } | null;
if (!response.ok) {
  console.error('Falha ao atualizar webhook no Asaas', { event: 'payments.asaas_webhook_update_failed', status: response.status, response: payload });
  process.exitCode = 1;
} else {
  console.log('Webhook atualizado no Asaas', { event: 'payments.asaas_webhook_updated', webhookId: payload?.id ?? webhookId, url: payload?.url ?? webhookUrl, enabled: payload?.enabled ?? true });
}
