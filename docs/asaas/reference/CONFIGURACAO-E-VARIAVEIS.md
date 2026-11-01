# Configuração e variáveis do fluxo de pagamentos

Este documento descreve as variáveis lidas pelo backend, frontend e scripts de teste do fluxo Asaas. Os valores reais ficam nos ambientes de execução e nunca devem ser copiados para a documentação.

## Backend: modo e credenciais Asaas

| Variável | Quando é necessária | Uso e cuidados |
|---|---|---|
| `PAYMENTS_PROVIDER` | Sempre tem default | `SIMULATED` por padrão; `ASAAS` ativa o provider Asaas nas rotas. Definir explicitamente em cada ambiente para evitar que uma configuração ausente deixe o sistema em modo simulado. |
| `ASAAS_ENV` | Sempre tem default | `sandbox` por padrão; aceita `sandbox` ou `production`. Escolhe a URL base (`https://api-sandbox.asaas.com/v3` ou `https://api.asaas.com/v3`), a chave e o isolamento dos registros. Declarar explicitamente em cada deploy; não depender do default em produção. |
| `ASAAS_API_KEY_SANDBOX` | `PAYMENTS_PROVIDER=ASAAS` e `ASAAS_ENV=sandbox` | Chave privada exclusiva do Sandbox. Não usar no frontend. |
| `ASAAS_API_KEY` | `PAYMENTS_PROVIDER=ASAAS` e `ASAAS_ENV=production` | Chave privada exclusiva de produção. O código não usa uma chave como fallback para o outro ambiente. |
| `ASAAS_CREDENTIAL_ENCRYPTION_KEY` | Obrigatória no backend, inclusive com provider simulado | Base64 de exatamente 32 bytes. Cifra as credenciais das subcontas armazenadas localmente. Perder ou trocar a chave sem plano de rotação pode tornar essas credenciais ilegíveis. Guardar no secret manager e restringir acesso. |
| `ASAAS_HTTP_TIMEOUT_MS` | Opcional; default `10000` | Limite de espera das chamadas HTTP ao Asaas. Monitorar timeouts e respostas incertas; não aumentar sem revisar idempotência e recuperação. |
| `ASAAS_DASHBOARD_URL` | Opcional | URL do painel exibida na área da conta. O default legado é o painel de produção; o código o corrige para o painel Sandbox quando `ASAAS_ENV=sandbox`. Definir explicitamente se houver outro painel. |

`ASAAS_ENV` seleciona a chave e o host da API; o projeto não usa uma variável separada de URL base do Asaas. Registros financeiros, contas e eventos também são etiquetados com o ambiente selecionado. Uma seleção incorreta pode misturar a operação com o ambiente errado.

## Webhooks

| Variável | Quando é necessária | Uso e cuidados |
|---|---|---|
| `ASAAS_WEBHOOK_AUTH_TOKEN` | Obrigatória para autenticar webhooks e configurar webhooks de subconta; o schema atualmente permite omiti-la | Segredo enviado no header `asaas-access-token`. Usar o mesmo valor no Asaas e no backend, com pelo menos 32 caracteres. Rotacionar coordenando o backend e todos os webhooks cadastrados para evitar rejeição de eventos. |
| `ASAAS_WEBHOOK_URL` | Recomendada; necessária se não houver `PUBLIC_API_URL` | URL completa do endpoint, normalmente `https://<host>/api/v1/payments/webhooks/asaas`. Tem precedência sobre `PUBLIC_API_URL`. Deve apontar para um endpoint público HTTPS alcançável pelo Asaas. |
| `PUBLIC_API_URL` | Fallback se `ASAAS_WEBHOOK_URL` estiver ausente | O backend e os scripts acrescentam `/api/v1/payments/webhooks/asaas`. Manter a origem correta por ambiente. Não deixar URL de produção como fallback de um Sandbox local. |
| `ASAAS_WEBHOOK_EMAIL` | Necessária para registrar/atualizar webhook principal ou de subconta | E-mail que o Asaas usa para alertas. A configuração é opcional no schema, mas as operações de cadastro falham sem ela. |
| `ASAAS_WEBHOOK_ID` | Opcional; usada pelo script de atualização do webhook principal | Se omitida, o script tenta localizar o webhook pela URL exata. Conferir o ID e o ambiente antes de executar atualização. |

O webhook principal e o webhook de cada subconta são configurações distintas. A URL e o token precisam corresponder ao ambiente da conta. Nunca apontar testes sintéticos para um host de produção.

## Retorno do checkout e frontend

| Variável | Onde | Uso e cuidados |
|---|---|---|
| `PAYMENTS_RETURN_BASE_URL` | Backend; preferida quando definida | Base para as URLs de sucesso, cancelamento e expiração devolvidas pelo checkout. Com `PAYMENTS_PROVIDER=ASAAS`, deve usar HTTPS. |
| `PUBLIC_FRONT_URL` | Backend; fallback de `PAYMENTS_RETURN_BASE_URL` | URL pública do frontend e origem incluída na allowlist CORS. É exigida em modo `ASAAS` quando não há `PAYMENTS_RETURN_BASE_URL`. |
| `NEXT_PUBLIC_API_URL` | Frontend | URL do backend chamada pelo navegador. É pública por definição; nunca colocar segredos ou credenciais Asaas em variáveis `NEXT_PUBLIC_*`. |

## Infraestrutura usada pelo fluxo

| Variável | Dependência | O que observar |
|---|---|---|
| `DATABASE_URL` | PostgreSQL acessado via Prisma | Guarda pedidos, checkouts, cobranças, assinaturas, inbox/outbox de webhooks e projeções de acesso. Confirmar host e banco em cada ambiente; testes de integração devem usar banco isolado. |
| `REDIS_URL` | Redis / BullMQ | Fila e processamento assíncrono dos webhooks, além do cache de acesso. Confirmar conectividade do backend e do worker com a mesma instância/namespace do ambiente. |
| `SUPABASE_URL` | Supabase Auth/serviços usados pelo backend | URL do projeto associado ao backend e às contas de usuário. Deve corresponder ao mesmo ambiente do banco e do frontend. |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase | Chave pública usada pelo backend nos fluxos que não requerem privilégios administrativos. Não substitui a chave de serviço. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase; somente backend | Chave privilegiada. Nunca enviar ao navegador nem prefixar com `NEXT_PUBLIC_`. Limitar acesso no secret manager. |
| `NODE_ENV` | Runtime Node.js | Em `development`, o loader do backend permite que `backend/.env` sobrescreva valores já exportados no shell; em outros modos, os valores do processo prevalecem. Isso afeta comandos locais que tentam forçar `ASAAS_ENV` ou URLs de teste. |

## Variáveis somente de teste

Estas variáveis não devem ser adicionadas ao ambiente de produção:

| Variável | Uso |
|---|---|
| `ASAAS_WEBHOOK_TEST_ALLOWED_HOSTS` | Allowlist exigida pelo teste sintético de status de subconta. O script também exige Sandbox, HTTPS e rejeita hostname de produção. |
| `ASAAS_SANDBOX_TEST_PORT` | Porta local da API iniciada pelo roteiro ponta a ponta Sandbox; default `3017`. |
| `ASAAS_SANDBOX_WAIT_FOR_PAYMENT_MS` | Tempo de espera por confirmação no roteiro ponta a ponta; default do script `600000` ms. |
| `PAYMENTS_TEST_DATABASE_URL` | URL reservada aos testes de integração de pagamentos. Eles só executam quando também `DATABASE_URL` aponta para a mesma base isolada com o nome esperado pelo teste. |

O roteiro `backend/src/scripts/create-student-asaas-sandbox-checkout-webhook.ts` requer banco local chamado `asaas_sandbox_test`, Redis local, chave Sandbox, token e e-mail do webhook. Ele abre ngrok, cria um webhook temporário e remove esse webhook ao terminar.

## Simulação: não confundir com checkout Asaas

| Variável | Uso |
|---|---|
| `PAYMENTS_SIMULATION_ENABLED` | Liga/desliga a rota de compra simulada; default `false`. Deve permanecer `false` em produção. Não simula a API Asaas nem valida webhooks reais. |
| `PAYMENTS_TEST_PRICE_CENTS` | Valor em centavos usado pela rota simulada; default `1990` (R$ 19,90). Não define o preço de um checkout Asaas real. O checkout real lê `Monitor.priceCents` e persiste o snapshot no pedido. |

## Configuração mínima por ambiente

### Sandbox

- `PAYMENTS_PROVIDER=ASAAS`
- `ASAAS_ENV=sandbox`
- `ASAAS_API_KEY_SANDBOX` configurada
- `ASAAS_WEBHOOK_AUTH_TOKEN` igual ao cadastrado no webhook Sandbox
- `ASAAS_WEBHOOK_URL` apontando para o endpoint Sandbox público, ou `PUBLIC_API_URL` equivalente
- `ASAAS_WEBHOOK_EMAIL` configurada para cadastro/sincronização de webhooks
- `PAYMENTS_RETURN_BASE_URL` ou `PUBLIC_FRONT_URL` com HTTPS
- Banco e Redis isolados do ambiente de produção

### Produção

- `PAYMENTS_PROVIDER=ASAAS`
- `ASAAS_ENV=production`
- `ASAAS_API_KEY` configurada; não depender da chave Sandbox
- `ASAAS_WEBHOOK_AUTH_TOKEN`, URL e e-mail alinhados com os webhooks de produção
- `PAYMENTS_RETURN_BASE_URL` ou `PUBLIC_FRONT_URL` com HTTPS
- `PAYMENTS_SIMULATION_ENABLED=false`
- `DATABASE_URL` e `REDIS_URL` apontando para os serviços de produção corretos
- `ASAAS_CREDENTIAL_ENCRYPTION_KEY` estável, protegida e com backup/rotação planejados

## Checklist de monitoramento e melhorias

- Alertar se `PAYMENTS_PROVIDER=ASAAS` e faltar a chave correspondente ao `ASAAS_ENV`. O schema já bloqueia esse caso na inicialização.
- Considerar validação de configuração que exija `ASAAS_WEBHOOK_AUTH_TOKEN`, `ASAAS_WEBHOOK_URL`/`PUBLIC_API_URL` e `ASAAS_WEBHOOK_EMAIL` quando operações de webhook forem habilitadas. Hoje são opcionais no schema, embora algumas operações falhem em runtime sem elas.
- Alertar sobre combinação inesperada entre `NODE_ENV`, `ASAAS_ENV` e host do banco; `ASAAS_ENV` tem default `sandbox`, não detecta sozinho um deploy de produção mal configurado.
- Verificar que API e worker usam a mesma `DATABASE_URL`, `REDIS_URL`, `ASAAS_ENV` e token de webhook.
- Monitorar respostas 401/403 do endpoint de webhook, timeouts Asaas, eventos presos na inbox, falhas de enqueue/worker e estado de sincronização dos webhooks das subcontas.
- Monitorar validade/acesso à `ASAAS_CREDENTIAL_ENCRYPTION_KEY`; não rotacionar sem plano para credenciais já cifradas.
- Manter o preço do monitor de teste explícito; `PAYMENTS_TEST_PRICE_CENTS` não afeta checkout Asaas hospedado.
- Verificar se `ASAAS_WEBHOOK_URL` e a URL derivada de `PUBLIC_API_URL` não divergem. Scripts de teste, registro e sincronização compartilham essa configuração.
- Há comandos pontuais de reconciliação de pagamentos (`payments:reconcile:asaas` e `payments:reconcile:asaas-payment`) que exigem produção e podem gravar eventos/alterar estado local. Conferir os argumentos, o pedido e a conta antes de executar; eles não são um job automático nem substituem monitoramento contínuo.

## Fontes no repositório

- `backend/src/config/env.ts`
- `backend/.env.example`
- `backend/src/modules/payments/payments-account.module.ts`
- `backend/src/modules/payments/payments-webhook.module.ts`
- `backend/src/modules/payments/infrastructure/providers/asaas/asaas.config.ts`
- `backend/src/scripts/`
- `frontend/.env.example`
