# Dashboard da conta Asaas do professor — saldo e indicadores

## 1. Objetivo

Evoluir a tela “Minha conta” do painel do professor para apresentar uma visão confiável da conta de recebimento Asaas: status da conta, acesso ao painel Asaas e indicadores financeiros consultados pelo backend diretamente na API do Asaas.

O recurso não implementa saque nesta etapa. Ele prepara a visualização financeira e deixa explícito quando a conta ainda não está apta a operar.

## 2. Escopo

### Incluído

- Banner principal azul-escuro, com texto branco e CTA para abrir o painel do Asaas.
- CTA condicionado ao estado da conta:
  - conta aprovada: abrir o painel oficial;
  - conta pendente/rejeitada: manter o usuário na tela e orientar a regularização;
  - URL ausente: não renderizar link quebrado.
- Endpoint autenticado para consultar os dados financeiros da subconta do professor.
- Quatro KPIs:
  - saldo disponível;
  - total recebido no mês corrente;
  - valores a receber/pendentes;
  - transferências pendentes.
- Estado de carregamento, indisponibilidade, erro transitório e conta não aprovada.
- Mascaramento de dados sensíveis e ausência de API key no payload frontend/logs.
- Testes unitários, contratos de integração e testes de componente/contrato visual.

### Fora do escopo

- Criar saque/transferência pelo MeuMonitor.
- Alterar dados bancários da subconta.
- Implementar login próprio no painel Asaas.
- Persistir saldo como fonte financeira definitiva.
- Reconciliar cobranças que ainda não chegaram por webhook.

## 3. Premissas e decisões

1. A credencial Asaas permanece exclusivamente no backend.
2. A conta atual do professor continua sendo localizada por `teacher.userId` e `teachers.current_payment_account_id`.
3. O `walletId` salvo em `payment_accounts` identifica a subconta recebedora.
4. Saldo e indicadores são leituras em tempo real (ou com cache curto controlado), não valores calculados somente do banco local.
5. A página deve funcionar mesmo quando o Asaas estiver indisponível: exibe o último estado local da conta e uma mensagem de indisponibilidade para os KPIs.
6. O link do painel deve ser configurável por ambiente (`ASAAS_DASHBOARD_URL`), com valor padrão documentado, sem montar URL a partir de dados fornecidos pelo usuário.
7. A API key da subconta não será exibida nem armazenada em texto puro. Como o Asaas retorna a chave somente uma vez, a implementação deve escolher antes do rollout uma destas estratégias operacionais:
   - provisionar uma chave da subconta via gerenciamento de chaves BaaS e armazená-la em um secret manager/coluna criptografada; ou
   - manter a operação no modelo de subconta padrão e não consultar métricas privadas via nossa aplicação, direcionando o titular ao painel Asaas.
   Sem essa decisão, não devemos simular saldo nem persistir uma chave recuperada de forma insegura.

## 4. Contrato backend

### Endpoint

`GET /api/v1/teachers/me/payment-account/overview`

Autenticação: sessão do professor (`authMiddleware`) e validação de papel `teacher`/`professor`.

### Resposta de sucesso

```json
{
  "data": {
    "account": {
      "id": "uuid-local",
      "providerAccountId": "uuid-asaas",
      "walletId": "wallet-id",
      "status": "APPROVED",
      "generalStatus": "APPROVED",
      "onboardingUrl": null,
      "dashboardUrl": "https://www.asaas.com/login"
    },
    "metrics": {
      "availableBalanceCents": 125000,
      "receivedThisMonthCents": 278900,
      "pendingReceivablesCents": 34900,
      "pendingTransfersCount": 1,
      "currency": "BRL",
      "asOf": "2026-09-25T15:00:00.000Z"
    }
  }
}
```

Valores monetários são inteiros em centavos. O frontend formata em BRL; não deve recalcular valores de cobranças locais.

### Estados HTTP

- `200`: conta aprovada e métricas carregadas.
- `200` com `metrics: null`: conta existe, mas ainda não está apta ou o provedor está temporariamente indisponível; `account` continua disponível.
- `401`: sessão ausente/inválida.
- `403`: usuário não é professor.
- `404`: professor ou conta de recebimento inexistente.
- `502`: resposta inválida/incompatível do Asaas ou falha não classificada; nunca vazar a resposta bruta do provedor.

## 5. Integração Asaas

O backend usará um cliente/provider isolado para:

- consultar o saldo disponível da conta recebedora;
- consultar cobranças/recebimentos do mês corrente;
- consultar cobranças pendentes;
- consultar transferências em estados pendentes.

Essas consultas exigem uma credencial autorizada para a conta consultada. A conta-pai não deve ser presumida como capaz de ler o saldo privado da subconta apenas por possuir o `walletId`. A ativação do gerenciamento de chaves de subcontas no Asaas pode exigir liberação temporária na interface, whitelist de IP e enquadramento BaaS; isso deve ser validado antes da implementação em produção.

Cada chamada deve:

- usar a credencial correta da conta e o ambiente (`sandbox`/`production`);
- aplicar timeout;
- normalizar valores para centavos;
- classificar timeout/indisponibilidade transitória como `metrics: null` (HTTP 200) e erros de contrato como falha normalizada;
- registrar somente IDs, status, duração e contagens, nunca API keys ou dados bancários completos.

O provider deve ser substituível em testes por um fake determinístico. A resposta do Asaas não deve ser repassada diretamente ao frontend.

## 6. Frontend

Arquivo-alvo: tela atual de conta de recebimento do painel do professor.

### Banner

- Fundo azul-marinho da identidade do painel.
- Título e descrição em branco.
- Badge de status com contraste acessível.
- CTA primário “Abrir painel Asaas” usando `dashboardUrl`.
- CTA secundário opcional “Ver status da aprovação” quando houver `onboardingUrl`.
- Link externo deve usar `target="_blank"` e `rel="noreferrer"`.

### KPIs

Quatro blocos compactos, sem valores fictícios:

- **Saldo disponível** — valor que pode ser transferido segundo o Asaas.
- **Recebido neste mês** — entradas confirmadas no mês corrente.
- **A receber** — cobranças ainda pendentes.
- **Transferências pendentes** — quantidade em processamento.

Estados obrigatórios:

- skeleton durante a consulta;
- “Indisponível” quando `metrics` for nulo;
- mensagem curta de atualização quando houver erro;
- indicação de data/hora da última consulta (`asOf`).

## 7. Segurança e privacidade

- Nunca retornar `apiKey`, token, senha, CPF completo, dados bancários ou webhook secret.
- Validar o professor no backend; não confiar em `teacherId` enviado pelo navegador.
- Não permitir consultar a conta de outro professor alterando parâmetros.
- Não registrar payloads financeiros completos.
- Respeitar sandbox/produção e impedir que uma conta sandbox seja consultada com credencial de produção.

## 8. Observabilidade

Eventos estruturados mínimos:

- `payments.account_overview_started`
- `payments.account_overview_provider_completed`
- `payments.account_overview_completed`
- `payments.account_overview_failed`

Campos permitidos: `requestId`, `userId` (ou hash/ID interno), `teacherId`, `paymentAccountId`, ambiente, duração, status e contagens.

## 9. TDD e matriz de testes

### Provider/cliente Asaas

1. Normaliza saldo decimal para centavos.
2. Normaliza lista de cobranças confirmadas do mês.
3. Soma/retorna pendências sem arredondamento incorreto.
4. Conta transferências `PENDING`/`IN_PROGRESS` e ignora `DONE`/`CANCELLED`.
5. Envia a credencial correta e o ambiente correto.
6. Aplica timeout e converte timeout em erro de provedor normalizado.
7. Não inclui API key em erro, retorno ou log.
8. Trata resposta incompleta do Asaas como indisponibilidade controlada.

### Serviço/controller

1. Professor com conta aprovada recebe conta + métricas.
2. Professor sem conta recebe `404`.
3. Usuário aluno recebe `403`.
4. Sessão ausente recebe `401`.
5. Conta pendente retorna estado local e `metrics: null`.
6. Falha Asaas retorna `502` sem expor detalhes sensíveis.
7. A consulta sempre usa a conta pertencente ao usuário autenticado.
8. `dashboardUrl` vem apenas de configuração confiável.

### Frontend

1. Renderiza skeleton enquanto carrega.
2. Renderiza quatro KPIs em centavos formatados em BRL.
3. Exibe “Indisponível” sem inventar zero quando métricas são nulas.
4. Exibe CTA correto somente quando existe URL válida.
5. Mostra estado de conta pendente/rejeitada.
6. Mostra erro transitório com ação de tentar novamente.
7. Não dispara chamadas duplicadas ao recarregar a tela.
8. Não exibe API key, CPF completo ou dados bancários.
9. Abre o painel externo com `noopener`/`noreferrer`.
10. Mantém layout responsivo e contraste acessível no banner azul.

### Integração

1. Conta aprovada + provider fake retorna os quatro KPIs esperados.
2. Provider indisponível mantém a tela utilizável com métricas nulas.
3. Mudança de ambiente não mistura sandbox e produção.
4. Requisição de outro professor não encontra a conta.
5. Webhook de status posterior não quebra a consulta de overview.

## 10. Critérios de aceite

- O professor aprovado vê o banner azul, status e CTA funcional para o painel Asaas.
- Os quatro KPIs vêm do provider/backend, sem mocks ou valores hardcoded.
- A API key nunca chega ao browser nem aparece nos logs.
- Conta pendente, rejeitada, inexistente e Asaas indisponível têm estados visíveis e não quebram a página.
- A suíte TDD cobre os casos listados e typechecks de backend/frontend passam.
