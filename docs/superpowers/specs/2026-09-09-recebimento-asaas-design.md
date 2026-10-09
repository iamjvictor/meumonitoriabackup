# Spec — Recebimento e Pagamentos com Asaas

## Objetivo

Definir o módulo de pagamentos do MeuMonitor AI como uma fronteira autocontida, inicialmente executada dentro do backend atual como um modular monolith e preparada para futura extração para um serviço independente `payment-service`.

O módulo será responsável por checkout, cobranças, recebimento, split, estornos, chargebacks, reconciliação, idempotência, ledger, webhooks e publicação de eventos financeiros. O acesso, a assinatura e a experiência do aluno consumirão contratos públicos do módulo e não alterarão suas tabelas diretamente.

## Decisões

### Provider

O provider externo será o Asaas. A integração ficará atrás de `PaymentProvider`, para que os casos de uso não dependam do SDK, dos nomes de endpoints ou dos payloads do Asaas.

O ambiente deve ser selecionável por configuração:

- Sandbox: `https://api-sandbox.asaas.com/v3`.
- Produção: `https://api.asaas.com/v3`.

A API key principal fica somente no backend e em secret de ambiente. O frontend nunca recebe credenciais do Asaas.

### Modelo de recebimento

O MeuMonitor AI será a conta emissora das cobranças. Professores que participam do recebimento terão contas/subcontas Asaas associadas a um `walletId`. O split será enviado na criação da cobrança e será liquidado pelo Asaas quando a cobrança for recebida.

O modelo depende de validação comercial, regulatória e contratual com o Asaas. A documentação atual informa que a criação de subcontas via API exige conta-pai PJ/CNPJ e que o `walletId` deve ser obtido para cada conta recebedora. Se o contrato não autorizar esse modelo para professores PF, a implementação deve bloquear a criação de contas incompatíveis, sem simular aprovação local.

O módulo não tratará `walletId` como equivalente a um recebedor Pagar.me. Também não haverá dependência de KYC hospedado do Pagar.me. O fluxo de onboarding deve refletir os estados e URLs efetivamente retornados pelo Asaas e pelo contrato adotado.

### Fronteira pública

O diretório público será:

```text
backend/src/modules/payments/index.ts
```

Outros módulos podem importar apenas a API pública de `payments`. Imports para controllers, repositories, providers, services ou migrations internas são proibidos.

O contrato público deve permitir duas implementações equivalentes:

```text
LocalPaymentsClient  -> chama casos de uso no mesmo processo
HttpPaymentsClient    -> chama payment-service após a extração
```

Nenhum consumidor deve precisar saber qual implementação está ativa.

## Estrutura do módulo

```text
backend/src/modules/payments/
├── index.ts
├── domain/
│   ├── entities/
│   │   ├── payment.entity.ts
│   │   ├── invoice.entity.ts
│   │   └── split.entity.ts
│   ├── value-objects/
│   │   ├── money.ts
│   │   └── payment-status.ts
│   ├── events/
│   │   ├── payment-confirmed.event.ts
│   │   ├── payment-received.event.ts
│   │   ├── payment-failed.event.ts
│   │   ├── payment-refunded.event.ts
│   │   └── payment-chargeback.event.ts
│   └── ports/
│       ├── payment-provider.port.ts
│       ├── payment-repository.port.ts
│       ├── payment-account-repository.port.ts
│       └── event-publisher.port.ts
├── application/
│   ├── commands/
│   │   ├── create-checkout.use-case.ts
│   │   ├── create-payment-account.use-case.ts
│   │   ├── process-webhook.use-case.ts
│   │   └── refund-payment.use-case.ts
│   ├── queries/
│   │   ├── get-payment.use-case.ts
│   │   ├── get-payment-account.use-case.ts
│   │   └── list-user-payments.use-case.ts
│   └── dto/
│       ├── create-checkout.dto.ts
│       └── payment-response.dto.ts
├── infrastructure/
│   ├── providers/asaas/
│   │   ├── asaas-payment.provider.ts
│   │   ├── asaas-http.client.ts
│   │   ├── asaas-webhook.adapter.ts
│   │   └── asaas-mapper.ts
│   ├── persistence/
│   │   ├── prisma-payment.repository.ts
│   │   ├── prisma-payment-account.repository.ts
│   │   ├── prisma-ledger.repository.ts
│   │   ├── prisma-outbox.repository.ts
│   │   └── prisma-webhook-event.repository.ts
│   └── events/
│       └── payments-event.publisher.ts
├── http/
│   ├── payments.routes.ts
│   ├── payments.controller.ts
│   └── webhook.controller.ts
├── jobs/
│   ├── reconcile-payments.job.ts
│   └── process-payment-outbox.job.ts
└── README.md
```

Durante a migração, o módulo atual `backend/src/modules/billing` pode continuar existindo como compatibilidade temporária, mas novas regras e novos arquivos financeiros devem nascer em `payments`. A remoção de `billing` só ocorre depois que rotas, testes e consumidores forem migrados.

## Contratos

### Provider

O contrato interno deve cobrir somente capacidades necessárias ao domínio:

```ts
export interface PaymentProvider {
  createCustomer(input: CreateProviderCustomerInput): Promise<ProviderCustomer>;
  createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment>;
  getPixQrCode(paymentId: string): Promise<ProviderPixQrCode>;
  refundPayment(input: RefundProviderPaymentInput): Promise<ProviderRefund>;
  verifyWebhook(input: VerifyWebhookInput): Promise<ProviderWebhookEvent>;
}
```

O provider Asaas deve mapear `billingType` para `PIX`, `BOLETO`, `CREDIT_CARD` ou `UNDEFINED`, usar `externalReference` para reconciliação e retornar `invoiceUrl`/dados do QR Code quando disponíveis. Dados de cartão não devem ser persistidos pelo módulo; o checkout preferencial deve usar a fatura/URL do Asaas ou tokenização compatível com o contrato de segurança.

### API pública

O `index.ts` deve exportar rotas, factories/clientes, DTOs e eventos públicos; não deve exportar adapters Asaas, repositories Prisma ou entidades internas. O contrato mínimo é:

```ts
export interface PaymentsClient {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  getPayment(paymentId: string): Promise<PaymentSummary>;
  getPaymentAccount(teacherId: string): Promise<PaymentAccountSummary>;
}
```

### Eventos

O módulo publica eventos internos versionados:

- `payments.payment.confirmed`: pagamento confirmado, mas ainda não necessariamente liquidado;
- `payments.payment.received`: dinheiro disponível no Asaas;
- `payments.payment.failed`: cartão recusado ou falha equivalente;
- `payments.payment.refunded`: estorno total ou parcial concluído;
- `payments.payment.chargeback`: chargeback solicitado, em disputa ou concluído;
- `payments.split.received`: split liquidado para uma carteira específica.

O payload deve conter `eventId`, `paymentId`, `buyerUserId`, `productId` quando aplicável, valor em centavos, moeda, versão e `occurredAt`. `student-access`, notificações e analytics reagem a esses eventos; pagamentos não atualiza diretamente suas tabelas.

## Modelo de dados

O módulo será dono das seguintes tabelas, com prefixo `payment_` ou `payments_` consistente:

- `payment_accounts`: vínculo professor ↔ conta/subconta Asaas, `providerAccountId`, `walletId`, status de onboarding e timestamps de sincronização;
- `payment_customers`: vínculo usuário ↔ customer Asaas, sem dados sensíveis desnecessários;
- `payment_orders`: venda local, valor bruto, status, `providerPaymentId`, `externalReference` e chave de idempotência;
- `payment_order_items`: snapshot dos produtos vendidos, professores e valores;
- `payment_splits`: fotografia dos `walletId`, papel, valor calculado e regra aplicada;
- `payment_refunds`: histórico de estornos, inclusive parciais;
- `payment_chargebacks`: histórico de chargebacks e disputas;
- `payment_ledger_entries`: lançamentos append-only para débito, crédito, split, taxa, estorno e chargeback;
- `payment_webhook_events`: evento externo deduplicado por `providerEventId`;
- `payment_outbox_events`: eventos internos a publicar após commit;
- `payment_idempotency_keys`: escopo, chave, request fingerprint e resposta/recurso associado.

Valores monetários são inteiros em centavos. O Asaas calcula split sobre o valor líquido da cobrança; por isso o módulo deve armazenar tanto o valor bruto quanto a regra enviada e os valores liquidados observados nos eventos. Não se deve afirmar que a soma dos splits fecha o bruto quando taxas alteram o líquido.

## Fluxos

### Onboarding de recebimento

```text
Professor solicita configuração
  -> PaymentsClient cria/recupera payment_account
  -> PaymentsProvider Asaas cria/consulta subconta conforme contrato
  -> persiste providerAccountId + walletId + status
  -> retorna estado seguro e eventual ação de ativação
Asaas envia webhook de conta/subconta
  -> payments persiste evento
  -> atualiza payment_account em transação
```

Não armazenar API key de subconta por padrão. Se um fluxo BaaS exigir sua persistência, ela deve ser tratada como secret rotacionável, criptografada e nunca exposta em logs, respostas ou banco de domínio sem proteção específica.

### Checkout

```text
Aluno escolhe produto
  -> PaymentsClient recebe apenas IDs e intenção de pagamento
  -> payments consulta contrato público de produto/cliente
  -> calcula preço e split no backend
  -> valida walletIds e política de elegibilidade
  -> cria payment_order PENDING com idempotência
  -> Asaas cria cobrança com externalReference + split
  -> persiste providerPaymentId e snapshot do split
  -> retorna invoiceUrl ou dados seguros do Pix
```

O frontend nunca informa o preço final, a comissão ou o saldo destinado a cada participante como fonte de verdade.

### Confirmação e recebimento

O módulo deve distinguir `PAYMENT_CONFIRMED` de `PAYMENT_RECEIVED`. A liberação do acesso deve ser vinculada à política de negócio aprovada; para valores disponíveis ao seller e conciliação financeira, usar `PAYMENT_RECEIVED` e `PAYMENT_SPLIT_DONE`.

### Webhook

1. Validar `authToken` configurado no webhook, sem usar a API key como token.
2. Aceitar payloads com campos adicionais sem falhar.
3. Persistir evento com `providerEventId` único.
4. Responder rapidamente com `2xx` após aceitação idempotente.
5. Processar a transição em worker/transação.
6. Ignorar evento já processado e permitir reprocessamento explícito de falhas.

Eventos mínimos: `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, falha de cartão, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_SPLIT_DONE` e eventos de divergência/cancelamento de split.

### Estorno e chargeback

Estornos podem ser parciais e uma cobrança pode possuir múltiplos estornos. O módulo deve preservar todos os registros, considerar somente estornos concluídos no ledger e registrar o impacto por split. Chargeback não é sinônimo de estorno e deve possuir ciclo próprio de disputa.

## Rotas públicas iniciais

```text
GET  /api/v1/teachers/me/payment-account
POST /api/v1/teachers/me/payment-account
GET  /api/v1/teachers/me/payment-account/status

POST /api/v1/payments/checkout
GET  /api/v1/payments/:paymentId
POST /api/v1/payments/:paymentId/refunds
POST /api/v1/payments/webhooks/asaas
```

As rotas autenticadas usam a sessão existente. O webhook usa autenticação própria do Asaas e não sessão de usuário.

## Não objetivos da primeira versão

- extrair o módulo para um processo/deploy separado;
- construir dashboard financeiro completo;
- guardar dados bancários completos ou dados de cartão;
- transferir manualmente em datas futuras quando o split automático atende ao caso;
- implementar comissão de indicação antes de validar contrato e elegibilidade das subcontas;
- atualizar diretamente `student_subscriptions` ou tabelas de acesso dentro do webhook.

## Critérios de aceite arquiteturais

- `payments/index.ts` é a única API de importação permitida por consumidores;
- provider Asaas pode ser substituído por fake nos testes;
- criação de checkout é idempotente e não duplica cobrança;
- webhooks duplicados, fora de ordem e com campos desconhecidos são tolerados;
- cada transição financeira relevante possui evento, ledger e rastreabilidade;
- nenhum segredo ou dado completo de cartão aparece em payload persistido ou log;
- uma futura implementação HTTP de `PaymentsClient` pode substituir a implementação local sem alterar seus consumidores.

## Dependências e decisões de negócio antes da produção

- confirmar que a conta-pai do MeuMonitor AI é PJ/CNPJ e está habilitada para subcontas/split;
- confirmar se professores PF, PJ ou ambos podem ser subcontas elegíveis;
- definir se o modelo será subconta não-BaaS ou BaaS;
- definir quando acesso é liberado: confirmado ou recebido;
- fechar percentuais, taxas, responsabilidade por chargeback e política de estorno;
- definir retenção, criptografia e rotação de secrets;
- validar Sandbox com PIX, boleto, cartão, estorno parcial e split para pelo menos dois wallets.

## Fontes oficiais consultadas

- [Autenticação e ambientes do Asaas](https://docs.asaas.com/docs/authentication-2)
- [Criação de subcontas](https://docs.asaas.com/docs/criacao-de-subcontas)
- [Criar subconta](https://docs.asaas.com/reference/create-subaccount)
- [Introdução ao Split de pagamentos](https://docs.asaas.com/docs/split-de-pagamentos)
- [FAQ de Split](https://docs.asaas.com/docs/split)
- [Criar cobrança](https://docs.asaas.com/reference/create-new-payment)
- [Eventos para cobranças](https://docs.asaas.com/docs/payment-events)
- [Webhooks](https://docs.asaas.com/docs/sobre-os-webhooks)
- [Estornos](https://docs.asaas.com/docs/estornos)
