# Otimização Redis — plano de implementação

> Para execução: usar o fluxo de agentes do repositório, com implementadores delimitados e revisão QA independente.

**Objetivo:** reduzir chamadas recorrentes e retirar Redis do cache público preservando segurança de filas.

**Arquitetura:** configurar tempos de worker e heartbeat de forma validada; compartilhar um cache LRU em memória por processo da API; verificar integração e medir consumo. TypeScript, BullMQ 6.3.9 local, ioredis, node:test e Redis isolado.

**Spec:** `specs/2026-11-07-otimizacao-redis/spec.md`.

## Restrições globais
Preservar alterações preexistentes; nenhuma limpeza de filas, migration, commit ou deploy sem autorização. Não apontar testes destrutivos a Redis compartilhado. Documentar lacunas de infraestrutura. Valores em AC prevalecem. Verificar instruções locais antes de editar.

## Foco de revisão
1. Alteração de perfil enquanto uma leitura antiga está em andamento: nunca repovoar valor antigo no mesmo processo (T3).
2. Conexão bloqueante interrompida após longo tempo: reconectar e receber job (T1/T4).
3. Job de pagamento repetido após queda: efeito único com idempotência existente (T4).
4. TTL e falhas parciais do heartbeat: endpoint não anuncia disponibilidade indefinidamente (T2).
5. TTL, expulsão e duas instâncias: cache limitado e janela aceita de desatualização (T3).

## T1 — Opções das filas (AC-001 a AC-009, AC-014)
**Arquivos:** `backend/src/config/env.ts`, `backend/.env.example`, `backend/src/worker/worker-options.ts`, `backend/src/worker.ts`, `backend/src/worker/__tests__/worker-options.test.ts`, `backend/docs/fila.md`. Arquivos compartilhados em alterações preexistentes: preservar diff e executar sequencialmente com qualquer outro pacote que os toque.

**Contrato:** `createQueueWorkerOptions(connection, concurrency, queueKind, config)` com `queueKind: 'documents' | 'weeklySimulation' | 'paymentWebhook' | 'questionBankMaterialization'`; `config` contém `drainDelaySeconds` e `stalledIntervalOverrideMs?`. Aplicar defaults/validação no schema central de ambiente. A função pura retorna opções BullMQ; chamada em cada uma das quatro construções no worker. Não alterar políticas das filas.

- [ ] Escrever testes para quatro categorias, 300 s, 300000/600000 ms, override de 300000 e preservação de concorrência/conexão; verificar falha antes da mudança.
- [ ] Implementar configuração validada e ligação explícita por fila; não alterar opções de retry nem lock.
- [ ] Executar `cd backend && node --import tsx --test src/worker/__tests__/worker-options.test.ts` e `npm run typecheck`.
- [ ] Atualizar `backend/docs/fila.md` e `.env.example` com defaults, unidades e rollback; documentar que 300 s depende de validação operacional.

## T2 — Heartbeat (AC-010 a AC-014)
**Arquivos:** `backend/src/health/worker-health.ts`, `backend/src/health/__tests__/worker-health.test.ts`, `backend/src/config/env.ts`, `backend/.env.example`, `backend/src/worker.ts`, `backend/docs/fila.md`. Executar após T1 devido aos arquivos comuns.

**Contrato:** `startWorkerHeartbeat(redis, intervalMs, ttlSeconds)` recebe valores explícitos de configuração; `getWorkerHealth` e HTTP preservados. Validação cruza TTL em segundos com intervalo em milissegundos. Não registrar credenciais.

- [ ] Criar testes de publicação imediata, configuração 120000/300, controle de timer, parada e falha, além dos estados HTTP existentes; executar e observar falha inicial.
- [ ] Implementar parâmetros e validação, passar configuração em `worker.ts`; assegurar `timer.unref()` e tratamento de erro existentes.
- [ ] Executar `cd backend && node --import tsx --test src/health/__tests__/worker-health.test.ts` e `npm run typecheck`; registrar prazo de expiração e diferença entre `/health` e `/health/worker`.

## T3 — Cache público local (AC-015 a AC-021)
**Arquivos:** `backend/src/cache/public-teacher-profile.cache.ts`, `backend/src/cache/__tests__/public-teacher-profile.cache.test.ts`, `backend/src/routes/teacher.routes.ts`, `backend/src/routes/monitor.routes.ts`, `backend/src/services/teacher.service.ts`, `backend/src/services/monitor.service.ts`, `backend/src/services/__tests__/teacher.service.cache.test.ts`, testes QA próprios para concorrência e invalidação.

**Contrato:** instância única por processo exportada pelo módulo, interface assíncrona `get<T>(slug): Promise<T | null>`, `set(slug, profile): Promise<void>`, `invalidate(slug): Promise<void>`; TTL absoluto 60000 ms, 1000 entradas LRU, relógio injetável para testes. Para evitar escrita obsoleta em consulta concorrente, definir operação de preenchimento com geração por slug (`read generation` antes da consulta e `set` apenas se não mudou); manter gerações limitadas ou liberadas com segurança após leituras em curso. Um singleton deve ser fornecido a ambos serviços, inclusive atualização de slug antigo/novo.

- [ ] Escrever testes falhos para primeiro acesso/banco, hit sem banco, expiração, LRU, invalidação das duas rotas, mudanças de slug, duas instâncias, leitura em voo invalidada, erro de banco e perfil inexistente.
- [ ] Implementar cache local e proteção de geração; preservar tratamento de erros e formato de resposta; não cachear `null` nem rejeições.
- [ ] Substituir fábricas independentes por singleton compartilhado; ajustar logs que indicam Redis, manter eventos úteis; assegurar que nenhuma conexão Redis seja criada por esse módulo.
- [ ] Executar `cd backend && node --import tsx --test src/cache/__tests__/public-teacher-profile.cache.test.ts src/services/__tests__/teacher.service.cache.test.ts` e `npm run typecheck`.

## T4 — Integração e QA independente (AC-002 a AC-005, AC-007, AC-008, AC-011, AC-017 a AC-024)
**Arquivos QA exclusivos:** `backend/src/worker/__tests__/redis-optimization.integration.qa.test.ts`, `backend/src/cache/__tests__/public-teacher-profile.qa.test.ts`, `specs/2026-11-07-otimizacao-redis/test-plan.md`, `specs/2026-11-07-otimizacao-redis/validation.md`. QA não modifica produção.

- [ ] Levantar baseline somente leitura: versão efetivamente implantada, réplicas, ambientes, polling, comandos e delayed jobs; sem acesso registrar lacuna.
- [ ] Testar com Redis explicitamente isolado: namespace de teste aleatório, sem FLUSHDB/remoção de chaves alheias, cleanup apenas de recursos criados; fila imediata, delayed, retry, queda e reconexão. Falta de Redis isolado deve resultar em lacuna explícita, não aprovação.
- [ ] Verificar idempotência de pagamento com testes existentes e cenário independente com sandbox isolado; sem credenciais ou infraestrutura, marcar AC-008 pendente.
- [ ] Medir janelas equivalentes de comandos no Upstash homologado, sem carga real e sem registrar segredos. Medição de produção exige implantação autorizada; registrar pré/pós e limitações.
- [ ] Rodar testes direcionados de T1–T3, testes QA, `npm run typecheck` em backend; revisar diff preservando edições preexistentes e atualizar matriz.
- [ ] Entregar procedimento de rollout e rollback: primeiro filas/heartbeat, observar; depois cache; sem deploy automático.

## Observações operacionais
Fila de pagamentos tem prioridade de recuperação; não prometer HA com uma réplica. Alerta de atraso de jobs entra como requisito operacional de observabilidade a especificar após identificação de ferramenta: não adicionar polling Redis não medido neste pacote. Não alegar que 300 s garante redução exata ou compatibilidade até ensaio com Upstash.
