# Fonte única de verdade para pagamentos, assinaturas e repasses Asaas

**Status:** proposta para revisão antes da implementação  
**Data:** 24/09/2026  
**Escopo:** checkout recorrente Asaas, cancelamento, webhook, acesso do aluno,
painel do professor e repasses.

## 1. Objetivo

Antes do deploy, o sistema precisa garantir que o estado exibido para aluno,
professor e administração seja derivado da mesma assinatura que existe no
Asaas.

O fluxo final deve permitir:

1. aprovar uma assinatura no Asaas e liberar o monitor correto;
2. cancelar apenas o monitor/assinatura do aluno autenticado;
3. impedir novas cobranças no Asaas após o cancelamento;
4. manter o acesso até o fim do período pago;
5. refletir cancelamentos originados no painel do Asaas via webhook;
6. mostrar ao professor seus alunos ativos e as assinaturas dos seus monitores;
7. mostrar o valor estimado e o valor efetivamente recebido pelo professor;
8. direcionar o professor para sua conta de recebimento Asaas;
9. impedir que uma operação de um aluno altere outro aluno.

## 2. Diagnóstico atual

O banco possui três modelos em paralelo:

- `student_subscriptions` e `student_enrollments`: acessos legados;
- `billing_subscriptions` e `billing_subscription_items`: novo billing, sem
  registros no banco analisado;
- `payment_subscriptions`, `payment_subscription_items`, `payment_charges` e
  `payment_splits`: ponte financeira Asaas.

No banco analisado em 24/09/2026:

- `billing_subscriptions`: 0;
- `billing_subscription_items`: 0;
- `billing_subscription_changes`: 0;
- `student_subscriptions`: 5, todos `active`;
- `student_enrollments`: 5, todos `ACTIVE`.

O painel do professor mostra ativos porque lê `student_enrollments`. A área do
aluno pode mostrar zero porque a rota nova lê `billing_subscriptions`. Essa
divergência não é aceitável após a migração.

## 3. Decisão arquitetural

### 3.1 Fonte de verdade

O Asaas é a autoridade externa sobre a existência, situação e liquidação da
assinatura. O banco local não deve inventar um estado financeiro diferente do
Asaas: deve registrar o último estado confirmado, sua origem, seu evento e o
horário de sincronização.

Dentro da aplicação, haverá uma única representação financeira local:
`payment_*`. As demais tabelas serão projeções ou compatibilidade temporária.

`payment_subscriptions` será a fonte de verdade financeira da assinatura Asaas.

`payment_subscription_items` será a fonte de verdade financeira por monitor,
aluno e professor.

`payment_charges` será a fonte de verdade de cada cobrança e de seu período.

`payment_splits` será a fonte de verdade dos valores destinados ao professor,
plataforma e eventual indicador.

`student_subscriptions` e `student_enrollments` continuarão existindo como
projeções de acesso, mas nunca serão usados para decidir se uma nova cobrança
deve ser criada ou cancelada.

`billing_subscriptions` e `billing_subscription_items` não participarão do
fluxo final. Seus dados existentes, se houver no futuro, deverão ser migrados
ou explicitamente descontinuados, evitando uma quarta fonte de estado.

### 3.2 Regra de identidade

Toda assinatura deve ser identificada por:

```text
environment + providerSubscriptionId
```

O `environment` é obrigatório para separar Sandbox e Production. O
`providerSubscriptionId` nunca pode ser reutilizado por dois alunos no mesmo
ambiente.

Toda operação iniciada pelo aluno deve validar simultaneamente:

```text
authenticatedStudentId == paymentSubscription.studentId
monitorId pertence a paymentSubscriptionItem
paymentSubscription.environment == ambiente configurado
```

## 4. Modelo de estados

### 4.1 Assinatura financeira

| Estado | Significado |
|---|---|
| `PENDING` | Pedido criado, ainda sem pagamento confirmado |
| `ACTIVE` | Recorrência ativa no Asaas |
| `CANCEL_PENDING` | Cancelamento solicitado; acesso permanece até o fim do período |
| `CANCELLED` | Recorrência encerrada e estado confirmado |
| `EXPIRED` | Período terminou sem renovação |
| `FAILED` | Falha de criação, correlação ou processamento |

### 4.2 Item do monitor

| Estado | Acesso |
|---|---|
| `PENDING` | Não liberar |
| `ACTIVE` | Liberar |
| `CANCEL_PENDING` | Liberar até `servicePeriodEnd` |
| `CANCELLED` | Não liberar após o fim do período |
| `REFUNDED` | Aplicar regra de acesso definida pelo evento |

### 4.3 Projeções de acesso

Ao receber confirmação válida:

```text
student_subscriptions.status = active
student_enrollments.status = ACTIVE
```

Ao cancelar no fim do período:

```text
student_subscriptions.status = active
student_subscriptions.cancel_at_period_end = true
student_subscriptions.current_period_end = servicePeriodEnd
student_enrollments.status = ACTIVE
student_enrollments.ends_at = servicePeriodEnd
```

Após o fim do período ou confirmação de encerramento:

```text
student_subscriptions.status = cancelled
student_subscriptions.cancelled_at = now
student_enrollments.status = CANCELLED
```

## 5. Fluxo de criação e aprovação

### 5.1 Criação do checkout

Endpoint canônico proposto, após a consolidação das rotas atuais:

```text
POST /api/v1/student/payments/checkout
```

O backend deve:

1. identificar o aluno autenticado;
2. validar o monitor publicado;
3. rejeitar assinatura ativa duplicada para o mesmo aluno/monitor;
4. obter preço, professor, percentual e conta Asaas atual;
5. criar `payment_orders` e `payment_order_items`;
6. criar `payment_subscriptions` como `PENDING`;
7. criar `payment_subscription_items` como `PENDING`;
8. salvar snapshots imutáveis de preço e percentuais;
9. criar checkout recorrente no Asaas;
10. enviar split somente para carteiras elegíveis;
11. persistir `providerCheckoutId` e referência externa;
12. retornar a URL do checkout.

O preço e os percentuais usados depois não devem ser recalculados a partir do
perfil atual do professor. Devem vir dos snapshots do item.

### 5.2 Aprovação via webhook

Endpoint:

```text
POST /api/v1/payments/webhooks/asaas
```

Eventos financeiros prioritários:

- `PAYMENT_CONFIRMED`;
- `PAYMENT_RECEIVED`.

O processamento deve ser idempotente pelo `eventId` do Asaas e executar uma
transação que:

1. salva/reivindica `payment_webhook_events`;
2. correlaciona `externalReference`, checkout ou assinatura;
3. cria/atualiza `payment_charges`;
4. marca `payment_subscriptions.status = ACTIVE`;
5. marca `payment_subscription_items.status = ACTIVE`;
6. persiste `providerSubscriptionId`;
7. atualiza período e próxima cobrança;
8. cria/atualiza `payment_splits` com valor esperado;
9. atualiza projeções de acesso;
10. marca o pedido como `PAYMENT_CONFIRMED`;
11. registra auditoria;
12. marca o evento como processado.

Nenhum acesso deve ser liberado se a correlação não identificar exatamente o
aluno, pedido, assinatura e monitor.

## 6. Cancelamento

### 6.1 Cancelamento iniciado pelo aluno

Endpoint canônico proposto para o fluxo final:

```text
DELETE /api/v1/student/subscriptions/:subscriptionId/items/:monitorId
```

Regras:

1. autenticar o aluno;
2. carregar `payment_subscriptions` pelo ID interno e `studentId`;
3. validar que o item pertence à assinatura;
4. validar que o item está ativo;
5. obter `servicePeriodEnd` do período financeiro atual;
6. se a assinatura tiver outros itens ativos, atualizar o valor futuro no Asaas;
7. se for o último item, excluir a recorrência no Asaas;
8. nunca enviar `value = 0` para o Asaas;
9. marcar o item como `CANCEL_PENDING`;
10. marcar a assinatura como `CANCEL_PENDING` quando não houver outros itens;
11. atualizar `student_enrollments.ends_at` sem cortar o acesso imediatamente;
12. registrar a operação com chave de idempotência;
13. retornar `endsAt` para a interface.

Para o último item, a chamada ao Asaas deve ser:

```text
DELETE /v3/subscriptions/{providerSubscriptionId}
```

Para itens restantes, a chamada deve reduzir o valor futuro da recorrência sem
alterar cobranças já pagas.

### 6.2 Cancelamento originado no Asaas

O sistema deve tratar pelo menos:

- `SUBSCRIPTION_DELETED`;
- `SUBSCRIPTION_UPDATED`;
- `PAYMENT_OVERDUE`;
- `PAYMENT_REFUNDED`;
- `PAYMENT_PARTIALLY_REFUNDED`;
- `PAYMENT_CHARGEBACK_REQUESTED`.

`SUBSCRIPTION_DELETED` não pode ficar somente em
`WAITING_CORRELATION`. O handler deve:

1. localizar `payment_subscriptions` por `environment + providerSubscriptionId`;
2. marcar assinatura e itens conforme o período pago;
3. atualizar as projeções de acesso;
4. registrar auditoria e motivo;
5. ser idempotente;
6. não alterar alunos com outro `providerSubscriptionId`.

## 7. Painel do aluno

O endpoint de assinaturas do aluno deve consultar exclusivamente:

```text
payment_subscriptions
payment_subscription_items
payment_charges
```

A resposta deve informar monitor, status financeiro, status de acesso, valor
cobrado, próxima cobrança, período atual, data de encerramento agendada,
histórico de pagamentos e histórico de cancelamento.

Durante a migração, os cinco registros existentes em `student_subscriptions`
devem ser backfillados para `payment_*` antes de retirar o fallback legado.

## 8. Painel do professor

### 8.1 Listagem de alunos ativos

O painel deve consultar `payment_subscription_items` juntando aluno, monitor,
professor, `payment_subscriptions`, `payment_charges` e `payment_splits`.

Filtro obrigatório:

```text
payment_subscription_items.status = ACTIVE
payment_subscriptions.status = ACTIVE
teacher_id = professor autenticado
```

Itens `CANCEL_PENDING` devem aparecer em seção separada ou com indicação clara
de “Acesso até [data]”. Não devem ser contados como novas assinaturas ativas
após o término do período.

### 8.2 Valores do professor

O painel deve diferenciar:

1. **Valor bruto da assinatura**: preço pago pelo aluno;
2. **Valor estimado do repasse**: percentual snapshot aplicado ao valor elegível;
3. **Valor efetivamente recebido**: `payment_splits.settledCents` confirmado.

Regra do estimado:

```text
estimatedTeacherCents =
  round(grossCents * teacherPercentageSnapshot / 100)
```

O valor real nunca deve ser apresentado como recebido se estiver apenas em
`expectedCents` ou com split pendente.

O endpoint deve retornar por aluno/monitor: `grossCents`,
`teacherPercentageSnapshot`, `expectedTeacherCents`, `settledTeacherCents`,
`splitStatus`, `chargeStatus`, `servicePeriodStart` e `servicePeriodEnd`.

### 8.3 Conta de recebimento Asaas

O professor deve ver status da conta, status geral de aprovação, carteira
(`walletId`) mascarada, motivo de rejeição e link para onboarding/conta Asaas.

Botão obrigatório:

```text
Acessar minha conta de recebimento Asaas
```

Se `onboardingUrl` existir, abrir esse endereço; caso contrário, abrir
`/professor/conta` para configurar/corrigir. Nunca exibir API key ou dados
sensíveis.

### 8.4 Elegibilidade para repasse

Uma venda pode receber split do professor somente quando:

```text
paymentAccount.status == APPROVED
ou paymentAccount.generalStatus == APPROVED
walletId != null
teacherPercentageSnapshot > 0
```

Se a conta não for elegível, o checkout deve ser criado sem split, o pedido
deve registrar `payoutMode = PLATFORM_FALLBACK`, o painel deve informar que o
repasse não foi direcionado e não deve prometer valor recebido.

## 9. Correção necessária no repasse

O checkout Asaas já possui suporte a `splits` e captura o percentual do
professor no snapshot. A implementação precisa ser validada contra o fluxo real
porque:

1. o checkout atual é criado por um módulo financeiro diferente do módulo
   `billing_*`;
2. o webhook de pagamento precisa persistir o split efetivo;
3. o painel precisa ler `payment_splits`, não apenas o percentual configurado;
4. o percentual de indicação está salvo como snapshot e só deve entrar em split
   se essa regra estiver oficialmente habilitada;
5. alterações futuras no percentual não podem alterar vendas antigas.

Critério: uma venda aprovada deve permitir reconciliar valor bruto, taxas, split
esperado, split liquidado e valor da plataforma.

## 10. API proposta

### Aluno

```text
GET    /api/v1/student/subscriptions
GET    /api/v1/student/subscriptions/:subscriptionId
DELETE /api/v1/student/subscriptions/:subscriptionId/items/:monitorId
GET    /api/v1/student/subscriptions/history
```

### Professor

```text
GET /api/v1/teachers/me/students/subscriptions
GET /api/v1/teachers/me/payouts/summary
GET /api/v1/teachers/me/payment-account
POST /api/v1/teachers/me/payment-account
```

`/teachers/me/students/subscriptions` deve retornar somente alunos/monitores do
professor autenticado.

`/teachers/me/payouts/summary` deve retornar totais separados por estimado,
recebido, pendente, falho e período de serviço.

## 11. Testes obrigatórios

### Unitários

- cálculo de split com arredondamento em centavos;
- conta aprovada gera split;
- conta pendente gera fallback sem split;
- cancelamento do último item chama somente `DELETE` no Asaas;
- remoção de item não cancela outros itens;
- idempotência não repete cancelamento;
- webhook duplicado não duplica cobrança nem acesso;
- `SUBSCRIPTION_DELETED` atualiza estado local;
- aluno A não consegue cancelar assinatura do aluno B;
- professor A não visualiza assinaturas do professor B.

### Integração backend

- checkout Sandbox cria assinatura recorrente;
- webhook `PAYMENT_CONFIRMED` libera acesso;
- webhook `PAYMENT_RECEIVED` atualiza cobrança;
- webhook `SUBSCRIPTION_DELETED` encerra a recorrência local;
- chamada de cancelamento retorna `endsAt`;
- split enviado ao Asaas corresponde ao snapshot;
- `payment_splits` reconcilia com o valor do Asaas.

### E2E antes do deploy

1. aluno A assina monitor do professor X;
2. confirmar pagamento no Sandbox;
3. verificar assinatura ativa no Asaas;
4. verificar acesso do aluno;
5. verificar aluno e valor estimado no painel do professor X;
6. verificar split na cobrança;
7. cancelar pelo aluno;
8. confirmar cancelamento no Asaas;
9. verificar acesso até a data final;
10. verificar que não há nova cobrança;
11. verificar evento `SUBSCRIPTION_DELETED` e estado local;
12. repetir com outro aluno e confirmar isolamento.

## 12. Critérios de aceite para deploy

O deploy só pode ser aprovado quando:

- nenhuma tela usa `billing_*` como fonte concorrente do `payment_*`;
- os registros legados foram migrados ou explicitamente projetados;
- o cancelamento foi confirmado no Asaas Sandbox;
- o webhook de cancelamento atualiza o banco local;
- os testes unitários, integração e E2E passam;
- o painel do professor mostra somente seus alunos;
- o valor exibido diferencia estimado de recebido;
- os splits são auditáveis por cobrança;
- o link da conta Asaas funciona;
- Sandbox e Production estão separados por variável de ambiente;
- não há segredo de Asaas no frontend ou em logs.

## 13. Ordem recomendada de implementação

1. congelar a criação de novos registros em `billing_*`;
2. criar backfill idempotente de `student_*` para `payment_*`;
3. validar contagens e reconciliação antes/depois do backfill;
4. apontar listagens de aluno e professor para `payment_*`;
5. implementar cancelamento canônico no `payment_*`;
6. implementar aplicação de `SUBSCRIPTION_DELETED`;
7. completar persistência e consulta de `payment_splits`;
8. adicionar painel de repasses e link da conta Asaas;
9. executar testes Sandbox completos;
10. remover dependências de leitura do legado após observação.

## 14. Arquivos atuais relevantes

- `backend/prisma/schema.prisma`
- `backend/src/modules/payments/infrastructure/persistence/payment-checkout.repository.ts`
- `backend/src/modules/payments/application/commands/create-checkout.use-case.ts`
- `backend/src/modules/payments/infrastructure/providers/asaas/asaas-checkout.provider.ts`
- `backend/src/modules/payments/infrastructure/persistence/payment-event.repository.ts`
- `backend/src/modules/payments/application/commands/process-webhook.use-case.ts`
- `backend/src/modules/payments/infrastructure/persistence/payment-account.repository.ts`
- `backend/src/modules/billing/services/subscription.service.ts`
- `backend/src/modules/billing/providers/asaas-payment.provider.ts`
- `backend/src/repositories/teacher.repository.ts`
- `backend/src/repositories/teacher-student.mapper.ts`
- `frontend/src/modules/teacher/components/TeacherDashboardOverview.tsx`
- `frontend/src/modules/teacher/components/TeacherPaymentAccountPanel.tsx`
- `docs/asaas/reference/PAGAMENTOS-E-ASSINATURAS.md`
