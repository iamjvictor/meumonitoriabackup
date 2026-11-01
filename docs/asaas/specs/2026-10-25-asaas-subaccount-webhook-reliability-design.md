# Confiabilidade da subconta Asaas e do webhook de situação cadastral

## Objetivo

Garantir que uma subconta criada para um professor continue vinculada ao MeuMonitor e que cada mudança de situação cadastral recebida do Asaas seja aplicada uma vez, inclusive quando o evento chegar antes da gravação da conta local ou houver reinício do worker. A resposta HTTP ao Asaas deve ser `200` depois da persistência durável do evento, sem depender da conclusão do worker.

## Estado atual e falhas reproduzíveis

- `POST /teachers/me/payment-account` chama `POST /accounts`, confirma o webhook com a chave recém-retornada e só então grava `payment_accounts`, a credencial cifrada e o vínculo com o professor. Uma falha nessa confirmação pode deixar a subconta remota criada e invisível localmente.
- A inbox usa `UNIQUE(environment, provider_account_id, provider_event_id)`. `provider_account_id` fica nulo enquanto a subconta ainda não foi vinculada; no PostgreSQL, a restrição não deduplica duas linhas com esse campo nulo. Uma entrega posterior, já vinculada, também usa outra chave composta. O `eventId` do Asaas deve ser a identidade estável da entrega.
- A rotina de recuperação seleciona apenas `RECEIVED` e `FAILED`. `WAITING_CORRELATION` possui `nextAttemptAt`, mas não volta à fila nem pode ser reivindicado; `PROCESSING` com lease vencido também não é selecionado.
- Um evento `ACCOUNT_STATUS_*` sem ID de conta, ou com a dependência de contas ausente, pode ser marcado `ACCOUNT_STATUS_APPLIED` sem atualização de linha.
- O worker tem concorrência 4. Mesmo com envio sequencial pelo Asaas, a ordem de aplicação local precisa ser controlada. Hoje a atualização usa o horário de criação da linha da inbox e não protege o estado contra um evento antigo concluído por último.
- O script `asaas:webhook:test-account-approved` pode enviar uma aprovação sintética para qualquer URL configurada, inclusive a de produção.

## Contrato proposto

### Criação recuperável da subconta

1. Validar URL HTTPS do webhook, e-mail de alertas, token, ambiente e capacidade de cifrar a credencial **antes** de chamar `POST /accounts`. Ausência de configuração impede a chamada externa com erro explícito.
2. Serializar a criação por professor e ambiente, com registro de operação/idempotência local, para que dois pedidos concorrentes não criem duas subcontas. Não presumir que `POST /accounts` aceite uma chave de idempotência do Asaas sem confirmar a referência da API.
3. Após a resposta de `/accounts`, persistir ID, carteira, credencial cifrada e vínculo em uma transação. A etapa de confirmar/atualizar `/webhooks` deve ser retomável com a credencial armazenada; falha nela não pode fazer o professor repetir a criação da subconta. Registrar `webhookSyncState` separado do status cadastral (`PENDING`, `ACTIVE`, `FAILED`) e expor ao painel uma mensagem de configuração pendente sem revelar segredos.
4. Se a gravação local falhar após a criação remota, registrar uma operação de compensação sanitizada com `providerAccountId` e estado `RECONCILIATION_REQUIRED`. A próxima tentativa deve reconciliar a subconta criada antes de novo `POST /accounts`; não apagar nem recriar a conta remota automaticamente.
5. Manter a `apiKey` fora de JSON público, logs e fixtures gravadas. O teste usa uma credencial falsa para verificar cifragem e ausência de exposição.

### Entrada e processamento do webhook

1. Exigir `asaas-access-token` válido. Para payloads de status, exigir `id` do evento, `event` reconhecido e ID da conta em `account.id`, `accountId` ou no header aceito pela rota. Campos adicionais do Asaas não invalidam o payload.
2. Persistir o ID bruto da conta recebida em campo próprio (`sourceProviderAccountId`), ainda que a FK `providerAccountId` permaneça nula até existir `payment_accounts`. A identidade idempotente da inbox passa a ser `UNIQUE(environment, provider_event_id)`; não depende da FK. Em duplicata, retornar o registro existente e completar o vínculo quando possível.
3. Migrar dados existentes antes de criar o índice: identificar entregas repetidas pelo par ambiente/evento, preservar uma linha canônica e seu resultado, registrar divergências para revisão e só então impor a nova unicidade. O outbox continua emitindo uma vez por evento canônico.
4. Confirmar `HTTP 200` após a transação da inbox/outbox. Token inválido retorna `401`; payload inválido retorna `422`; falha na persistência retorna erro para permitir nova entrega do Asaas. Falha apenas no enqueue mantém o evento `RECEIVED` recuperável.
5. `WAITING_CORRELATION` torna-se recuperável quando `nextAttemptAt` vencer. `PROCESSING` com lease expirado também volta à fila. A reivindicação continua atômica, com limite de tentativas; após o limite, marcar estado terminal de atenção (`DEAD_LETTER` ou equivalente) e emitir alerta. Nenhuma varredura pode criar múltiplos efeitos para o mesmo evento.
6. Evento de status sem conta de origem nunca é marcado aplicado. Se a conta ainda não existe, aguardar correlação; se o ID continuar sem vínculo após o limite, manter o evento visível para reconciliação operacional.
7. Aplicar o snapshot `accountStatus` do Asaas quando presente; usar o tipo de evento como fallback para a dimensão informada. Usar `dateCreated` válido do provider como tempo do evento, com fallback explícito para a recepção. A gravação deve impedir regressão por eventos antigos **por dimensão** (geral, comercial, bancária, documentação); um evento novo de documentação não pode bloquear uma atualização geral válida. `APPROVED` geral é o único evento que confirma aprovação geral.
8. Logs estruturados registram `requestId`, `providerEventId`, `sourceProviderAccountId`, estado anterior/novo, tentativa, duração e código de erro. Não registram token, chave, CPF/CNPJ, payload integral nem dados bancários.

## Camada TDD e critérios de aceite

Escrever cada teste falhando antes da alteração correspondente. Os testes existentes que afirmam que `WAITING_CORRELATION` não é recuperável devem mudar para o novo contrato.

| Caso | Nível | Resultado exigido |
|---|---|---|
| Duas entregas com mesmo `id` antes do vínculo e outra após o vínculo | Integração PostgreSQL | Uma linha na inbox, um outbox, três respostas `200`, um efeito de status |
| Evento chega antes da gravação da subconta | Integração com worker | `WAITING_CORRELATION` volta após `nextAttemptAt` e termina aplicado após o vínculo |
| Worker encerra durante o processamento | Integração com Redis | Lease vencido é recuperado e o efeito ocorre uma vez |
| Redis indisponível ao receber o webhook | Integração | Inbox persiste e responde `200`; a recuperação enfileira depois |
| Token ausente/incorreto e payload de status sem conta | HTTP | `401`/`422`; nenhuma linha criada ou marcada aplicada |
| Aprovação e pendência chegam fora de ordem; dimensões distintas se intercalam | Repositório | Nenhuma dimensão regride; status geral acompanha o evento geral mais recente |
| Criação concorrente para o mesmo professor/ambiente | Integração | Uma chamada externa `POST /accounts` e uma conta local |
| `/accounts` teve sucesso, mas `/webhooks` falhou | Integração com provider falso | Conta/credencial permanecem vinculadas; sincronização é retomada sem novo `/accounts` |
| Persistência local falha após `/accounts` | Integração | Operação fica reconciliável e nova tentativa não cria conta remota duplicada |
| Tentativas de correlação esgotadas | Worker | Estado terminal visível e alerta, sem loop infinito |
| Uso do script de aprovação sintética com ambiente ou URL de produção | Teste do CLI | Sai antes de qualquer `fetch` |

## Arquivos e dados afetados

- `backend/src/modules/payments/application/commands/start-payment-account.use-case.ts`, provider, repositório da conta e contrato HTTP da conta.
- `backend/src/modules/payments/application/commands/accept-webhook.use-case.ts`, `process-webhook.use-case.ts`, `payment-recovery.job.ts`, `prisma-webhook.repository.ts` e worker.
- `backend/prisma/schema.prisma` e uma migração para identidade do evento, ID bruto de origem, progresso do webhook e estado de criação/reconciliação.
- `backend/src/scripts/test-asaas-account-status-webhook.ts` e seus testes; `frontend/src/modules/teacher/components/TeacherPaymentAccountPanel.tsx` para indicar sincronização pendente.

## Fora do escopo

- Aprovar uma conta real ou enviar documento real por código.
- Criar cobranças, splits, transferências ou liberar acesso de aluno.
- Tratar aprovação do Sandbox como aprovação regulatória em produção.

## Fontes oficiais

- [Eventos de situação da conta](https://docs.asaas.com/docs/account-status-events): `account.id`, `accountStatus`, idempotência e aprovação geral.
- [Recebimento de webhooks](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook): autenticação, persistência, `HTTP 200` e processamento assíncrono.
- [Idempotência de webhooks](https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks): deduplicação pelo `id` externo.
