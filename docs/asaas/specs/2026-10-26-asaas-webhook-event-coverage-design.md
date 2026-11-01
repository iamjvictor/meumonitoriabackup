# Cobertura e tratamento dos eventos de webhook Asaas

**Data:** 26/10/2026  
**Status:** spec para implementação e testes; não altera configuração remota do Asaas.

## Intenção

Fechar as lacunas entre os eventos registrados, os eventos que o processador reconhece e os efeitos financeiros/de acesso esperados. Cada evento habilitado deve terminar como aplicado, aguardando correlação por um motivo recuperável, ou ignorado com motivo explícito. Nenhum evento reconhecido deve ficar preso em `WAITING_CORRELATION` só por não ter um ramo próprio.

A entrega inclui testes automatizados locais. A configuração de webhooks remota, Sandbox ou produção não será modificada por scripts durante estes testes.

## Situação observada

- Os scripts de webhook principal configuram `PAYMENT_CREATED` e `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, mas o dispatcher só encaminha `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` ao repositório financeiro. Os dois eventos configurados restantes podem cair em `WAITING_CORRELATION` sem tratamento funcional.
- `SUBSCRIPTION_INACTIVATED` é encaminhado pelo código, mas não aparece na lista de eventos dos scripts.
- `PAYMENT_DELETED` é encaminhado para o tratamento de assinatura; `PAYMENT_RESTORED`, `PAYMENT_UPDATED` e vários estados de risco/refund/chargeback não têm caminho correspondente.
- O código marca `PAYMENT_CHARGEBACK_REQUESTED` como estado terminal e revoga acesso. Não acompanha `PAYMENT_CHARGEBACK_DISPUTE` nem `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`; o pagamento confirmado/recebido após reversão pode permanecer bloqueado pelo estado terminal anterior.
- `PAYMENT_SPLIT_DONE` é tratado, mas eventos de split cancelado/divergência e de divergência em split de assinatura não são.
- O mapper já reconhece `ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON` e `...EXPIRED`; a configuração da subconta não assina esses eventos. O webhook principal assina apenas o evento de expiração.

## Escopo

1. Eventos de situação cadastral de subcontas, inclusive confirmação anual dos dados comerciais.
2. Os quatro eventos de checkout.
3. Ciclo de vida da assinatura, incluindo inativação e eventos relacionados a Split.
4. Ciclo financeiro necessário ao checkout recorrente com cartão e split: criação, confirmação/recebimento, recusa, atualização/remoção/restauração, estorno, chargeback e estado do split.
5. Testes de roteamento, efeitos no banco, idempotência, eventos fora de ordem e consistência das listas de eventos versionadas no código.

## Fora do escopo

- Alterar webhooks existentes via API Asaas ou enviar evento sintético ao endpoint de produção.
- Cobranças por boleto, negativação e recebimento em dinheiro enquanto esses meios não fizerem parte do produto. O suporte futuro a esses meios deve adicionar seus eventos e testes explicitamente.
- Conceder acesso por evento de checkout, criação de cobrança, autorização ou estado de split.
- Tratar todo evento futuro desconhecido como erro permanente. Eventos desconhecidos devem ser registrados como ignorados e não interromper a fila.

## Contrato por tipo de evento

| Grupo | Evento | Efeito esperado | Acesso |
|---|---|---|---|
| Checkout | `CHECKOUT_CREATED` | Associar checkout local e marcar ativo | Não concede |
| Checkout | `CHECKOUT_PAID` | Marcar jornada paga; aguardar evento financeiro para confirmar compra | Não concede sozinho |
| Checkout | `CHECKOUT_CANCELED`, `CHECKOUT_EXPIRED` | Marcar estado final da jornada; não reabrir por evento antigo | Não concede |
| Assinatura | `SUBSCRIPTION_CREATED`, `UPDATED` | Correlacionar e atualizar snapshot/status da recorrência | Não concede sozinho |
| Assinatura | `SUBSCRIPTION_INACTIVATED` | Marcar recorrência inativa/cancelamento pendente, mantendo período já pago | Mantém até o fim pago |
| Assinatura | `SUBSCRIPTION_DELETED` | Marcar recorrência cancelada | Mantém até o fim pago |
| Cobrança | `PAYMENT_CREATED` | Persistir cobrança pendente com IDs e referência; não ativar assinatura | Não concede |
| Cobrança | `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` | Persistir recusa; preservar estado de acesso anterior e permitir nova tentativa | Não concede |
| Cobrança | `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | Atualizar cobrança e período; `RECEIVED` não pode regredir para `CONFIRMED` | Aplica a regra financeira atual; recebimento após recuperação de chargeback pode reabrir |
| Cobrança | `PAYMENT_UPDATED` | Atualizar vencimento/valor/campos do provider sem duplicar cobrança | Sem mudança de acesso |
| Cobrança | `PAYMENT_DELETED`, `PAYMENT_RESTORED` | Atualizar somente a cobrança atingida e preservar os demais itens da assinatura | Sem concessão automática; remoção não apaga período já pago |
| Estorno | `PAYMENT_REFUND_IN_PROGRESS` | Registrar estado pendente de estorno sem declarar estorno concluído | Mantém regra atual até resultado final |
| Estorno | `PAYMENT_REFUNDED` | Marcar estorno terminal e revogar acesso da cobrança/item conforme política atual | Revoga |
| Estorno | `PAYMENT_PARTIALLY_REFUNDED` | Registrar estorno parcial; não cancelar toda a assinatura sem regra explícita de produto | Sem revogação total automática |
| Estorno | `PAYMENT_REFUND_DENIED` | Registrar recusa do estorno sem deixar acesso revogado por engano | Preserva/recupera estado anterior |
| Chargeback | `PAYMENT_CHARGEBACK_REQUESTED`, `...DISPUTE` | Marcar disputa/revisão e suspender acesso conforme política antifraude | Suspende enquanto disputa |
| Chargeback | `PAYMENT_AWAITING_CHARGEBACK_REVERSAL` | Marcar reversão financeira pendente; não reabrir antes da confirmação/recebimento posterior | Ainda suspenso |
| Chargeback | Confirmação/recebimento posterior à reversão | Reconciliar a mesma cobrança e retirar bloqueio de chargeback | Reabre se este for o evento posterior válido do provider |
| Split | `PAYMENT_SPLIT_DONE` | Liquidar apenas o split identificado por `additionalInfo.splitId` | Não altera |
| Split | `PAYMENT_SPLIT_CANCELLED`, `PAYMENT_SPLIT_DIVERGENCE_BLOCK`, `...FINISHED` | Atualizar estado do split e sinalizar efeito de repasse | Não altera |
| Split de assinatura | `SUBSCRIPTION_SPLIT_DISABLED`, `...DIVERGENCE_BLOCK`, `...DIVERGENCE_BLOCK_FINISHED` | Persistir estado próprio de split da recorrência e resultado de divergência | Não altera acesso do aluno |
| Conta | `ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON`, `...EXPIRED` | Atualizar dimensão comercial; expiração anual deve gerar pendência operacional mesmo se aprovação geral seguir `APPROVED` | Não muda aprovação geral por si só |

### Regras que precisam permanecer verdadeiras

- Webhooks Asaas têm entrega pelo menos uma vez: a chave estável é o `event.id`; replay não duplica cobrança, split, auditoria ou projeção de acesso.
- Uma notificação antiga não pode regredir estado mais novo. A precedência é por evento/ dimensão, não pela ordem em que workers concorrentes terminam.
- `PAYMENT_CHARGEBACK_REQUESTED` e `PAYMENT_CHARGEBACK_DISPUTE` são estados de disputa, não equivalem automaticamente a um estorno final irrevogável. O evento posterior de reversão e a confirmação/recebimento precisam ser reconciliáveis.
- Eventos sem pedido/assinatura/cobrança local ficam em espera somente quando ainda há uma chave de correlação que possa aparecer; a recuperação tem prazo e limite. Evento não suportado não deve ser classificado como espera por correlação.
- A configuração do webhook deve ser derivada de listas compartilhadas/versionadas, usadas pelo registro, atualização e configuração da subconta, para evitar listas divergentes.
- Só configurar eventos para os quais existe comportamento e teste. Eventos de boleto/dunning/dinheiro ficam fora até o produto oferecer esses meios.

## Matriz de implementação

| Área | Mudança | Evidência obrigatória |
|---|---|---|
| Catálogo | Uma fonte de verdade de eventos habilitados por endpoint (principal e subconta), com distinção de domínio | Teste compara registro, atualização e provider de subconta; sem duplicatas nem eventos sem handler |
| Dispatcher | Rota explícita para estados financeiros, estados de cobrança, split e split de recorrência | Teste por evento afirma handler, estado terminal e que eventos desconhecidos são ignorados |
| Persistência | Estado de cobrança para recusa, restauração, estorno em progresso/negado e dispute/reversal; metadados de atualização | Integração Prisma verifica estado da cobrança e nenhum acesso indevido |
| Chargeback | Máquina de estados reversível até resultado final; evento de confirmação/recebimento após reversão reabre somente cobrança correlacionada | Teste de sequência e replay; estorno final continua não reabrindo acesso |
| Split | Persistir eventos de cancelamento/bloqueio/fim de bloqueio e estado do split da assinatura separado do estado de acesso | Teste verifica split/recorrência e confirma que enrollment não muda |
| Conta | Incluir eventos de expiração comercial anual na configuração da subconta e manter dimensão comercial isolada | Teste do provider e mapper; `generalStatus` não muda por expiração comercial |
| Operação | Logs e estados de inbox distinguem aplicado, ignorado, aguardando correlação e falha | Teste de replays, erro de dependência e recuperação com IDs sanitizados |

## Plano de testes TDD

### Testes unitários de roteamento

Arquivo: `backend/src/modules/payments/__tests__/webhook-event-coverage.test.ts`.

- Cada evento configurado tem rota e resultado esperados; nenhuma ocorrência apenas cai em `WAITING_CORRELATION` por falta de branch.
- `PAYMENT_CREATED` e `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` chamam o handler financeiro sem conceder acesso.
- Eventos de checkout nunca chamam o handler financeiro de concessão.
- Eventos de split nunca chamam o handler de acesso.
- Inativação e eventos de split de assinatura chamam o handler de assinatura.
- Evento desconhecido termina como `IGNORED`, não `WAITING_CORRELATION`.

### Testes de integração de banco

Arquivos: `payment-event.database.test.ts` e `subaccount-webhook.database.test.ts`, usando PostgreSQL descartável e o fluxo real de repositório.

1. `PAYMENT_CREATED` cria/atualiza uma cobrança pendente e não ativa assinatura nem enrollment.
2. Recusa de captura não cria acesso e preserva acesso preexistente de outras cobranças.
3. Chargeback solicitado → disputa → reversão pendente → confirmação/recebimento reabre somente a assinatura correlacionada; estorno final não reabre.
4. Estorno em progresso/negado e estorno parcial não se confundem com estorno total.
5. Remoção/restauração/atualização da cobrança não altera outra cobrança nem apaga período pago.
6. Split liquidado/cancelado/bloqueado/desbloqueado atualiza apenas seu registro e não libera/revoga acesso.
7. Eventos repetidos e fora de ordem preservam o estado terminal/mais recente.
8. Expiração comercial anual atualiza dimensão comercial e não altera a aprovação geral.

### Sandbox

Após os testes determinísticos passarem, rodar um fluxo opt-in em endpoint de homologação: criar subconta/cobrança Sandbox, observar entrega genuína, comparar `event.id` do Asaas com inbox e verificar estado no painel. Um POST sintético não conta como evidência de entrega do provider. Nenhum teste pode usar URL de produção.

## Critério de aceite

- Existe uma matriz completa entre evento habilitado, handler, efeito e teste.
- Nenhum evento configurado cai acidentalmente em `WAITING_CORRELATION` ou em handler de acesso incorreto.
- Eventos financeiros e de split são idempotentes; ordem e replay não concedem nem retiram acesso indevidamente.
- O fluxo de chargeback permite recuperação após reversão e mantém estorno final terminal.
- Testes da suíte de pagamentos passam em banco descartável; testes Sandbox passam em homologação antes de declarar a integração validada para produção.

## Fontes oficiais

- [Eventos para cobranças](https://docs.asaas.com/docs/webhook-para-cobrancas)
- [Eventos para assinaturas](https://docs.asaas.com/docs/subscription-events)
- [Eventos para checkout](https://docs.asaas.com/docs/checkout-events)
- [Eventos de situação da conta](https://docs.asaas.com/docs/account-status-events)
- [Bloqueio de assinatura por divergência de Split](https://docs.asaas.com/docs/subscription-blocking-flow-due-to-split-mismatch)
