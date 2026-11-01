# Materialização assíncrona do acervo — Plano de implementação

> **Para agentes:** executar este plano etapa por etapa, com testes focados antes de avançar. A spec aprovada está em `docs/superpowers/specs/2026-10-20-question-bank-materialization-background-design.md`.

**Objetivo:** criar o monitor e navegar ao workspace sem aguardar a cópia das questões, exibindo progresso persistido e permitindo retry seguro.

**Arquitetura:** gravar um registro durável de execução na transação que cria monitor e seleções; publicar somente seu ID em fila BullMQ; worker recuperável processa usando a lógica existente e persiste checkpoints; endpoints autenticados fornecem estado e retry; workspace consulta estado e atualiza questões ao concluir. Redis guarda somente jobs ativos/retryáveis; resultados terminais permanecem no banco.

**Stack:** Fastify, Prisma/PostgreSQL, BullMQ/ioredis, Next.js/React, Node test runner com `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-20-question-bank-materialization-background-design.md`

## Restrições globais

- Preservar mudanças locais existentes; em particular, não substituir o diff local de `MonitorWorkspace.tsx` nem de `UploadConfirmationModal.tsx`.
- O total informado pelo frontend é somente apresentação; o worker deriva a seleção e o total elegível do banco.
- Manter `sourceKey` atual como idempotência e limitar a mudança assíncrona à criação inicial.
- Cada etapa termina com seus testes focados e relatório antes de seguir para a próxima.
- Não limpar jobs ativos, em espera ou em backoff. Limpar somente após persistir resultado terminal no banco.

## Etapa 1 — Registro durável, criação transacional e contrato de status

1. Escrever primeiro testes para criação com/sem seleções e para persistência atômica do run com a árvore do monitor; verificar que o retorno não chama mais a materialização síncrona.
2. Adicionar enum/model Prisma para run, contagens, timestamps, tentativas e erro resumido; criar migration e validar schema.
3. Alterar `MonitorRepository.createDraft` para aceitar/persistir o total selecionado e criar o run na mesma transação das seleções. Sem seleção, não criar run.
4. Adicionar consultas/repository para buscar run por monitor e professor, atualizar estado/progresso e reservar retry sem concorrência.
5. Adicionar testes de propriedade/autorização e endpoints GET de status e POST de retry em `monitor.controller.ts` e `monitor.routes.ts`.

**Verificação:** testes focados de `monitor.service.materialization.test.ts`, novos testes do repository/controller; `npm run prisma:validate`; migration/schema gerados sem tocar dados remotos.

## Etapa 2 — Fila, worker, recuperação e limpeza terminal

1. Escrever testes unitários de enqueue idempotente, tentativas/backoff, recuperação de runs `QUEUED`/`RETRYING` e política de remoção terminal.
2. Criar `question-bank-materialization.queue.ts` com payload contendo somente `runId` e identificador de job controlado por tentativa.
3. Implementar worker service para carregar run e seleções do banco, executar materialização existente, registrar total elegível e checkpoints, traduzir falhas parciais para conclusão com ressalvas e falhas transitórias para retry.
4. Integrar worker em `backend/src/worker.ts` e adicionar recovery no startup e em intervalo, seguindo os padrões de conexão e shutdown já usados pelos workers.
5. Persistir estado terminal e contagens antes de remover job do Redis. Em `FAILED` final, remover também; não reter job terminado no Redis. Garantir que falha ao publicar não invalida a criação do monitor.
6. Cobrir retry manual: novo job após falha final, sem corrida com job ativo e sem duplicar questões via `sourceKey`.

**Verificação:** testes de fila/worker/recovery/retry/limpeza, testes de materialização existentes e `npm run typecheck` do backend.

## Etapa 3 — Criação rápida e API tipada no frontend

1. Escrever teste de contrato para mapear resumo `materialization` da criação e resposta de status.
2. Enviar `totalSelectedQuestionsCount` calculado pelo catálogo junto ao draft; refletir run/status retornado em `TeacherMonitorService` sem aguardar a importação.
3. Adicionar chamadas tipadas de status e retry com tratamento de sessão/erros existente.
4. Confirmar que `handleMonitorCreated` navega imediatamente após a resposta curta da API.

**Verificação:** testes/contratos de frontend disponíveis para serviços e assistente, além de `npm run typecheck` na pasta frontend.

## Etapa 4 — Progresso e atualização no workspace

1. Escrever testes de renderização/contrato para estados sem run, fila, processamento, retry, concluído, concluído com ressalvas e falha final.
2. Adicionar componente de progresso ligado ao monitor/run, com barra acessível, contagens, percentual e mensagem; usar total selecionado como estimativa até o worker registrar o total efetivo.
3. Consultar status ao abrir o workspace e periodicamente apenas nos estados ativos; cancelar consulta ao desmontar ou ao entrar em estado terminal.
4. Ao concluir, atualizar questões e contadores sem recarga; na falha final, mostrar ação de retry e retomar polling ao aceitar.
5. Integrar ao workspace sem interferir na seleção de matéria/tópico e nos bloqueios já existentes das abas.

**Verificação:** testes focados de componente/serviço, typecheck frontend e revisão visual/funcional no workspace.

## Etapa 5 — Verificação integrada e memória da fila

1. Executar a suíte focada de todo o fluxo: criação, autorização, recuperação, retry, progresso, conclusão e limpeza Redis.
2. Executar typechecks backend/frontend e testes de contrato diretamente relacionados; não rodar testes alheios ao escopo.
3. Confirmar em teste com Redis que `completed` e `failed` terminais não deixam jobs/payloads, enquanto jobs ativos e com retry permanecem disponíveis.
4. Revisar `git diff --check` e o diff completo para garantir que mudanças locais preexistentes continuam preservadas.

## Revisão

- O contrato e a política de limpeza permanecem alinhados à spec aprovada.
- A cada etapa, comunicar arquivos e comportamento mudados, comando de teste e resultado antes de prosseguir.
- Não considerar a feature pronta enquanto o fluxo integrado e a limpeza da memória da fila não estiverem verificados.
