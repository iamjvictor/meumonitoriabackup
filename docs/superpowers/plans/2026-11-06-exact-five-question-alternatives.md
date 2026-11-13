# Guardrail para cinco alternativas — Plano de implementação

> **Para agentes implementadores:** seguir TDD: teste falhando antes da implementação, depois correção mínima e nova verificação.

**Objetivo:** fazer a extração e o grafo entregarem somente questões com cinco alternativas finais A–E, preservando afirmações no enunciado.

**Arquitetura:** o extrator instrui e limita a estrutura de opções; o revisor detecta listas diferentes de A–E; o agente de alternativas reconstrói o conjunto final a partir da fonte/contexto. A validação final bloqueia `ready` se o conjunto permanecer inválido.

**Stack:** TypeScript, Zod, OpenRouter JSON Schema, LangGraph e testes `node:test` existentes.

**Spec:** `docs/superpowers/specs/2026-11-06-exact-five-question-alternatives-design.md` e critérios AC-004/006/014 em `specs/2026-11-06-langgraph-questoes/spec.md`.

## Restrições globais

- Não alterar o schema Prisma de `Question` nem o formato persistido `{label,text}`.
- Afirmações/tópicos/itens I, II, III permanecem no enunciado; opções finais são exatamente A–E.
- O extrator não inventa opções que não reconheça; o agente de alternativas pode completar após consultar o contexto.
- O estado permanece pendente se ainda não houver cinco alternativas válidas.

## Foco de revisão

- A, B, C, D, E, F no extrator: teste que restringe saída e não perde o enunciado.
- A–H com afirmações indevidamente extraídas como opções: teste que encaminha reparo e conserva afirmações no statement.
- Rótulos duplicados, ausentes ou vazios: teste que impede prontidão sem conjunto completo.
- Questão discursiva sem alternativas: teste que permite geração de A–E.
- Resposta incompatível com alternativas finais: teste que impede `ready` após reparo.

## Tarefa 1: Guardrail no extrator estruturado

**Arquivos:** `backend/src/worker/services/structured-question-extraction.service.ts` e `backend/src/worker/services/__tests__/structured-question-extraction.service.test.ts`.

- [ ] Criar teste para prompt/schema: máximo de cinco alternativas, rótulos A–E e orientação que afirmações I/II/III são texto do enunciado; testar rejeição local para rótulo fora de A–E ou repetido.
- [ ] Executar o teste e confirmar falha esperada antes de alterar produção.
- [ ] Atualizar schema/prompt e validação Zod mantendo alternativas incompletas representáveis para reparo posterior.
- [ ] Executar os testes do serviço de extração.

## Tarefa 2: Roteamento e agente para conjunto final

**Arquivos:** `backend/src/worker/services/question-graph/reviewer.ts`, `alternatives.agent.ts`, `state.ts`, e testes correspondentes em `question-graph/__tests__/`.

- [ ] Criar teste para A–H, incluindo afirmações no enunciado, demonstrando que o revisor chama alternativas e não marca `ready`.
- [ ] Criar teste de reparo confirmando que a saída final possui exatamente A–E, preserva opções sustentadas pelo contexto e mantém o gabarito compatível.
- [ ] Executar os testes e confirmar falhas esperadas.
- [ ] Alterar decisão/estado e contrato estruturado do agente para receber a lista inteira e produzir lista final A–E, em vez de apenas anexar rótulos faltantes.
- [ ] Impedir `ready` para contagem excedente, faltante, rótulos duplicados/fora do conjunto ou textos vazios.
- [ ] Executar os testes dos agentes e do fluxo revisor.

## Tarefa 3: Regressão com fixture IFF

**Arquivos:** `backend/src/worker/services/question-graph/__tests__/` e saída local em `dbtemp/artifacts/question-reviewer-full-pdfs/`.

- [ ] Cobrir as questões 1, 28 e 33 do JSON IFF: respectivamente 6, 8 e 6 alternativas na saída anterior; Q28 contém três afirmações indevidamente interpretadas como opções.
- [ ] Verificar com uma chamada real de modelo se todas viram exatamente A–E, sem mover as afirmações do statement para as opções.
- [ ] Registrar saída, tempo e tokens; manter `persisted: false`.

## Verificação final

- [ ] Executar a bateria focada de `openrouter.client` e `question-graph`.
- [ ] Executar `npx tsc --noEmit` no backend.
- [ ] Conferir que os outputs em IFF têm exatamente cinco opções por questão e que somente itens completos podem ficar `ready`.
