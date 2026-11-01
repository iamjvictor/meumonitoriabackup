# Assinaturas, acesso e repasses Asaas com fonte única e cache Redis

**Status:** especificação para implementação em TDD  
**Data:** 25/09/2026  
**Escopo:** checkout recorrente, webhook Asaas, acesso do aluno, agentes,
questões, flashcards, desafios diários, chat, cancelamento, histórico e painel
do professor.

## 1. Objetivo

Eliminar divergências entre `student_subscriptions`, `student_enrollments`,
`billing_*` e `payment_*`.

O sistema deverá ter:

1. Asaas como autoridade financeira externa;
2. `payment_*` como representação financeira local canônica;
3. um único serviço backend para resolver acesso;
4. um único provider frontend para distribuir o snapshot de acesso na página;
5. Redis como cache do snapshot, invalidado por webhooks e mutações;
6. o mesmo resultado de autorização para agentes, questões, flashcards,
   desafios, chat, desempenho e ranking;
7. um botão de cancelamento por assinatura/monitor, cancelando no Asaas;
8. histórico completo dos movimentos financeiros e de acesso;
9. valores de split exibidos a partir dos valores retornados pelo Asaas.

A fase de cancelamento deve criar o botão, endpoint e integração. O teste
destrutivo de cancelamento de uma assinatura Sandbox existente ficará para
execução manual pelo responsável após a implementação.

## 2. Diagnóstico que motiva a mudança

Foi encontrado um aluno com nove registros locais para o mesmo monitor:

- duas assinaturas Asaas em `ACTIVE`;
- sete tentativas locais em `PENDING`;
- uma matrícula e uma assinatura legada ativas.

Esse estado causa agentes duplicados: cancelar uma assinatura não elimina a
outra. Também foram observados cards com zero questões e zero flashcards,
embora o monitor possua conteúdo aprovado, porque o endpoint atual retorna
apenas o nome e o preço, sem `subjects` e contagens.

O webhook de pagamento confirmou o acesso, mas o payload real da Asaas usa
`payment.split` no singular. O parser antigo aceitava somente `payment.splits`,
impedindo a reconciliação completa do repasse.

## 3. Fonte de verdade

### 3.1 Autoridade externa

O Asaas é a autoridade sobre:

- existência da assinatura;
- status da assinatura;
- valor e ciclo;
- cobrança gerada;
- valor bruto e líquido;
- split configurado;
- split liquidado;
- cancelamento e eventos de divergência.

O banco local registra o último estado confirmado pelo Asaas, o evento de
origem e os horários de sincronização. O banco não deve inventar um pagamento
confirmado nem um split liquidado.

### 3.2 Tabelas canônicas

| Tabela | Responsabilidade |
|---|---|
| `payment_orders` | intenção/pedido e referência externa |
| `payment_order_items` | monitor comprado e snapshots comerciais |
| `payment_subscriptions` | assinatura financeira Asaas |
| `payment_subscription_items` | aluno, monitor, professor e snapshot do item |
| `payment_charges` | cada cobrança e período de serviço |
| `payment_splits` | split esperado e observado pelo Asaas |
| `payment_webhook_events` | inbox idempotente dos eventos |
| `payment_audit_entries` | ações de compra, cancelamento e reconciliação |

`student_subscriptions`, `student_enrollments` e `billing_*` deixam de ser
fontes de autorização. Durante a migração podem ser atualizadas como projeções
de compatibilidade, mas nenhum módulo novo pode consultá-las para decidir
acesso.

## 4. Serviço único de acesso

Criar:

```text
backend/src/modules/access/application/entitlement.service.ts
backend/src/modules/access/infrastructure/redis-entitlement-cache.ts
backend/src/modules/access/infrastructure/payment-entitlement.repository.ts
```

Interface mínima:

```ts
type EntitlementSnapshot = {
  studentId: string;
  generatedAt: string;
  source: 'REDIS' | 'DATABASE';
  monitors: Array<{
    monitorId: string;
    name: string;
    teacherId: string;
    teacherName: string;
    subjects: Array<{ id: string; name: string; topics: Array<{ id: string; name: string }> }>;
    approvedQuestionCount: number;
    approvedFlashcardCount: number;
    subscription: {
      paymentSubscriptionId: string;
      providerSubscriptionId: string | null;
      status: 'ACTIVE' | 'CANCEL_PENDING';
      purchasedAt: string;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      cancelRequestedAt: string | null;
      accessEndsAt: string | null;
    };
    permissions: {
      agent: boolean;
      questions: boolean;
      flashcards: boolean;
      dailyChallenges: boolean;
      chat: boolean;
      performance: boolean;
      ranking: boolean;
    };
  }>;
};
```

Métodos obrigatórios:

```ts
getSnapshot(studentId: string): Promise<EntitlementSnapshot>;
getAccessibleMonitorIds(studentId: string): Promise<string[]>;
hasMonitorAccess(studentId: string, monitorId: string): Promise<boolean>;
invalidate(studentId: string, reason: string): Promise<void>;
```

### 4.1 Regra de acesso

Um item é acessível quando:

```text
payment_subscription.status IN ('ACTIVE', 'CANCEL_PENDING')
payment_subscription_item.status IN ('ACTIVE', 'CANCEL_PENDING')
agora <= accessEndsAt
```

`accessEndsAt` será:

1. `currentPeriodEnd` para assinatura ativa;
2. `currentPeriodEnd` quando o cancelamento estiver agendado;
3. nulo somente para uma assinatura ativa sem período conhecido, situação que
   deverá gerar alerta operacional, não acesso silencioso indefinido.

Assinaturas `PENDING`, `FAILED`, `CANCELLED`, `EXPIRED` ou sem cobrança
confirmada não liberam acesso.

### 4.2 Duplicidade

O serviço deverá agrupar por `monitorId` e escolher somente uma assinatura
canônica, mas duplicidades financeiras não podem ser escondidas:

- se houver mais de uma assinatura Asaas `ACTIVE`, o snapshot deverá marcar
  `DUPLICATE_PROVIDER_SUBSCRIPTION`;
- a UI deverá mostrar um alerta operacional;
- o sistema não deve cancelar automaticamente nenhuma delas;
- a reconciliação deve consultar os IDs no Asaas e exigir decisão explícita.

Deve ser criada uma proteção para impedir novo checkout quando já houver item
ativo ou cancelamento pendente para o mesmo aluno e monitor.

## 5. Cache Redis

### 5.1 Chave e conteúdo

```text
entitlement:v1:{environment}:{studentId}
```

O valor será o `EntitlementSnapshot` serializado em JSON. Não armazenar tokens,
senhas, API keys ou dados de cartão.

TTL inicial: 60 segundos. O TTL é proteção contra dados antigos, não o
mecanismo primário de consistência.

### 5.2 Leitura

1. `EntitlementService.getSnapshot` consulta Redis;
2. se encontrar snapshot válido, retorna `source = REDIS`;
3. se não encontrar, consulta `payment_*` em uma única operação agregada;
4. grava o snapshot no Redis com TTL;
5. retorna `source = DATABASE`.

Falha do Redis não pode bloquear o acesso: o serviço consulta o banco e registra
`access.redis_fallback`.

### 5.3 Invalidação

Invalidar imediatamente após:

- `PAYMENT_CONFIRMED`;
- `PAYMENT_RECEIVED`;
- `PAYMENT_OVERDUE`;
- `PAYMENT_REFUNDED`;
- `PAYMENT_CHARGEBACK_REQUESTED`;
- `PAYMENT_SPLIT_DONE`;
- `SUBSCRIPTION_CREATED`;
- `SUBSCRIPTION_UPDATED`;
- `SUBSCRIPTION_INACTIVATED`;
- `SUBSCRIPTION_DELETED`;
- `SUBSCRIPTION_SPLIT_DISABLED`;
- `SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK`;
- `SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED`;
- cancelamento solicitado pelo aluno;
- reconciliação administrativa.

O webhook deve persistir a transação antes de invalidar. Se a invalidação
falhar, publicar uma tarefa de invalidação e permitir que o TTL faça o fallback.

## 6. Provider da página

Criar um provider único:

```text
frontend/src/modules/student/context/EntitlementProvider.tsx
```

Ele consumirá somente:

```text
GET /api/v1/student/access
```

O provider expõe:

```ts
useEntitlements().monitors
useEntitlements().hasAccess(monitorId)
useEntitlements().refresh()
useEntitlements().isLoading
```

Nenhuma página poderá consultar diretamente `/student/subscriptions`,
`student-payment-history`, `student-enrollments` ou endpoints legados para
montar acesso.

O provider deverá:

- deduplicar por `monitorId` como proteção adicional de UI;
- exibir `approvedQuestionCount` e `approvedFlashcardCount` reais;
- fornecer `subjects` e `topics` ao chat e à prática;
- atualizar o snapshot após retorno do checkout;
- atualizar o snapshot após cancelamento;
- limpar o snapshot no logout e na troca de aluno.

## 7. Histórico de transações

Endpoint canônico:

```text
GET /api/v1/student/payment-history
```

O histórico deve ser construído somente de `payment_*` e auditorias financeiras
e conter:

```text
paymentOrderId
paymentSubscriptionId
providerSubscriptionId
providerPaymentId
monitorId
monitorName
createdAt
confirmedAt
servicePeriodStart
servicePeriodEnd
grossCents
netCents
feeCents
splitExpectedCents
splitSettledCents
splitStatus
status
cancelRequestedAt
accessEndsAt
```

Uma linha de compra deve mostrar quando foi assinada. Uma linha de cancelamento
deve mostrar quando foi solicitado e até quando o acesso continua disponível.

Tentativas `PENDING` sem cobrança confirmada não devem aparecer como compra
efetiva, mas podem aparecer em uma seção técnica de tentativas expiradas.

## 8. Webhook Asaas

O ingress deve aceitar o formato real de split:

```json
"payment": {
  "split": [
    {
      "id": "...",
      "walletId": "...",
      "percentualValue": 50,
      "totalValue": 14.41,
      "status": "AWAITING_CREDIT"
    }
  ]
}
```

Também aceitar `splits` por compatibilidade, sem duplicar registros.

O valor efetivo do professor deve vir de `payment.split[].totalValue`, e não de
um cálculo local sobre o valor bruto. O percentual enviado pode ser usado como
snapshot de contrato, mas o valor exibido como real deve ser o retornado pelo
Asaas.

Estados locais do split:

| Asaas | Local |
|---|---|
| `AWAITING_CREDIT` | `PENDING` |
| `DONE` | `SETTLED` |
| `REFUSED` | `REFUSED` |
| `CANCELLED` | `CANCELLED` |
| `REFUNDED` | `REFUNDED` |

O evento `PAYMENT_SPLIT_DONE` deve atualizar `settledCents` e invalidar o cache
do professor e do aluno relacionado. O Asaas envia eventos de webhook pelo
modelo at-least-once; o `event.id` deve ser a chave de idempotência. [Eventos de
assinatura](https://docs.asaas.com/docs/eventos-para-assinaturas)

## 9. Cancelamento por assinatura

### 9.1 UI

Cada item do snapshot deve apresentar seu próprio botão:

```text
Cancelar assinatura
```

O botão deve enviar:

```text
DELETE /api/v1/student/subscriptions/:subscriptionId/items/:monitorId
Idempotency-Key: UUID
```

Após sucesso:

- marcar o item como `CANCEL_PENDING` no snapshot;
- exibir a data `accessEndsAt`;
- informar que não haverá nova cobrança;
- manter o agente disponível até essa data;
- registrar a ação no histórico;
- invalidar o cache Redis;
- não cancelar outras assinaturas ou outros monitores.

### 9.2 Integração Asaas

Antes de alterar o banco local:

- se for o último item, cancelar a assinatura Asaas pelo
  `providerSubscriptionId`;
- se existirem outros itens, atualizar a assinatura Asaas com o novo valor e
  preservar os demais itens;
- só marcar localmente `CANCEL_PENDING` depois da resposta bem-sucedida do
  Asaas;
- se o Asaas falhar, manter o item ativo e registrar falha para retry.

O webhook posterior é a confirmação final do estado externo. A API Asaas é a
autoridade para a existência e o cancelamento da recorrência; o estado local é
uma projeção sincronizada.

### 9.3 Limite desta fase

Implementar o botão, endpoint, idempotência, atualização do provider e testes
com mocks/contratos.

Não executar automaticamente o cancelamento de uma assinatura real Sandbox
durante a implementação. O teste manual será feito depois pelo responsável,
com uma assinatura escolhida conscientemente.

## 10. Autorização dos módulos

| Módulo | Regra obrigatória |
|---|---|
| Agentes | `snapshot.monitors` |
| Questões | `hasMonitorAccess` + status `APPROVED` da questão |
| Flashcards | `hasMonitorAccess` + status `APPROVED` do flashcard |
| Desafios | `hasMonitorAccess` + desafio do monitor |
| Chat | `hasMonitorAccess` + subject pertencente ao monitor |
| Prática | `getAccessibleMonitorIds` |
| Desempenho | `getAccessibleMonitorIds` |
| Ranking | `getAccessibleMonitorIds` |
| Histórico | `payment_*`, nunca estado de acesso legado |
| Painel professor | `payment_subscription_items` do professor + `payment_splits` |

Professores continuam podendo usar preview dos próprios monitores por uma regra
de role separada. Essa exceção não deve ser confundida com acesso de aluno.

## 11. Plano de implementação TDD

### Fase 1 — Contratos e modelo

Testes primeiro:

- snapshot de acesso exclui `PENDING`;
- snapshot inclui `CANCEL_PENDING` até `accessEndsAt`;
- snapshot expira após `accessEndsAt`;
- aluno só consulta seus próprios itens;
- duplicidade por monitor é reportada;
- split singular e plural são aceitos.

### Fase 2 — Repositório canônico

Implementar a consulta agregada em `payment_*`, incluindo:

- monitor e professor;
- subjects/topics;
- contagens aprovadas;
- última cobrança;
- split retornado pelo Asaas;
- datas de compra, período e cancelamento.

Testar com fixtures que contenham duas assinaturas ativas, pendentes e
canceladas.

### Fase 3 — Serviço e Redis

Testar:

- cache hit não consulta banco;
- cache miss consulta banco e grava Redis;
- Redis indisponível faz fallback ao banco;
- invalidação remove a chave correta;
- aluno A nunca lê cache do aluno B;
- ambiente Sandbox nunca reutiliza chave Production.

### Fase 4 — Endpoint e provider frontend

Testar:

- `GET /student/access` retorna payload completo;
- frontend mostra uma única carta por monitor;
- questões e flashcards exibem contagens reais;
- subjects chegam ao chat;
- troca de aluno limpa o snapshot;
- retorno do checkout executa `refresh()`.

### Fase 5 — Webhooks e histórico

Testar:

- `PAYMENT_CONFIRMED` ativa item e invalida Redis;
- `PAYMENT_RECEIVED` atualiza cobrança;
- `PAYMENT_SPLIT_DONE` atualiza `settledCents`;
- `SUBSCRIPTION_UPDATED` atualiza ciclo;
- `SUBSCRIPTION_DELETED` encerra acesso no fim do período;
- eventos duplicados não duplicam cobrança, split ou histórico;
- `payment.split` é persistido com valor efetivo do Asaas;
- histórico mostra compra, confirmação, split e cancelamento.

### Fase 6 — Cancelamento

Implementar e testar com provider Asaas mockado:

- cada assinatura exibe botão próprio;
- cancelamento envia `providerSubscriptionId` correto;
- cancelamento de um monitor não afeta outro;
- assinatura com último item chama DELETE no Asaas;
- assinatura com itens restantes chama UPDATE no Asaas;
- falha do Asaas não altera o acesso local;
- repetição com a mesma `Idempotency-Key` não duplica operação;
- webhook posterior confirma o estado;
- cache é invalidado;
- histórico registra `cancelRequestedAt` e `accessEndsAt`.

O teste manual real no Sandbox será executado somente após essa fase, pelo
responsável, usando o botão na interface.

### Fase 7 — Migração e limpeza

Antes de remover compatibilidade:

1. detectar assinaturas Asaas duplicadas;
2. listar cada `providerSubscriptionId` e seu status real no Asaas;
3. escolher a assinatura canônica por aluno/monitor;
4. cancelar duplicatas diretamente no Asaas, com confirmação manual;
5. aguardar webhooks;
6. reconciliar `payment_*`;
7. reconstruir snapshots Redis;
8. deixar os módulos legados somente como projeção;
9. adicionar alertas para qualquer leitura de acesso fora do
   `EntitlementService`.

## 12. Critérios de aceite

O trabalho será considerado pronto quando:

- um aluno com uma assinatura vê exatamente um agente;
- o card mostra matérias, questões e flashcards reais;
- chat, prática, desafios e ranking usam o mesmo conjunto de monitor IDs;
- duas assinaturas Asaas ativas são detectadas e não escondidas;
- uma tentativa `PENDING` não libera acesso;
- cancelamento agendado mantém acesso até a data final;
- após a data final, todos os módulos bloqueiam o monitor;
- histórico mostra compra, split, cancelamento e período de acesso;
- painel do professor mostra o split efetivo retornado pela Asaas;
- Redis reduz consultas repetidas sem permitir estado indefinido;
- webhooks invalidam e regeneram o snapshot;
- testes TDD cobrem sucesso, duplicidade, falha do Asaas, expiração e retry;
- o teste manual do botão de cancelamento fica pendente de execução humana,
  conforme definido na Fase 6.

## 13. Observabilidade

Eventos mínimos:

```text
access.snapshot_cache_hit
access.snapshot_cache_miss
access.snapshot_database_loaded
access.snapshot_invalidated
access.authorization_denied
payments.subscription_duplicate_detected
payments.split_observed_from_provider
payments.split_settled_from_provider
payments.cancel_requested
payments.cancel_provider_completed
payments.cancel_provider_failed
```

Os logs devem conter IDs técnicos mascarados quando necessário, ambiente,
aluno, monitor, assinatura local, assinatura Asaas e motivo. Nunca registrar
API key, token de webhook, token de sessão ou dados completos de cartão.
