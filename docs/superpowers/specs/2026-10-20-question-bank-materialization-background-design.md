# Materialização assíncrona do acervo na criação do monitor

**Status:** proposta para revisão

**Data:** 2026-10-20

## Problema

Ao criar um monitor com seleções do banco de questões, `MonitorService.createDraft` persiste o monitor e as seleções e, em seguida, aguarda `QuestionBankMaterializationService.materialize`. A materialização consulta os itens selecionados e percorre cada questão sequencialmente para validar e persistir a cópia associada ao monitor. O endpoint `POST /api/v1/monitors` só responde depois dessa operação.

No frontend, `TeacherMonitorCreationModal.saveDraft` aguarda `TeacherMonitorService.createDraft`, e `TeacherDashboardOverview.handleMonitorCreated` só atualiza a navegação após essa promessa terminar. Por isso, a etapa final fica em “Salvando...” enquanto todas as questões são importadas.

Referências do comportamento atual:

- `backend/src/services/monitor.service.ts` — criação e chamada síncrona da materialização.
- `backend/src/modules/question-bank/services/question-bank-materialization.service.ts` — validação, idempotência e persistência por questão.
- `frontend/src/modules/teacher/components/TeacherMonitorCreationModal.tsx` — submissão do rascunho.
- `frontend/src/modules/teacher/components/TeacherDashboardOverview.tsx` — espera a resposta antes de navegar.
- `frontend/src/modules/teacher/components/TeacherMonitorCreationModal.tsx` e `frontend/src/modules/teacher/components/question-bank-catalog.ts` — total de questões selecionadas no catálogo.

## Objetivo

Criar e abrir o monitor sem esperar a cópia das questões do acervo. A importação continua em segundo plano, com progresso persistente e visível no workspace do monitor.

## Experiência esperada

1. Na revisão final do assistente, exibir o total de questões selecionadas no catálogo.
2. Ao confirmar, persistir monitor, estrutura, seleções e um registro de materialização pendente.
3. Responder à criação assim que o trabalho for registrado e encaminhado, sem esperar a importação das questões.
4. Navegar para o workspace normalmente.
5. Enquanto a importação estiver ativa, exibir uma barra com questões processadas e o total, por exemplo, “32 de 240 questões”.
6. Atualizar a barra ao consultar o progresso persistido, inclusive depois de recarregar ou reabrir o workspace.
7. Ao concluir, mostrar o resultado final. Se houver itens ignorados ou falhas por item, mostrar a quantidade e sinalizar conclusão com ressalvas. Se as tentativas se esgotarem, mostrar falha e permitir nova tentativa sem duplicar questões.
8. Se nenhuma questão tiver sido selecionada, não criar job nem mostrar a barra.

## Escopo

Inclui a materialização iniciada pela criação inicial do monitor no assistente, a fila, o worker, a persistência do progresso, um endpoint de status e a interface no workspace.

Não inclui tornar assíncrona a materialização acionada posteriormente por edição do monitor ou adição de matérias. Também não altera a seleção do catálogo, o conteúdo das questões, a revisão pedagógica nem o fluxo de publicação do monitor.

## Arquitetura proposta

### Registro durável

Adicionar um registro persistente de execução, por exemplo `QuestionBankMaterializationRun`, relacionado ao monitor. A criação desse registro deve ocorrer na mesma transação que cria o monitor e suas seleções. Assim, uma interrupção entre o commit do monitor e a publicação no Redis não perde a intenção de importar.

O registro deve expor, no mínimo:

- estado: `QUEUED`, `PROCESSING`, `RETRYING`, `COMPLETED`, `COMPLETED_WITH_WARNINGS` ou `FAILED`;
- total selecionado informado pelo assistente;
- total de itens elegíveis encontrado pelo worker;
- quantidade processada;
- quantidades criadas, atualizadas, ignoradas e com falha;
- número de tentativas, início, conclusão e mensagem de erro resumida.

O progresso considera processado cada item elegível que foi persistido ou deliberadamente ignorado após validação. O contador nunca deve ultrapassar o total efetivo encontrado pelo worker. O total selecionado pelo catálogo e o total efetivo ficam separados: o catálogo pode incluir itens arquivados, enquanto a consulta atual de materialização os exclui. A interface começa mostrando o total selecionado e passa a usar o total efetivo assim que o worker o descobrir.

### Fila e worker

Criar uma fila BullMQ específica para materialização, seguindo as convenções existentes em `backend/src/queues` e `backend/src/worker.ts`. O payload da fila deve apontar para o ID do registro persistido; o worker carrega monitor, seleções e estado do banco, em vez de depender de um payload grande ou não durável.

Depois do commit da transação, a API tenta enfileirar o registro e retorna o monitor sem aguardar o worker. Se a publicação falhar, o monitor ainda deve ser criado e o registro permanece `QUEUED`. O worker precisa recuperar registros pendentes na inicialização e em verificações periódicas, usando o ID do registro como chave idempotente na fila. Isso cobre indisponibilidade temporária do Redis e reinícios.

O worker reutiliza a lógica de validação e persistência de `QuestionBankMaterializationService`. O `sourceKey` atual, `question-bank:{monitorId}:{questionBankItemId}`, continua sendo a chave de idempotência para que retry não crie cópias duplicadas. O worker persiste o total efetivo após localizar os itens e atualiza o progresso em checkpoints durante a execução e ao concluir.

Falha transitória deve acionar as tentativas e o backoff da fila. A execução só passa a `FAILED` após esgotar as tentativas; erros parciais por item resultam em `COMPLETED_WITH_WARNINGS` com contagens finais. Jobs concluídos não são reexecutados por uma nova publicação da mesma chave.

Depois de persistir o estado terminal e as contagens no banco, remover jobs concluídos ou definitivamente falhos do Redis. A limpeza não pode remover jobs ativos, aguardando retry ou em backoff. O registro persistido é a fonte de verdade para a interface, histórico e retry manual; a fila não deve reter payloads ou resultados após a finalização.

### API

- `POST /api/v1/monitors` mantém autenticação e validações existentes, mas retorna após persistir o monitor, as seleções e o job pendente.
- A resposta inclui o monitor e um resumo do job (`id`, estado e total selecionado) quando houver seleções. Não inclui a lista de questões materializadas.
- Adicionar endpoint autenticado e autorizado pelo monitor para consultar o estado e as contagens da execução. O endpoint não expõe dados de outros professores.
- A consulta retorna um estado terminal mesmo após os dados do job BullMQ terem sido removidos; a fonte de verdade é o registro persistido.

### Interface

- A revisão final mantém visível o total selecionado no catálogo.
- Após a resposta de criação, o frontend navega sem aguardar a importação.
- O workspace consulta o endpoint de progresso enquanto o estado estiver `QUEUED`, `PROCESSING` ou `RETRYING`, e interrompe a consulta em estado terminal.
- A barra mostra progresso percentual, `processadas / total efetivo` e feedback textual para fila, processamento, retry, conclusão, conclusão com ressalvas e falha.
- Em `QUEUED`, antes de o worker descobrir o total efetivo, a interface mostra `0 / total selecionado` como estimativa identificada; não apresenta esse valor como total efetivamente importável.
- Ao concluir, atualizar as questões e os contadores do monitor sem exigir recarga manual. Em falha final, oferecer ação para solicitar retry da execução, protegida por autorização e idempotência.

## Segurança e consistência

- Toda consulta e ação de status/retry deve validar a propriedade do monitor pelo usuário autenticado.
- Seleções e monitor são a fonte de verdade para o worker; valores do cliente servem apenas como total selecionado exibido e não autorizam quais questões serão copiadas.
- Enfileirar novamente uma execução não pode criar cópias repetidas.
- Um retry manual não deve concorrer com uma execução já ativa.
- Jobs BullMQ concluídos ou definitivamente falhos são removidos do Redis depois de persistir o resultado terminal; o progresso e o resultado continuam consultáveis no banco.
- A criação do monitor não deve retornar erro de criação apenas porque Redis ficou indisponível depois do commit; o job persistido será recuperado.

## Observabilidade

Adicionar eventos estruturados para registro criado, enqueue concluído/falhou, worker iniciado, progresso atualizado, retry, conclusão e falha final. Os eventos devem incluir IDs do monitor e da execução e contagens, sem registrar conteúdo integral das questões.

## Critérios de aceite

1. A resposta de criação e a navegação não esperam a persistência de todas as questões selecionadas.
2. O total de questões selecionadas continua visível no resumo e serve como referência inicial do progresso.
3. O workspace apresenta progresso persistido e recupera o mesmo estado após recarregar a página.
4. O total efetivo e as contagens finais refletem itens criados, atualizados, ignorados e com falha.
5. Um job pendente sobrevive a reinícios do worker e a falhas temporárias de publicação no Redis.
6. Retry não duplica questões já materializadas.
7. A ausência de seleções não cria job.
8. Usuários não consultam nem repetem jobs de monitores alheios.
9. Ao terminar, o workspace atualiza a lista e o contador de questões sem recarga manual.

## Decisões para a revisão

- A barra de progresso aparece no workspace após a navegação, e o total selecionado continua no resumo final do assistente.
- A primeira versão cobre somente a criação inicial do monitor; materializações acionadas por edição ficam fora do escopo.
- O total informado pelo catálogo é exibido separadamente do total efetivo encontrado pelo worker, para representar corretamente itens arquivados ou inelegíveis.
