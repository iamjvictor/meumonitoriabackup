# Estado de implementação e validação do fluxo Asaas

**Revisado em:** 27/10/2026

Este arquivo separa o que foi confirmado em código/testes locais do que foi observado em uma compra Sandbox anterior. A compra Sandbox anterior não valida os novos fluxos anual e patrocinado descritos abaixo. Não substitui a [referência operacional](reference/PAGAMENTOS-E-ASSINATURAS.md).

## Estado atual

| Camada | Resultado | Limite da evidência |
|---|---|---|
| Aluno compra mensal | Testes locais confirmam checkout recorrente, preço do catálogo e split do professor; teste de interface confirma o envio de `MONTHLY` | Ainda falta repetir a compra com pagamento genuíno no Sandbox e confirmar o split/eventos na inbox. |
| Aluno compra anual | Testes locais confirmam preço `mensal × 12 × 0,8`, checkout `DETACHED` e split do professor, inclusive no payload Asaas; interface envia `ANNUAL` | Ainda falta pagamento genuíno no Sandbox e confirmar split, webhook e concessão dos 12 meses. |
| Professor patrocina vaga | Testes locais confirmam cobrança só da parte da plataforma e `splits: []`; interface cobre mensal e anual para um e-mail | Ainda falta compra genuína no Sandbox, webhook e claim do aluno com e-mail verificado nos dois intervalos. |
| Conta de recebimento inelegível | Checkout direto mensal/anual agora é recusado antes de criar pedido; API retorna `TEACHER_PAYOUT_UNAVAILABLE` | Testes em produção não realizados. |
| Suíte `npm run test:payments` | **217 testes: 183 passaram, 0 falharam, 34 ignorados** nesta revisão | Os 34 ignorados dependem do banco isolado `mm_asaas_flow_test`; a preparação desse banco foi bloqueada pela revisão automática do Prisma. |
| Testes de interface dos planos | **8 passaram** nos componentes da vitrine do professor e turmas patrocinadas | Simulam a interface e respostas HTTP; não acessam Asaas real. |
| Typecheck do backend | Passou nesta revisão | Não valida migrations remotas, variáveis de deploy nem comportamento em produção. |
| Checkout Asaas Sandbox ponta a ponta anterior | **Validado em 27/10/2026** para uma compra de checkout anterior, com webhook genuíno, worker e acesso | Evidência não cobre os planos anuais nem vagas patrocinadas implementados nesta revisão. |
| Criação e aprovação cadastral de subconta no Sandbox | Ainda não exercitada ponta a ponta neste registro | Há testes locais e tratamento implementado; falta acompanhar evento genuíno de status da subconta no Sandbox. |
| Produção | **Nenhum dos novos fluxos foi testado** | Não houve compra, cobrança, alteração de webhook ou gravação financeira de teste em produção. |

## Evidência da jornada Sandbox

O roteiro local iniciou API e worker contra um PostgreSQL e Redis isolados, abriu ngrok e registrou um webhook temporário na conta Sandbox. O webhook Sandbox original não foi alterado.

Eventos genuínos entregues pelo Asaas e observados na inbox:

- `CHECKOUT_CREATED` → `CHECKOUT_STATE_APPLIED`;
- `CHECKOUT_PAID` → `CHECKOUT_STATE_APPLIED`;
- `PAYMENT_CREATED` → `PAYMENT_STATE_APPLIED`;
- `PAYMENT_CONFIRMED` → `PAYMENT_ACCESS_APPLIED`.

O estado final na base descartável foi pedido `PAYMENT_CONFIRMED` e matrícula de teste `ACTIVE`. O worker registrou a liberação do acesso. Ao final, o script removeu o webhook temporário; uma consulta Sandbox confirmou que o webhook original continuava presente e o temporário havia sumido. API e worker locais foram encerrados; containers de teste ficaram parados.

Esse resultado comprova que checkout, entrega genuína via webhook, inbox, fila, worker, confirmação financeira e projeção de acesso funcionaram juntos no Sandbox. O preço de R$ 19,90 foi definido pelo monitor local criado pelo script; não veio de um produto de produção.

Essa evidência é de uma compra anterior ao fluxo anual e às vagas patrocinadas. Os testes atuais desses caminhos usam provider falso e dados simulados; eles não movimentam dinheiro e não comprovam o comportamento remoto do Asaas para cada modalidade.

## Testes dos planos mensal/anual e vagas patrocinadas

Nesta revisão, testes locais cobriram:

- aluno no mensal: checkout `RECURRENT`, valor mensal do catálogo e split para a wallet elegível do professor;
- aluno no anual: checkout `DETACHED`, valor anual calculado no backend e split para a wallet elegível do professor;
- professor adicionando uma vaga mensal ou anual: apenas a parte da plataforma, sem split;
- falha segura: checkout direto do aluno é recusado se a conta de recebimento não tem aprovação, wallet ou percentual positivo;
- interfaces: a página pública envia o intervalo mensal/anual e o painel do professor envia a cotação de uma vaga ao checkout;
- eventos financeiros simulados e regras de período/anual existentes na suíte de pagamentos.

O fluxo completo com banco local, webhook persistido, worker e entitlement ainda não foi executado para as novas modalidades: 34 testes de integração foram ignorados porque a revisão automática do Prisma bloqueou `db push --accept-data-loss`. Não se deve aplicar esse comando em produção.

## Comportamento confirmado no código

- O endpoint de checkout exige sessão de aluno, monitor publicado e chave `Idempotency-Key`; registra o pedido antes de pedir a sessão hospedada ao Asaas.
- O preço é `Monitor.priceCents`, congelado nos itens do pedido. `PAYMENTS_TEST_PRICE_CENTS` pertence à rota simulada e não altera o checkout Asaas.
- O split depende de conta de recebimento aprovada e wallet no mesmo ambiente. A confirmação financeira pode liberar acesso; `CHECKOUT_PAID` sozinho não libera.
- O webhook valida `asaas-access-token`, exige ID/evento, persiste a inbox e depois tenta enfileirar. O worker reivindica o evento e aplica o handler correspondente com deduplicação.
- Eventos sem correlação podem aguardar retry; recuperação periódica volta a enfileirar estados elegíveis e eventos que esgotam tentativas ficam em `DEAD_LETTER` para investigação.
- O acesso canônico é composto por assinatura/item `ACTIVE` ou `CANCEL_PENDING` e período vigente. O snapshot é servido por `/api/v1/student/access` e cacheado no Redis.
- A criação de subconta usa operação recuperável; a credencial da subconta é cifrada, e a sincronização do webhook tem estado/retry próprios.

## Pendências antes de afirmar prontidão para produção

1. Rodar os testes de integração em PostgreSQL descartável para validar pedido, webhook, worker, split persistido e entitlement; o comando destrutivo do Prisma requer autorização explícita no momento da execução e nunca deve apontar para produção.
2. Executar no Sandbox uma compra genuína em cada caminho: aluno mensal, aluno anual e professor patrocinando uma vaga mensal e anual. Conferir valor, tipo de checkout, presença/ausência de split, eventos recebidos e acesso final do aluno.
3. Executar jornada genuína de criação de subconta Sandbox e acompanhar `ACCOUNT_STATUS_*` até atualizar `payment_accounts` e aparecer no painel.
4. Fazer deploy coordenado de API, worker, migrations e variáveis; confirmar que todos usam o mesmo `ASAAS_ENV`, banco, Redis e token de webhook.
5. Conferir separadamente os eventos habilitados nos webhooks remotos de produção. A lista versionada no código não prova a configuração remota.
6. Testes dos novos fluxos em produção continuam pendentes. Após autorização e janela operacional, validar com uma compra real de baixo valor, conferir o split/acesso e registrar o resultado; não enviar payload sintético nem evento Sandbox para produção.
7. Configurar alertas para falha de enqueue, `WAITING_CORRELATION` prolongado, `DEAD_LETTER`, divergência entre ambiente da API e worker, falha de sincronização do webhook de subconta e timeout/erro de API Asaas.

## Organização e documentos relacionados

- [Índice e ordem de leitura](README.md)
- [Referência do fluxo atual](reference/PAGAMENTOS-E-ASSINATURAS.md)
- [Configuração e variáveis](reference/CONFIGURACAO-E-VARIAVEIS.md)
- [Sincronização de status das subcontas](reference/asaas-account-status-sync.md)
- [Spec histórica de cobertura de eventos](specs/2026-10-26-asaas-webhook-event-coverage-design.md)
- [Spec histórica de testes de subconta](specs/2026-10-25-asaas-subaccount-flow-tests-design.md)
