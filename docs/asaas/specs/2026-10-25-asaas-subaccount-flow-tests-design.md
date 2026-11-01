# Testes do fluxo completo de conta de recebimento Asaas

## Objetivo

Demonstrar, com evidência reproduzível, que o professor solicita uma subconta pela interface, o backend a cria e persiste, o Asaas entrega uma mudança de situação cadastral ao webhook, o worker aplica essa mudança e o painel mostra o novo status após consultar a API. Os testes devem exercitar também falhas, duplicidade e recuperação sem alterar contas de produção.

Esta spec depende do contrato de confiabilidade em `2026-10-25-asaas-subaccount-webhook-reliability-design.md`. A cobertura completa aqui significa cobrir os contratos observáveis da integração; o Sandbox não comprova a análise cadastral ou regulatória de produção.

## Abordagens e decisão

| Abordagem | Valor | Limite |
|---|---|---|
| Somente mocks/unitários | Rápida e determinística | Não prova rota HTTP, banco, Redis, worker nem entrega do Asaas |
| Integração local isolada | Prova a cadeia da aplicação e cenários difíceis de reproduzir | O Asaas é substituído por um servidor falso |
| Asaas Sandbox opt-in | Prova requisição e entrega real do provider, sem valores reais | Depende de serviço externo e tem fluxo cadastral simplificado |

Adotar as três camadas. A integração local é o gate obrigatório de CI; o Sandbox roda sob comando explícito em ambiente isolado. A produção recebe apenas uma conferência operacional dos eventos genuínos da conta existente.

## Ambiente de homologação

- API e frontend de teste com `ASAAS_ENV=sandbox`, `PAYMENTS_PROVIDER=ASAAS`, `ASAAS_API_KEY_SANDBOX`, `ASAAS_CREDENTIAL_ENCRYPTION_KEY`, `ASAAS_WEBHOOK_AUTH_TOKEN`, `ASAAS_WEBHOOK_EMAIL` e `ASAAS_WEBHOOK_URL` próprios do teste. `NEXT_PUBLIC_API_URL` aponta para a API de teste.
- Banco PostgreSQL e Redis exclusivos do teste; usuário de professor e e-mail sob controle da equipe. CPF/CNPJ e demais dados fictícios são usados apenas no Sandbox. O teste não reutiliza a conta de produção nem o banco produtivo.
- Webhook de teste em URL HTTPS pública que aponta para a API de homologação; token diferente do de produção. Backend e worker devem estar ativos e usar o mesmo banco/Redis/ambiente.
- O executor verifica antes de qualquer `POST /accounts` ou webhook sintético que ambiente, host do Asaas, host do webhook e banco pertencem à homologação. Falha fechada quando faltar qualquer condição. Os IDs de teste recebem prefixo/correlação de execução; segredos nunca aparecem em relatório, trace, screenshot ou log.
- Os testes de Sandbox usam nome sem números/caracteres especiais e contatos próprios. Autoaprovação deve ficar desativada no cenário que precisa observar `PENDING → APPROVED`.

## Jornada e oráculos

1. Criar professor de teste e abrir o painel de recebimento. Antes do envio, `GET /teachers/me/payment-account` retorna `null`.
2. Preencher o formulário e enviar uma única vez. Verificar `POST /teachers/me/payment-account` com `201`, `providerAccountId`, `walletId`, `status` inicial e ausência de `apiKey` no JSON. Consultar o banco de teste: conta, perfil, credencial cifrada e vínculo do professor existem no mesmo ambiente.
3. Consultar `/webhooks` com a chave da **subconta** ou pela interface Asaas Sandbox. Confirmar URL, token configurado sem exibí-lo, `enabled=true`, versão 3, envio sequencial e eventos `ACCOUNT_STATUS_*`. Registrar apenas o ID do webhook.
4. Provocar uma mudança de status no Sandbox. A documentação de aprovação tem duas rotas divergentes (`/v3/accounts/{id}/approve` no guia e `/v3/sandbox/myAccount/approve` na referência); validar em uma chamada controlada qual se aplica à subconta antes de automatizar. Não presumir que a resposta da aprovação prova a entrega: verificar o log de webhook do Asaas e o evento recebido.
5. Confirmar `HTTP 200` no log de entrega, uma linha por `providerEventId` na inbox, estado `ACCOUNT_STATUS_APPLIED`, job concluído, `payment_accounts.general_status=APPROVED` e `status=APPROVED`. Uma nova consulta da API e a atualização/reabertura do painel mostram `Aprovada`.
6. Reenviar no ambiente de teste o **mesmo** `id` para confirmar deduplicação: resposta `200`, um registro e um efeito. Reenviar com token inválido: `401` sem nova linha. Usar ID distinto para testar evento pendente/rejeitado sem mascarar a aprovação real; só no ambiente isolado.
7. Medir tempos de cada marco com polling de prazo máximo e erro diagnóstico; evitar `sleep` fixo. Em falha, coletar status HTTP, IDs sanitizados, estado da inbox, fila/worker e log do Asaas. Não coletar payload integral ou credenciais.

## Matriz TDD por camada

| Camada | Novos testes exigidos | Evidência |
|---|---|---|
| Contratos de domínio/provider | Erro de validação antes de `/accounts`; conta criada, webhook ativo; falha de webhook retomada; concorrência; sigilo da chave | Chamadas externas contadas e resposta pública sanitizada |
| HTTP + PostgreSQL + Redis | `201` da criação; `200` após persistência do webhook; `401` token inválido; `422` payload inválido; duplicata antes/depois do vínculo; queda do Redis | Linhas reais em `payment_accounts`, credencial, inbox/outbox e job |
| Worker + repositório | Status por dimensão, evento antigo, conta ausente, `WAITING_CORRELATION`, lease vencido, limite de tentativas | Estado final e nenhuma regressão/duplicação |
| Frontend | Formulário envia uma vez, mostra erros do Asaas, estado pendente, configuração de webhook pendente e aprovação após recarregar | Testes de componente e Playwright com API controlada |
| Sandbox real | Criação de subconta, webhook configurado, mudança de status emitida pelo Asaas, processamento completo | IDs correlacionados e log de entrega Asaas `200` |

Cada caso começa por um teste vermelho com resultado observável e só passa após a alteração correspondente. Os testes locais não repetem mocks já cobertos sem acrescentar fronteira nova. O teste de Sandbox é opt-in e fica fora da suíte padrão/CI para evitar contas remotas geradas por execuções automáticas.

## Implementação dos testes

- Reusar o runner `node --import tsx --test` do backend, com PostgreSQL e Redis descartáveis para os testes de integração. Substituir somente a borda HTTP do Asaas por um servidor falso; manter rotas Fastify, Prisma, BullMQ e worker reais. Dados e filas têm namespace por execução; teardown remove recursos apenas do ambiente de teste.
- Acrescentar um teste Playwright de conta de recebimento ao diretório `frontend/tests/e2e/`, com API de teste ou interceptação controlada para estados da interface. Ele não deve depender da ordem de outros testes nem da sessão produtiva.
- Criar um comando separado `test:asaas-subaccount-sandbox` que verifica as condições do ambiente, registra os IDs gerados e usa a API real do Sandbox. A aprovação é uma etapa opcional e explícita do comando; a falha da aprovação deve produzir diagnóstico sem marcar a conta como aprovada localmente.
- Proteger o comando existente `asaas:webhook:test-account-approved` com guarda de Sandbox **e** allowlist da URL de homologação; não usá-lo como prova de entrega do Asaas. Um POST sintético prova apenas a nossa rota e worker.
- Registrar uma planilha/artefato JSON sanitizado por execução com `runId`, IDs locais/Asaas, eventos, estados e duração; omitir CPF/CNPJ, e-mail completo, token e credenciais.

## Gate de conclusão

- Todos os casos determinísticos locais passam em execução limpa e repetida, inclusive duplicidade, erro de Redis e retomada após reinício.
- O teste Sandbox mostra a cadeia inteira até o painel com pelo menos um webhook **originado pelo Asaas**; uma aprovação sintética enviada por nosso script não satisfaz esse gate.
- Nenhum evento permanece em `WAITING_CORRELATION`/`PROCESSING` além do prazo definido sem tentativa de recuperação ou alerta terminal.
- Um `POST /accounts` bem-sucedido nunca é repetido automaticamente por falha posterior de webhook/persistência; conta órfã ou operação incompleta é identificável para reconciliação.
- A documentação operacional explica como localizar o evento nos [logs de webhook da subconta](https://docs.asaas.com/docs/logs-de-webhooks) e comparar seu `id` ao registro local.

## Fora do escopo

- Enviar documentos reais, mover valores, criar cobrança/split ou aprovar conta produtiva.
- Rodar testes que alteram o Asaas automaticamente em cada push.
- Tratar sucesso no Sandbox como garantia de aprovação em produção.

## Fontes oficiais

- [Configuração do Sandbox](https://docs.asaas.com/docs/como-configurar-sua-conta-no-sandbox) e [aprovação de subcontas](https://docs.asaas.com/docs/aprova%C3%A7%C3%A3o-de-contas).
- [Referência de aprovação da conta autenticada no Sandbox](https://docs.asaas.com/reference/aprovar-conta), cuja rota deve ser conciliada com a do guia antes da automação.
- [Eventos e resposta de webhook](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook) e [logs de webhook](https://docs.asaas.com/docs/logs-de-webhooks).
