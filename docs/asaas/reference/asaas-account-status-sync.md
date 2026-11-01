# Sincronização de status das subcontas Asaas

## Objetivo

Manter o painel do professor consistente com a situação da subconta no Asaas. O Asaas é a fonte externa de verdade; `payment_accounts` mantém o espelho local, atualizado por eventos autenticados recebidos na inbox e pelo reprocessamento desses eventos. Este módulo não consulta periodicamente o estado cadastral remoto do Asaas.

## Fluxo de status

1. O backend reserva uma operação de criação para professor e ambiente, e envia `POST /accounts` com a configuração de webhook e os dados cadastrais.
2. O backend salva o ID/wallet da subconta, os dados de cadastro necessários e a credencial da subconta cifrada. A operação de criação fica rastreável para reconciliar resposta remota incerta ou falha local.
3. Com a credencial da subconta, o backend confirma o webhook de status. Ele atualiza um webhook de mesma URL se encontrar um ou cria um novo; falha de sincronização fica em estado recuperável próprio e não equivale a reprovação cadastral.
4. O Asaas envia eventos `ACCOUNT_STATUS_*` ao endpoint `POST /api/v1/payments/webhooks/asaas` com o cabeçalho `asaas-access-token`.
5. A API valida o token e persiste o envelope em `payment_webhook_events` antes de responder `200`; o worker processa a inbox e espelha o evento em `payment_accounts`.

O webhook é idempotente: se já houver uma configuração para a mesma URL da subconta, ela é atualizada; caso contrário, é criada. O ID retornado é salvo em `payment_accounts.provider_webhook_id`.

## Espelho de status no banco

| Tabela | Campos relevantes | Papel na integração |
|---|---|---|
| `teachers` | `current_payment_account_id` | Ponteiro da conta de recebimento ativa do professor. Não é uma cópia do estado Asaas. |
| `payment_accounts` | `environment`, `provider`, `provider_account_id`, `wallet_id`, `provider_webhook_id` | Identidade local da subconta e do webhook por ambiente. `provider_account_id` deve corresponder ao `account.id` recebido no evento. |
| `payment_accounts` | `status`, `general_status`, `commercial_info_status`, `bank_account_status`, `documentation_status` | Espelho de elegibilidade e das quatro dimensões de análise do Asaas. |
| `payment_accounts` | `verified_at`, `last_event_at`, `rejection_reason`, `onboarding_url`, `activation_channel` | Metadados locais de ativação e auditoria de tempo. `verified_at` só é preenchido pela aprovação geral. |
| `payment_account_credentials` | `payment_account_id`, `environment`, `ciphertext`, `nonce`, `auth_tag`, `key_version` | Credencial cifrada da subconta. É usada no backend para listar/criar/atualizar o webhook e consultar indicadores. Nunca expor ou registrar em logs. |
| `teacher_payment_profiles` | `payment_account_id` e dados cadastrais | Snapshot dos dados KYC enviados na criação. Não é o status de aprovação. Contém PII e não deve ser usado em consultas operacionais de status. |
| `payment_webhook_events` | `environment`, `provider_account_id`, `provider_event_id`, `event_type`, `payload`, `state`, `attempts`, `failure_message`, `processed_at` | Inbox idempotente e trilha de auditoria bruta dos eventos recebidos. É a fonte para reprocessamento local. |
| `payment_outbox_events` | `aggregate_id`, `event_type`, `state`, `attempts`, `processed_at` | Entrega assíncrona para o worker após a persistência da inbox. Não é o espelho do status da conta. |
| `payment_audit_entries` | `origin`, `reason`, `before`, `after`, `teacher_id` | Auditoria de mudanças financeiras quando aplicável; não substitui a inbox. |

## Regras de mapeamento

| Evento Asaas | Campo que muda | `payment_accounts.status` |
|---|---|---|
| `ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED` | `general_status=APPROVED`, `verified_at=ocorrido_em` | `APPROVED` |
| `ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED` | `general_status=REJECTED`, `verified_at=NULL` | `REJECTED` |
| `ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING` ou `...AWAITING_APPROVAL` | `general_status` correspondente, `verified_at=NULL` | `PENDING` |
| `ACCOUNT_STATUS_COMMERCIAL_INFO_*` | `commercial_info_status` | Não muda o status geral |
| `ACCOUNT_STATUS_BANK_ACCOUNT_INFO_*` | `bank_account_status` | Não muda o status geral |
| `ACCOUNT_STATUS_DOCUMENT_*` | `documentation_status` | Não muda o status geral |

Um documento ou conta bancária aprovados isoladamente **não** tornam a subconta elegível. A elegibilidade para criação/publicação é dada somente pela aprovação geral.

## Correção de conta já criada

Para uma conta existente sem `provider_webhook_id`, use o comando administrativo no ambiente correspondente:

```bash
cd backend
npm run asaas:subaccount-webhook:sync -- <paymentAccountId>
```

O comando exige `ASAAS_ENV`, `ASAAS_WEBHOOK_URL` (ou `PUBLIC_API_URL`), `ASAAS_WEBHOOK_EMAIL`, `ASAAS_WEBHOOK_AUTH_TOKEN` e a chave de criptografia local. Ele não aprova a conta nem modifica os campos de status; apenas garante o webhook da subconta e persiste o identificador devolvido pelo Asaas.

O identificador é específico de cada ambiente. Passe o `paymentAccountId` da conta que pretende sincronizar; não reutilize IDs de Sandbox em produção nem o contrário. Antes de executar, confirme `ASAAS_ENV`, banco, webhook URL e credenciais carregadas no processo.

## Conferência operacional

Depois de corrigir o webhook, verifique a configuração local e o espelho:

```sql
SELECT
  id,
  environment,
  provider_account_id,
  provider_webhook_id,
  status,
  general_status,
  commercial_info_status,
  bank_account_status,
  documentation_status,
  verified_at,
  last_event_at,
  updated_at
FROM payment_accounts
WHERE id = '<paymentAccountId>';
```

Para ver os eventos recebidos e seu processamento:

```sql
SELECT
  id,
  provider_event_id,
  event_type,
  state,
  attempts,
  failure_message,
  created_at,
  processed_at
FROM payment_webhook_events
WHERE environment = 'PRODUCTION'
  AND provider_account_id = '<providerAccountId>'
ORDER BY created_at DESC;
```

## Reprocessamento

O reprocessamento é feito somente para um evento que já esteja na inbox. Não criar um evento manual com aprovação sem antes confirmar o estado no Asaas. Para um evento existente, use:

```bash
cd backend
npm run payments:process-webhook-event -- <paymentWebhookEventId>
```

O processador atualiza o espelho apenas se o `provider_account_id` do evento encontrar a subconta local. Eventos sem correlação entram em `WAITING_CORRELATION` e são reavaliados pelo job de recuperação; após o limite de tentativas, vão para `DEAD_LETTER`. O resultado esperado para uma aprovação geral é `ACCOUNT_STATUS_APPLIED`.

## Estado atual e lacunas operacionais

Implementado: operação de criação idempotente por professor/ambiente; estado recuperável para sincronização de webhook da subconta; reprocessamento de inbox; recuperação periódica de `WAITING_CORRELATION`; e registro estruturado dos passos principais. Isso não substitui a conferência da configuração remota no painel/API Asaas.

Ainda falta para operação mais observável:

1. Alertar sobre contas `PENDING` por tempo excessivo e sobre `webhookSyncState` não concluído, sem `provider_webhook_id` ou em erro persistente.
2. Criar reconciliação periódica do status cadastral consultando o Asaas e gravando mudanças com trilha auditável. Hoje não há consulta periódica automática do status remoto.
3. Rever a unicidade global de `provider_account_id` e `wallet_id` no schema. Embora haja índices por ambiente, as constraints `@unique` atuais não incluem `environment`; se o Asaas puder reutilizar identificadores entre Sandbox e produção, isso pode colidir.
4. Exportar métricas/alertas para criação, sincronização, recepção e processamento de eventos. Logs estruturados existem, mas não equivalem a alertas operacionais.
