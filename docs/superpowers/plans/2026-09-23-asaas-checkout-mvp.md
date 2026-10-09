# Asaas Checkout MVP — plano de implementação por fases

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (quando disponível) ou superpowers:executing-plans para executar uma fase por vez. Não avançar uma entrega externa sem cumprir seu critério de saída.

**Goal:** Implementar checkout Asaas hospedado, cartão recorrente mensal, recebimento do professor e acesso por confirmação financeira, preservando as regras acordadas de percentual e fallback.

**Architecture:** Módulo payments em monólito modular, com porta de provider, persistência financeira própria, inbox de webhooks e outbox transacional. student-access recebe eventos idempotentes e mantém a compatibilidade de acesso. O billing simulado permanece isolado durante a transição.

**Tech Stack:** TypeScript, Fastify, Zod, Prisma 7, PostgreSQL/Supabase, BullMQ/Redis já existentes, Node Test Runner/tsx, Next.js 16/React, Vitest/Playwright.

**Spec:** [Desenho consolidado](../specs/2026-09-23-asaas-checkout-mvp-design.md).
**Revisão:** 2026-09-23. Substitui a lista anterior de Tasks 1–11 deste arquivo.
**Estado:** Fase 1 implementada localmente; migration ainda não aplicada no banco remoto por indisponibilidade do host Supabase. Integração Asaas e webhook continuam nas fases seguintes.

## Global Constraints

- Cartão recorrente mensal; um monitor por checkout no MVP; sem Pix, boleto, anual ou split de indicação ativo.
- Monitor.priceCents é a fonte do preço, com default 5990. Remover preços promocionais fixos da vitrine.
- Teacher.status existente usa 'active', não 'ACTIVE'.
- Professor PF/PJ; dados bancários, documentos e cartão tratados no Asaas. Criação automática depende do fluxo comprovado na fase 0.
- Após o cadastro do perfil, o professor pode iniciar a conta Asaas mesmo enquanto está em análise; criar produto e publicar exigem perfil ativo e conta de recebimento aprovada.
- Dispensa administrativa permite publicar sem conta; não simula aprovação financeira.
- Conta inelegível de monitor já publicado mantém venda e direciona parcela do professor para a plataforma; regularização restaura cobranças seguintes.
- Percentual inicial 50%, alterável só por administrador, com histórico. Congelar por vínculo contratado, não consultar percentual atual a cada renovação.
- Percentuais de indicação apenas modelados, default 5%, sem repasse no MVP.
- Split percentual sobre líquido; plataforma fica com remanescente, sem split para a própria carteira emissora.
- Confirmado libera acesso; recebido registra liquidação. Cada cobrança mensal concede seu período uma única vez.
- Cancelamento mantém período pago; falha real de renovação suspende o vínculo afetado até regularização.
- IDs e eventos devem ser isolados por provider, ambiente e conta; Sandbox não pode contaminar produção.
- Nenhum endpoint ou parâmetro do frontend confirma pagamento ou escolhe destinatário/percentual.
- Mudança de carteira exige sincronização com Asaas, não apenas UPDATE local.
- Sem remoção de histórico legado ou conversão de compras simuladas em pagamentos reais.
- Antes de escrever frontend, ler frontend/AGENTS.md e os guias pertinentes em frontend/node_modules/next/dist/docs/.

## Review Focus

1. Criação externa concluída com resposta perdida: não duplicar cobrança ao tentar fallback; fases 0, 2 e 5.
2. Webhook duplicado, concorrente ou anterior ao commit do checkout: não perder evento nem duplicar acesso; fases 3 e 6.
3. Troca de carteira com próxima cobrança já emitida: sincronizar ambos os recursos, registrar corrida com captura; fase 7.
4. Enrollment legado ativo após suspensão: impedir bypass e verificar expiração em todos os leitores; fase 6.
5. Conta criada sem aprovação e dados faltantes para onboarding: não liberar publicação por simples existência de wallet; fases 0 e 4.

## 1. O que existe hoje — evidências do repositório

A análise abaixo usa schema.prisma, migrations e código local. Não constitui inspeção do schema aplicado no banco remoto. A fase 0 inclui comparação somente leitura antes de qualquer migration.

| Componente | Estado observado | Uso na migração |
|---|---|---|
| frontend/.../checkout/simulado/page.tsx | Lê mm_simulated_checkout do sessionStorage e envia X-Simulated-Session para simulated-confirmation | Reaproveitar navegação/estados; retirar confirmação por botão do fluxo real |
| billing/services/simulated-confirmation.service.ts | Valida hash da sessão, consome token e chama WebhookService.process('SIMULATED') diretamente | Fixture de regressão; não é entrega externa de webhook |
| billing/controllers/webhook.controller.ts | Aceita SIMULATED/STRIPE; STRIPE retorna 503; schema strict com purchaseId e amount | Criar adapter próprio para envelope Asaas; não adicionar apenas um provider à enum |
| billing/services/webhook.service.ts | Valida valor/moeda, rejeita purchase já PAID, efetiva compra e só depois marca evento processado | Reaproveitar casos de teste, rever transações e ciclo de eventos |
| billing/repositories/webhook-event.repository.ts | Dedupe por provider/event ID e claim CLAIMED/FAILED | Falta lease: service também continua para evento CLAIMED por outro processo |
| billing/repositories/purchase.repository.ts | Cria/reutiliza assinatura agregada; grava items, enrollment e student_subscriptions | Não reutilizar como processador Asaas: renovação não é compra incremental |
| student-access/service + repository | Autoriza por subscription OU enrollment OU ownership; consultas de status sem prazo | Ajustar os dois caminhos e consumidores diretos |
| StudentPurchase / Item | Pedido, total em centavos, método, gateway IDs e chave única | Preservar histórico; novos registros financeiros terão identidade própria |
| StudentPaymentSession | Token hash e expiração do simulado | Manter isolada; sessão Asaas terá checkout ID, nunca esse token |
| StripeCustomer / BillingSubscription | Identidade legado e índice parcial de uma assinatura ativa por aluno | Não impor essa restrição às novas assinaturas independentes |
| StudentEnrollment | FK obrigatória para BillingSubscriptionItem; UNIQUE student/monitor | Adicionar vínculo alternativo para novo item financeiro com CHECK |
| StudentSubscription | Projeção por student/monitor; amountPaid Float | Manter compatibilidade em reais, sem usar Float como fonte financeira |
| Teacher / Monitor | Sem conta, percentual, indicação, preço ou dispensa financeira | Migration aditiva na fase 1 |
| TeacherProfileService | MOCK_PAYMENT_CONFIGURED=true e fallback local positivo | Remover na fase 4 |
| Vitrine / checkout | Vitrine fixa R$ 29,90/R$ 59,90; checkout interpreta preço do carrinho | Usar preço retornado pelo backend na fase 5 |
| config/env.ts | Só PAYMENTS_SIMULATION_ENABLED e PAYMENTS_TEST_PRICE_CENTS | ASAAS_API_KEY adicionada pelo usuário ainda não integra o schema Zod |
| Infraestrutura | Fastify, worker, Redis/BullMQ, testes Node e frontend existentes | Reaproveitar processos e composição; não criar microsserviço |

Baseline executada nesta revisão, em backend/:

    node --import tsx --test src/modules/billing/services/__tests__/webhook.service.test.ts src/modules/billing/services/__tests__/simulated-confirmation.service.test.ts src/modules/billing/controllers/__tests__/webhook.controller.test.ts src/modules/student-access/__tests__/student-access.service.test.ts

Resultado: quatro arquivos de teste passaram. Isso valida a regressão simulada atual, não concorrência real, Asaas ou banco remoto.

## 2. Documentação Asaas consultada e consequências

| Contrato verificado | Consequência para nosso plano | Fonte oficial |
|---|---|---|
| Checkout hospedado aceita CREDIT_CARD + RECURRENT e configuração MONTHLY | Criar checkout; não coletar cartão nem criar uma segunda assinatura paralela | [Checkout](https://docs.asaas.com/reference/criar-novo-checkout), [recorrência](https://docs.asaas.com/docs/checkout-with-subscription-recurring) |
| CHECKOUT_PAID e eventos PAYMENT_* são ciclos distintos | Correlacionar sessão, cobrança e assinatura; callback nunca concede acesso | [Eventos de checkout](https://docs.asaas.com/docs/eventos-para-checkout), [pagamentos](https://docs.asaas.com/docs/payment-events) |
| percentualValue usa netValue; remanescente fica no emissor | Enviar percentual do professor; fallback sem recebedor externo | [Split](https://docs.asaas.com/docs/split-de-pagamentos) |
| split na assinatura não modifica cobranças já geradas | Atualizar template e cada cobrança pendente elegível à mudança | [Split recorrente](https://docs.asaas.com/docs/split-em-assinaturas) |
| Subconta exige conta-pai PJ e cadastro básico | Chave Sandbox sozinha não viabiliza onboarding automático | [Criar subconta](https://docs.asaas.com/reference/criar-subconta) |
| Não-BaaS conclui ativação/documentos na interface Asaas | Candidato preferencial ao requisito de configuração externa; validar habilitação | [Subcontas](https://docs.asaas.com/docs/criacao-de-subcontas) |
| Aprovação geral e dimensões de accountStatus | Não inventar evento SUSPENDED; derivar estado local | [Conta](https://docs.asaas.com/docs/webhook-para-verificar-situacao-da-conta) |
| authToken chega em asaas-access-token; token distinto da API key | Validar webhook sem sessão de aluno e responder HTTP 200 após persistir | [Webhook](https://docs.asaas.com/docs/criar-novo-webhook-pela-api), [fila](https://docs.asaas.com/docs/webhooks-queue-paused) |
| API exige access_token e identificação User-Agent | Cliente HTTP backend próprio, segredo sem exposição | [Autenticação](https://docs.asaas.com/docs/autentica%C3%A7%C3%A3o-1) |
| Consulta de pagamentos oferece filtro checkoutSession | Recuperar ligação financeira de checkout conhecido | [List payments](https://docs.asaas.com/reference/list-payments) |

Não assumir que externalReference evita duplicação no Asaas. Não afirmar que qualquer erro pode ser convertido em venda bem-sucedida: falha de conta recebedora permite tentar a política de fallback quando o resultado anterior é conhecido; indisponibilidade geral e resultado ambíguo exigem reconciliação.

## 3. Ordem e entregas

| Fase | Entrega verificável | Depende de |
|---|---|---|
| 0 | Contratos externos comprovados e inventário do banco | Documentação/chave Sandbox |
| 1 | Schema aditivo, snapshots, auditoria e vínculo de acesso | Inventário 0 |
| 2 | Configuração, porta e adapter de checkout/assinatura | Contratos 0; contratos locais podem começar em paralelo com 1 |
| 3 | Webhook durável, worker e outbox | 1 + 2 |
| 4 | Conta de recebimento, status real e publicação | 3 + prova do onboarding 0 |
| 5 | Checkout real e telas de retorno | 2 + 3 + 4 |
| 6 | Confirmação, renovação, cancelamento e acesso | 5 + base da outbox 3 |
| 7 | Troca de carteira, fallback e reconciliação | 4 + 6 |
| 8 | Homologação ponta a ponta e migração do legado | 5 + 6 + 7 |
| 9 | Ativação controlada em produção | Homologação 8 + conta produção |

Marcos: após 3 recebemos eventos com segurança; após 4 professor fica apto a publicar; após 6 comprovamos a primeira venda; após 8 o MVP está pronto para avaliar produção. Primeira venda em Sandbox não significa recorrência homologada.

## Fase 0 — fechar viabilidade e inventariar sem alterar banco

**Arquivos a criar:** docs/superpowers/reports/asaas-sandbox-contracts.md; backend/scripts/inspect-payment-schema.sql; backend/scripts/asaas-sandbox-probe.ts.
**Modificar:** este plano e a spec somente para registrar evidências obtidas.
**Entrega:** relatório com request shape sanitizado, campos observados e resultado por cenário; nenhum segredo.

- [ ] Ler AGENTS aplicáveis e levantar configuração de migrations via backend/prisma.config.ts. O caminho atual é prisma/migrations; não aplicar a mesma mudança também via Supabase.
- [ ] Consultar em modo somente leitura information_schema, pg_constraint, pg_indexes e histórico _prisma_migrations: validar tabelas existentes, índices ativos e RLS. Contar registros simulados sem extrair dados pessoais. Registrar divergências com schema.prisma.
- [ ] Implementar probe autenticado de leitura; carregar dotenv pelo runtime, nunca source .env no shell, para preservar caracteres especiais da API key. Imprimir apenas presença/configuração, HTTP status e campos permitidos.
- [ ] Confirmar ambiente Sandbox, conta emissora e capacidade de subcontas. Não concluir que a chave é válida apenas por estar preenchida.
- [ ] Provar checkout hospedado com cartão mensal, 5990 centavos e split percentual de teste; guardar checkout/payment/subscription IDs separados e payloads sanitizados.
- [ ] Demonstrar correlação com checkoutSession e subscription dos pagamentos. Não assumir que externalReference do checkout será propagado a todos os objetos.
- [ ] Simular resposta perdida e definir recuperação de checkout sem ID: evento correlacionado ou consulta suportada. Se não existir recuperação automática segura, manter UNKNOWN_EXTERNAL_RESULT e intervenção/reconciliação sem novo POST.
- [ ] Provar edição de split da assinatura e de cobrança pendente, inclusive remoção de split; registrar estado no qual provider já não permite editar.
- [ ] Confirmar onboarding não-BaaS e os dados iniciais exigidos. Hoje Teacher não contém CPF/CNPJ, endereço ou renda. Se não houver fluxo totalmente externo compatível, registrar bloqueio dessa etapa e obter decisão específica antes de coletar esses dados internamente.
- [ ] Provar consulta de status da subconta: GET /myAccount/status é da conta autenticada. Definir credencial apropriada e webhook vinculado à subconta; não usar a chave pai presumindo consultar qualquer titular.
- [ ] Verificar como recuperar/atualizar cartão pelo fluxo hospedado e como regularização altera próxima data. Documentar ciclo mensal e eventual cobrança futura já criada.
- [ ] Configurar operações de escrita Sandbox somente durante a execução desta fase, com dados de teste e escopo identificável. Registrar IDs criados para rastreio.

**Saída:** checkout + recorrência + correlação + edição de split comprovados; caminho de onboarding descrito ou explicitamente bloqueado. Enquanto onboarding não estiver resolvido, podem avançar fake provider e infraestrutura, sem expor criação automática incompleta.

## Fase 1 — modelagem e migrations aditivas

**Modificar:** backend/prisma/schema.prisma.
**Criar:** migrations geradas com os nomes lógicos payments_accounts_pricing, payments_recurring_core e payments_access_bridge; backend/src/modules/payments/domain/contracts.ts; backend/src/modules/payments/infrastructure/persistence/.
**Testes:** backend/src/modules/payments/__tests__/payments-schema.integration.test.ts; payments-snapshots.test.ts.

### Alterações em tabelas atuais

| Tabela | Adição/ajuste | Regra |
|---|---|---|
| teachers | teacherPercentage Decimal(7,4), default 50; currentPaymentAccountId nullable | 0..100; percentual de indicação não pertence ao professor; precisão permite taxas fracionárias |
| teacher_referrals | referredTeacherId UNIQUE, indicatorTeacherId, percentage Decimal(7,4), status | Relação existe somente quando houver indicação; percentual é registrado no momento da indicação e não há default para professores sem indicador |
| monitors | priceCents Int default 5990; allowPublishWithoutPaymentAccount Boolean default false | Preço positivo; professor não altera dispensa nem preço por mass assignment |
| student_enrollments | subscriptionItemId legado nullable; paymentSubscriptionItemId novo nullable | Exatamente um vínculo financeiro, com CHECK; manter UNIQUE student/monitor |
| student_subscriptions | paymentSubscriptionItemId novo nullable; lastPaymentChargeId nullable | Ponte de acesso/histórico; purchaseId/lastPaymentId antigos seguem apontando só ao legado |
| student_enrollments | states PAST_DUE, CANCELED/REMOVED com vocabulário único escolhido na migration | Corrigir diferença atual: repository grava CANCELLED, CHECK legado não aceita |

Não apagar StripeCustomer/BillingSubscription; índice parcial de aluno ativo continua somente no legado. Novo esquema permite assinaturas independentes. Não criar novo enrollment para o mesmo student/monitor em cada renovação.

### Novas entidades

Todas têm UUID local, timestamps pertinentes, FKs indexadas e ambiente SANDBOX/PRODUCTION quando recebem identidade externa.

| Entidade / tabela | Conteúdo mínimo e unicidade |
|---|---|
| PaymentAccount / payment_accounts | teacherId, environment, providerAccountId, walletId, revision, status local, general/commercialInfo/bankAccountInfo/documentation, activationChannel, onboardingUrl opcional, credentialRef, verifiedAt, lastEventAt, revision de sincronização; UNIQUE ambiente/providerAccountId e ambiente/walletId |
| PaymentCustomer / payment_customers | studentId, environment, providerCustomerId; UNIQUE student/ambiente e ambiente/customer |
| PaymentOrder / payment_orders | studentId, environment, status, grossCents, currency BRL, externalReference, requestFingerprint, createdAt; intenção inicial, não cobrança mensal |
| PaymentOrderItem / payment_order_items | orderId, monitorId, teacherId, description, priceCentsSnapshot, teacherPercentageSnapshot, referrerTeacherIdSnapshot nullable, referralPercentageSnapshot=0 quando não houver indicação |
| PaymentCheckout / payment_checkouts | orderId, attempt, providerCheckoutId nullable, checkoutUrl, expiresAt, status, externalReference; UNIQUE ambiente/checkout; estado UNKNOWN_EXTERNAL_RESULT |
| PaymentSubscription / payment_subscriptions | studentId, orderId, providerSubscriptionId nullable, customerId, environment, status, nextDueDate, anchorDay, currentPeriodStart/End, cancelAtPeriodEnd, canceledAt, desiredPayoutVersion, appliedPayoutVersion |
| PaymentSubscriptionItem / payment_subscription_items | subscriptionId, studentId, monitorId, teacherId, priceCentsSnapshot, teacherPercentageSnapshot, referrerTeacherIdSnapshot nullable, referralPercentageSnapshot; UNIQUE subscription/monitor |
| PaymentCharge / payment_charges | subscriptionId, providerPaymentId, environment, dueDate, servicePeriodStart/End, status, grossCents, netCents nullable, feeCents nullable, confirmedAt, receivedAt, appliedPayoutVersion; UNIQUE ambiente/payment ID |
| PaymentSplit / payment_splits | chargeId, itemId, role, accountRevisionId nullable, walletId nullable, contractedPercentage, effectivePercentage, destination, fallbackReason, providerSplitId nullable, expected/settledCents nullable, status |
| PaymentIdempotencyKey / payment_idempotency_keys | studentId, operation, key, fingerprint, resourceId, state, timestamps; UNIQUE aluno/operação/chave |
| PaymentWebhookEvent / payment_webhook_events | environment, providerAccountId, providerEventId, eventType, allowlistedPayload, state, attempts, nextAttemptAt, leaseUntil, processedAt; UNIQUE ambiente/conta/evento |
| PaymentOutboxEvent / payment_outbox_events | eventId, aggregateId, version, type, payload, state, attempts, nextAttemptAt; UNIQUE eventId |
| PaymentAuditEntry / payment_audit_entries | actorUserId nullable, databaseActor, origin, reason, teacher/monitor/subscription/charge IDs, before/after sanitizados, occurredAt; append-only |
| StudentAccessPaymentEvent / student_access_payment_events | eventId UNIQUE, chargeId, action, processedAt; owned por student-access |

PaymentAccount deve permitir histórico de carteira: não usar teacherId UNIQUE em toda a tabela. Professor aponta para conta corrente; a candidata em validação é outra revisão. FKs do financeiro usam RESTRICT ou SET NULL com snapshot, sem deleção financeira em cascata de professor/aluno.

- [x] Escrever testes de contrato/schema: preço 5990, default 50/5, ponte de conta/repetição e preservação das entidades legadas.
- [x] Adicionar CHECKs de moeda/valores/percentuais e soma futura <=100; manter a unicidade existente student/monitor enquanto o vínculo financeiro é introduzido.
- [x] Modelar percentuais como decimais exatos (strings nos DTOs), valores como centavos e net/fee desconhecidos como NULL.
- [ ] Adicionar trigger de auditoria para alteração de percentual/preço/dispensa. Operação administrativa fornece actor e motivo via contexto transacional; edição direta autorizada registra databaseActor/origem DIRECT_DB, sem inventar adminId.
- [ ] Proteger snapshots contratados contra UPDATE após ativação; alterações de carteira geram revisão de destino, não alteração de percentual contratado.
- [x] Habilitar RLS nas tabelas financeiras; as policies/ownership e a validação dos privilégios reais dependem da aplicação no banco de teste.
- [x] Registrar migration versionada e revisar SQL de índices/FKs/CHECKs. A geração automática foi bloqueada pelo shadow database indisponível; `migrate deploy` também retornou P1001.
- [ ] Aplicar somente ao banco de teste e executar testes com PostgreSQL real, inclusive concorrência e constraints.
- [ ] Executar em backend/: npm run prisma:validate; npm run prisma:generate; npm run typecheck.

**Saída:** migration reproduzível sem perda de histórico, dinheiro exato e snapshots protegidos. Auditoria do estado aplicado precede deploy.

## Fase 2 — configuração e adapter do checkout hospedado Asaas

**Criar sob backend/src/modules/payments/:**
- index.ts, payments.module.ts;
- application/payments-client.ts, application/dto/checkout.dto.ts;
- domain/ports/payment-provider.port.ts;
- infrastructure/providers/asaas/asaas-http.client.ts, asaas-checkout.provider.ts, asaas.config.ts;
- __tests__/asaas-http.client.test.ts, asaas-provider.contract.test.ts.
**Modificar:** backend/src/config/env.ts, backend/.env.example.

### Configuração proposta

| Variável | Estado inicial e finalidade |
|---|---|
| ASAAS_API_KEY | Já adicionada pelo usuário; carregar no Zod, validar sem imprimir |
| PAYMENTS_PROVIDER | SIMULATED ou ASAAS; rollout explícito, nunca fallback para simulado por erro |
| ASAAS_ENV | sandbox inicialmente; obrigatória quando provider ASAAS |
| ASAAS_WEBHOOK_AUTH_TOKEN | Novo segredo de webhook, 32–255 caracteres, sem espaços |
| ASAAS_WEBHOOK_URL | URL HTTPS pública do endpoint financeiro; localhost não recebe callbacks externos |
| PAYMENTS_RETURN_BASE_URL | Origem permitida do frontend para callbacks |
| ASAAS_HTTP_TIMEOUT_MS | 10000 para chamadas de controle; timeout de resultado incerto não dispara novo POST |
| teacher_payment_profiles | Snapshot cadastral complementar do professor usado no onboarding da subconta Asaas |

Base da API derivada de ASAAS_ENV para evitar chave/URL incompatíveis. Enviar User-Agent: MeuMonitorAI. A URL de pagamento hospedado é distinta da base da API: usar link validado ou construção por ambiente comprovada na fase 0.

### Contrato do provider

    createHostedCheckout(command: HostedCheckoutCommand): Promise<HostedCheckoutResult>
    resolveCheckoutPayments(checkoutId: string): Promise<ProviderPayment[]>
    getPayment(paymentId: string): Promise<ProviderPayment>
    // Consultas/cancelamento de assinatura entram quando o webhook e o acesso forem implementados.

Definir os tipos do checkout a partir dos contratos capturados em 0: IDs string, centavos integer, porcentagem string decimal, datas ISO e environment obrigatório. O checkout hospedado cria a assinatura recorrente; não criar uma assinatura paralela por `/subscriptions` nesta fase.

- [ ] Testar headers, URL por ambiente, erro 401, 429, timeout e corpo de erro sanitizado com fake HTTP.
- [ ] Implementar retries com backoff apenas para operações comprovadamente seguras. Não fazer retry automático de POST de checkout/subconta.
- [ ] Mapear distinção externa: checkout usa splits; assinatura/cobrança usam split. Manter nomes Asaas fora dos consumidores.
- [ ] Manter API key de subconta fora de domínio/logs; se necessária, guardar referência cifrada e testar indisponibilidade/rotação.
- [ ] Testar fronteira: consumidores só importam payments/index.ts; HTTP futuro não é entrega do MVP.
- [ ] Executar node --import tsx --test src/modules/payments/__tests__/asaas-http.client.test.ts src/modules/payments/__tests__/asaas-provider.contract.test.ts.

**Decisão do MVP:** usar exclusivamente o checkout hospedado do Asaas. A aplicação não coleta dados de cartão nem implementa formulário próprio. O backend cria o checkout recorrente mensal, persiste a `checkoutUrl` e o frontend apenas redireciona o aluno para o Asaas. A assinatura será criada pelo próprio checkout; o adapter mantém somente consultas/cancelamento necessários para reconciliação, sem criar uma assinatura paralela.

**Saída:** adapter do checkout hospedado coberto por fixtures reais sanitizadas; produção rejeita provider simulado; env não gera chamada de criação ao iniciar servidor.

## Fase 3 — webhook durável antes da primeira venda

**Criar sob backend/src/modules/payments/:**
- http/asaas-webhook.controller.ts, http/asaas-webhook.routes.ts;
- application/commands/accept-webhook.use-case.ts, process-webhook.use-case.ts;
- infrastructure/persistence/prisma-webhook.repository.ts, prisma-outbox.repository.ts;
- jobs/payment-webhook.worker.ts, payment-outbox.worker.ts, payment-recovery.job.ts;
- __tests__/webhook-ingress.test.ts, webhook-concurrency.integration.test.ts, payment-outbox.test.ts.
**Modificar:** backend/src/server.ts e backend/src/worker.ts.

Endpoint: POST /api/v1/payments/webhooks/asaas. Sem authMiddleware de usuário; validar token, origem lógica da conta/ambiente e envelope próprio. Ajustar rate limit do plugin para bursts do Asaas sem depender de CORS de navegador.

- [ ] Testar token ausente/incorreto, tamanho inesperado, comparação constante segura e payload com campos extras.
- [ ] Persistir evento com UNIQUE; retornar 200 após commit. Banco indisponível retorna erro e permite retry externo. Evento desconhecido válido vira IGNORED com registro.
- [ ] Claim com lease e compare-and-swap; duplicado CLAIMED não ganha direito de processamento. Worker morto pode ser retomado após lease expirar.
- [ ] Executar mudança financeira, outbox e processedAt na mesma transação. Chamadas HTTP fora da transação; não segurar lock aguardando provider.
- [ ] Recuperar eventos persistidos cuja publicação para Redis falhou; banco é fonte durável, BullMQ transporta execução.
- [ ] Consumidor de outbox é at-least-once e idempotente; crash após enviar e antes de marcar enviado não duplica efeitos.
- [ ] Evento anterior ao vínculo de checkout/assinatura fica WAITING_CORRELATION e é retomado; nunca descartá-lo como pedido inexistente definitivo.
- [ ] Após endpoint disponível, registrar webhooks de checkout, pagamento, assinatura e conta na conta apropriada. Não reconfigurar webhooks remotos em todo boot.
- [ ] Testar processo morto antes/depois do commit, dois workers, reentrega e inbox atrasada.

**Eventos:** CHECKOUT_CREATED/PAID/CANCELED/EXPIRED; PAYMENT_CREATED/CONFIRMED/RECEIVED/OVERDUE/CREDIT_CARD_CAPTURE_REFUSED/REFUNDED/PARTIALLY_REFUNDED, chargeback e split suportados; eventos de assinatura e ACCOUNT_STATUS_* conforme catálogo capturado. Não ativar eventos inventados.

**Saída:** entrega real Sandbox recebida, autenticada, persistida e reprocessável; nenhum acesso liberado por callback.

## Fase 4 — recebimento do professor e bloqueio de publicação

**Criar sob backend/src/modules/payments/:**
- application/commands/start-payment-account.use-case.ts, sync-payment-account.use-case.ts;
- application/queries/get-payment-account.use-case.ts, get-payout-eligibility.use-case.ts;
- http/payment-account.controller.ts, payment-account.routes.ts;
- __tests__/payment-account.test.ts, payout-eligibility.test.ts.
**Modificar backend:** src/services/monitor.service.ts, src/repositories/monitor.repository.ts, src/controllers/monitor.controller.ts, src/models/monitor.model.ts.
**Modificar frontend:** TeacherProfileService.ts, TeacherDashboardOverview.tsx, TeacherOnboardingBanner.tsx, TeacherOnboardingWizardModal.tsx em src/modules/teacher; src/app/(teacher)/professor/page.tsx.
**Criar frontend:** src/modules/teacher/services/TeacherPaymentAccountService.ts; components/TeacherPaymentAccountPanel.tsx; services/__tests__/TeacherPaymentAccountService.test.ts.

Rotas: GET/POST /api/v1/teachers/me/payment-account e GET /api/v1/teachers/me/payment-account/status.

- [ ] Usar onboarding comprovado em 0, com idempotência por professor e reconciliação de criação ambígua.
- [ ] Persistir providerAccountId/wallet e aprovação por evidência real. Conta criada não é conta ativa; callback do navegador não aprova.
- [ ] GET de status normalmente lê projeção; consulta remota é reconciliação controlada com credencial da conta correta.
- [ ] Criação de produto e publicação exigem teacher.status='active' e conta elegível; a dispensa administrativa continua restrita à publicação e deve ser auditada.
- [ ] Validar todos os caminhos que gravam PUBLISHED, inclusive update genérico; impedir mass assignment de preço, taxa, conta e dispensa.
- [ ] Remover mock positivo e fallback fictício do wizard em erro. Mostrar EMAIL_ACTIVATION quando apropriado e estados rejeitado/pendente sem sucesso fictício.
- [ ] Banner não desaparece só porque há produto publicado; pendência de recebimento precisa continuar visível.
- [ ] Exibir aviso ao professor de fallback e não expor credenciais/CPF/documentos a outros usuários.
- [ ] Definir operação administrativa restrita ou rotina SQL auditada para dispensa/percentual. Painel admin completo permanece fora do escopo; role verificada em app_metadata/backend.
- [ ] Testar PF/PJ no fluxo validado, conta pendente, aprovação, regressão, professor tentando editar sua taxa e admin dispensando publicação.

**Saída:** professor conclui o perfil, configura recebimento durante a análise, e só cria produto/publica após perfil ativo e evento de aprovação da conta. Admin consegue dispensar apenas a exigência financeira na publicação, com auditoria.

## Fase 5 — checkout hospedado e preço real

**Criar sob backend/src/modules/payments/:**
- application/commands/create-checkout.use-case.ts;
- application/queries/get-order.use-case.ts;
- domain/services/resolve-payout.ts;
- http/payments.controller.ts, payments.routes.ts;
- __tests__/create-checkout.test.ts, checkout-idempotency.integration.test.ts, resolve-payout.test.ts.
**Modificar:** backend/src/repositories/teacher.repository.ts (DTO público de preço), frontend/src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx, frontend/src/app/(student-app)/checkout/page.tsx.
**Criar:** frontend/src/app/(student-app)/checkout/retorno/page.tsx; frontend/src/modules/student/services/PaymentCheckoutService.ts.

Rotas: POST /api/v1/payments/checkout; GET /api/v1/payments/orders/:orderId. Request HTTP contém monitorId e Idempotency-Key; buyer vem da sessão. Resposta contém orderId, checkoutUrl, amountCents, status e expiresAt. DTO não inclui token de sessão simulada.

- [ ] Validar aluno, monitor publicado, preço atual e vínculo já existente; exatamente um item na UX/API MVP. Carrinho antigo com vários itens pede seleção, sem compra silenciosamente parcial.
- [ ] Capturar preço/percentuais em transação de reserva; criar pedido e idempotência antes de chamar Asaas. Mesma chave/fingerprint retorna o recurso; mesma chave e conteúdo diferente retorna 409.
- [ ] Resolver destinatário com estado verificado: ativo usa percentual contratado e wallet corrente; conta inelegível de monitor publicado usa fallback, preservando percentual contratado no snapshot.
- [ ] Gerar payload específico para checkout, incluindo callback de sucesso/cancelado/expirado na origem configurada:

    {
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      externalReference: orderId,
      minutesToExpire: 60,
      items: [{ name: monitor.name, quantity: 1, value: priceCents / 100 }],
      subscription: { cycle: 'MONTHLY', nextDueDate: firstDueDate },
      callback: callbackUrls,
      splits: teacherEligible ? [{ walletId, percentualValue: contractedPercentage }] : []
    }

- [ ] Testar payload contra fixture de 0; omitir endDate em assinatura sem prazo final se aceito no contrato. Não criar assinatura por /subscriptions além daquela gerada pelo checkout.
- [ ] Associar customer existente quando conhecido; caso novo, capturar identidade pelo fluxo hospedado/evento comprovado, sem inventar CPF nem enviar customer e customerData juntos.
- [ ] Guardar checkout ID antes de expor link; timeout ambíguo vira UNKNOWN_EXTERNAL_RESULT. Não repetir sem split após timeout, pois o primeiro checkout pode existir.
- [ ] Fallback após rejeição inequívoca do recebedor exige reconciliação e tentativa vinculada à mesma intenção, com motivo registrado; não mudar valor do aluno.
- [ ] Vitrine, resumo e checkout usam priceCents do backend. Remover R$29,90 fixo, preço riscado fictício e cálculo autoritativo por localStorage.
- [ ] Redirecionar para Asaas; retorno consulta pedido com ownership e mostra PENDING/PAYMENT_CONFIRMED/ACCESS_READY/FAILED/EXPIRED. Acesso pode demorar até processar outbox; não afirmar liberado antes da projeção.
- [ ] Testar replay concorrente, 5990, 50%, snapshot antigo após mudança para 40%, professor inelegível e retorno falsificado.

**Saída:** checkout hospedado Sandbox do Asaas abre cartão recorrente no valor correto; nossa aplicação não exibe formulário de cartão; refresh/retry não duplica sessão nem confirma compra localmente.

## Fase 6 — cobrança mensal, acesso e cancelamento

**Criar sob backend/src/modules/payments/:**
- application/commands/apply-payment-event.use-case.ts, cancel-subscription.use-case.ts;
- domain/services/service-period.ts;
- __tests__/recurring-payment.test.ts, cancellation.test.ts, service-period.test.ts.
**Criar:** backend/src/modules/student-access/payment-events.handler.ts; __tests__/payment-events.integration.test.ts.
**Modificar:** backend/src/modules/student-access/student-access.repository.ts, student-access.service.ts, student-access.module.ts; backend/src/modules/chat/repositories/prisma-chat-access.repository.ts; backend/src/repositories/student-purchase.repository.ts; frontend/src/app/(student-app)/areadoaluno/planos/page.tsx.

- [ ] Correlacionar pedido/checkout/cobrança/assinatura por IDs comprovados; conferir conta emissora, aluno, moeda, valor e método. Não vincular compra por email/valor sozinho.
- [ ] CHECKOUT_PAID registra jornada e dispara correlação; conceder período apenas quando cobrança vinculada estiver financeiramente CONFIRMED/RECEIVED. PAYMENT_AUTHORIZED/aprovação de risco não bastam.
- [ ] Criar PaymentCharge por providerPaymentId; primeira confirmação ativa vínculo e congela condições. PAYMENT_RECEIVED posterior atualiza liquidação sem somar mês.
- [ ] Dedupe de concessão por chargeId além do eventId: eventos diferentes da mesma cobrança não concedem duas vezes.
- [ ] No handler de outbox, gravar student_access_payment_events e atualizar ambas as projeções em uma transação. Falha entre projeções causa rollback.
- [ ] Checar startsAt/endsAt e currentPeriodEnd nos readers, não só status. Se vínculo Asaas existe, seu estado é autoritativo; linha legada ativa não pode furar suspensão.
- [ ] Auditar consumidores diretos via rg 'studentSubscription|studentEnrollment' backend/src; migrar os que não passam por student-access, incluindo chat, prática, flashcards e simulados conforme resultado.
- [ ] Implementar calendário com âncora, UTC na persistência e limites no fuso do negócio. Casos: 31/janeiro, fevereiro bissexto, evento atrasado e dois ciclos fora de ordem.
- [ ] Recusa da renovação corrente suspende o vínculo. Evento atrasado de tentativa já regularizada não suspende período pago; falha de outro monitor não afeta este.
- [ ] Regularização confirmada reativa uma vez e concilia período/próximo débito conforme prova 0; não usar setMonth(now+1) a cada evento.
- [ ] POST /api/v1/payments/subscriptions/:id/cancel: ownership, idempotência, cancelamento no Asaas e conservação do período pago. Resposta perdida mantém CANCEL_REQUESTED até reconciliar; não afirmar cancelado antes da evidência.
- [ ] Registrar refund/chargeback por cobrança, sem apagar histórico. A política de revogação por estorno/disputa não foi decidida na conversa: registrar ocorrência e encaminhar revisão administrativa, sem equiparar automaticamente disputa a recusa de renovação nem inferir fração de dias para estorno parcial. Fechar essa política antes da ativação em produção.
- [ ] Histórico do aluno combina legado e Asaas por DTO, sem misturar IDs de StudentPurchase e PaymentCharge.

**Teste ilustrativo obrigatório (fixture local):**

    test('confirmed e received concedem um único período', async () => {
      await fixture.deliver('PAYMENT_CONFIRMED', 'evt-1', 'pay-1');
      await fixture.deliver('PAYMENT_RECEIVED', 'evt-2', 'pay-1');
      await fixture.drainOutbox();
      assert.equal(await fixture.countAccessGrants('pay-1'), 1);
    });

**Saída:** primeira compra, renovação, falha, recuperação e cancelamento funcionam sem liberação duplicada ou bypass legado.

## Fase 7 — conta alterada, fallback e reconciliação

**Criar sob backend/src/modules/payments/:**
- application/commands/request-payout-change.use-case.ts, sync-subscription-payout.use-case.ts;
- jobs/payout-sync.worker.ts, reconcile-payments.job.ts;
- __tests__/payout-sync.test.ts, reconciliation.test.ts.
**Modificar:** payment-account routes/painel; integrar notificações do professor pelo mecanismo disponível, sem criar canal externo não solicitado.

- [ ] Aprovar nova revisão de conta e incrementar desiredPayoutVersion. Snapshot de percentual da assinatura permanece intacto.
- [ ] Para suspensão, inelegibilidade ou restauração, enfileirar sincronização de todas as assinaturas afetadas, com operações idempotentes.
- [ ] Atualizar split do template de assinatura; listar cobranças existentes e atualizar individualmente apenas as ainda editáveis/não capturadas.
- [ ] Fallback remove recebedor externo e deixa remanescente na plataforma. Não criar split para wallet da plataforma.
- [ ] Registrar decisão por cobrança com percentual contratado, percentual efetivo, accountRevisionId e motivo. Restaurar conta não gera dívida retroativa.
- [ ] Usar appliedPayoutVersion por assinatura/cobrança. Só mostrar alteração efetivada depois de confirmação das atualizações; até lá informar 'sincronizando'.
- [ ] Testar corrida entre troca, PAYMENT_CREATED e captura. Cobrança capturada/concluída é conciliada com destino efetivo, sem editar histórico para fingir repasse diferente.
- [ ] Reconciliar UNKNOWN_EXTERNAL_RESULT, eventos sem vínculo, outbox atrasada, alteração parcial e falha de fila. Não recriar assinatura para corrigir transporte.
- [ ] Backoff paginado e alertas internos para falha persistente; consulta não altera status do aluno sem evidência financeira.
- [ ] Testar erro explícito de wallet versus timeout geral: somente erro conclusivo permite tentativa de fallback sem risco de duplicação.
- [ ] Ler split liquidado e taxa observada; diferenças de centavos viram reconciliação, não corrupção silenciosa do total.

**Saída:** próxima cobrança editável usa a carteira vigente e percentual antigo; indisponibilidade não duplica cobrança; limitações por captura concorrente ficam evidenciadas.

## Fase 8 — homologação e transição do legado

**Criar:** backend/scripts/test-payments.ts (descoberta explícita de *.test.ts sob payments); frontend/tests/e2e/asaas-checkout.spec.ts; docs/superpowers/reports/asaas-mvp-homologacao.md.
**Modificar:** backend/package.json (script test:payments); backend/src/routes/student-purchase.routes.ts; backend/src/modules/billing/billing.routes.ts; backend/src/modules/billing/billing.module.ts; backend/src/config/env.ts; frontend/src/app/(student-app)/checkout/simulado/page.tsx; backend/docs/DeployV1.md; README.md.

- [ ] PAYMENTS_PROVIDER=ASAAS nunca instancia rota de confirmação simulada ou webhook SIMULATED para conceder acesso. Testar também acesso HTTP direto com aluno autenticado.
- [ ] Provider simulado fica restrito a teste/desenvolvimento explícito; staging Sandbox usa provider Asaas real.
- [ ] Compatibilidade das rotas de histórico e assinatura deve encaminhar vínculos Asaas ao novo módulo. Não deixar cancelamento antigo manipular só projeção local.
- [ ] Não backfill de compra simulada para assinatura real. Classificar dados existentes antes do rollout; manter legados identificados.
- [ ] Monitor publicado antes da migration não ganha dispensa silenciosa: inventariar e aplicar decisão administrativa auditada antes de ativar checkout real.
- [ ] Executar matriz: PF/PJ, conta aprovada/pendente, dispensa, 5990, 50/50, líquido/centavos, alteração 50→40, renovação preservando 50, recusa/regularização, troca carteira, suspensão/restauração.
- [ ] Executar matriz de falhas: evento duplicado/concurrente, received primeiro, process crash, callback sem webhook, 401/429/timeout, split negado, UNKNOWN_EXTERNAL_RESULT e expiração do checkout.
- [ ] Testar acesso real em chat/prática/simulado e cancelamento no último dia do mês. Revisar UI em desktop/mobile.
- [ ] Rodar typecheck frontend/backend; baseline billing; testes payments unitários e PostgreSQL; testes frontend focados com Vitest e E2E configurado.
- [ ] Guardar evidências sanitizadas de Sandbox. Testes com fake HTTP não substituem teste de cartão hospedado, recorrência e split.
- [ ] Verificar imports, ausência de segredos nos logs e diff dos arquivos tocados. Usar git diff --check no repositório acessível; registrar se metadados .git não estiverem disponíveis.

**Saída:** relatório de aceite com evidência por cenário; pendência externa descrita como pendente, nunca como teste aprovado.

## Fase 9 — ativação em produção

- [ ] Confirmar conta emissora PJ habilitada para o fluxo escolhido e professores elegíveis, conforme contrato efetivo.
- [ ] Registrar política de acesso para estorno total, parcial e chargeback; o tratamento financeiro dos eventos não substitui essa decisão de negócio.
- [ ] Criar configuração de produção separada: API key, ambiente, webhook token/URL, callbacks e identidades próprias. Não reutilizar IDs Sandbox.
- [ ] Aplicar migrations revisadas via pipeline existente, após comparação de schema e backup operacional.
- [ ] Ativar worker antes de expor checkout; confirmar inbox/outbox e endpoint HTTPS.
- [ ] Validar uma jornada controlada com autorização para cobrança real e acompanhar confirmação, acesso e repasse.
- [ ] Liberar gradualmente. Em rollback, desativar novos checkouts mantendo webhooks, cancelamentos e reconciliação das assinaturas existentes.
- [ ] Nunca voltar ao provider simulado para lidar com erro de produção.

## 4. Contratos de teste e critérios financeiros comuns

Cada unidade executável deve seguir teste falho → implementação mínima → teste aprovado, usando fake provider e relógio injetado. Constraints, claims e projeções exigem PostgreSQL real.

Casos mínimos:
- 50% professor / 50% plataforma; líquido 9500 → 4750/4750.
- 40%/5%/55% validável no domínio futuro, mas indicador nunca recebe no MVP.
- 0%, 100%, decimal com até 4 casas, soma >100 rejeitada.
- netValue ausente permanece desconhecido; não afirmar saldo disponível.
- Mesmo percentual contratado com carteira nova; mudança atual de Teacher não altera contrato.
- Mesma chave e mesmo corpo recuperam pedido; chave igual com corpo diferente retorna conflito.
- Token de webhook correto não dispensa validar ambiente, conta, valor e associação ao aluno.
- Suspensão em ambas as projeções; acesso não volta por linha antiga ativa.
- Permissões de professor/aluno/admin testadas em leitura e escrita.
- Update direto autorizado de percentual gera auditoria com ator DB quando não há ator de aplicação.

Comandos base existentes:

    # backend/
    npm run prisma:validate
    npm run prisma:generate
    npm run typecheck
    node --import tsx --test src/modules/payments/__tests__/create-checkout.test.ts

    # frontend/
    npm run typecheck
    npm run test:unit -- src/modules/teacher/services/__tests__/TeacherPaymentAccountService.test.ts

Não há npm test geral no backend atual; não usar esse comando como aceite. A fase 8 adiciona test:payments com descoberta explícita, antes de exigir sua execução.

## 5. Primeiro lote de execução

Começar pela fase 0 e pela base da fase 1: comparar schema aplicado, provar contratos Sandbox, registrar entidades e escrever fixtures. A única configuração externa informada como feita é ASAAS_API_KEY; webhook público, token, credenciais de subconta e habilitação da conta ainda precisam ser verificados.

Não implementar um formulário de onboarding presumido nem substituir o checkout real antes de conhecer a correlação dos eventos. Contratos locais, migrations de teste e inbox podem avançar independentemente dessa escolha.

A execução deste documento termina com homologação verificável e ativação separada; esta revisão entregou somente plano/spec, sem criação de recursos no Asaas ou alteração do banco.
