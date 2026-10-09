# Simulados Semanais Personalizados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement one asynchronous personalized simulation per student, monitor and weekly cycle, using up to 30 approved questions based on question and flashcard performance.

**Architecture:** The student requests generation; the backend creates an idempotent job; the worker calculates the diagnostic, distributes slots and stores an immutable simulation. The frontend follows status, supports solving/resuming and shows results.

**Tech Stack:** PostgreSQL/Prisma, Fastify, BullMQ/Redis, TypeScript, Next.js/React.

**Spec:** `docs/superpowers/specs/2026-09-09-weekly-simulation-design.md`

## Global Constraints

- Use only approved existing questions; never generate questions with AI.
- Use `America/Sao_Paulo` for weekly cycle boundaries.
- Allow one simulation per student, monitor and cycle.
- Block a new cycle while the previous simulation is incomplete.
- Keep the generated simulation immutable.

## Ordem geral

1. Dados
2. Backend
3. Frontend
4. Testes integrados e validação final

# 1. Dados

## Fase D1 — Schema ✅

- Criar weekly_simulations.
- Criar weekly_simulation_items.
- Adicionar enums de status e prioridade.
- Criar relações com aluno, monitor, questão e tentativa.
- Garantir unicidade por aluno/monitor/ciclo.
- Garantir que uma questão não se repita no mesmo simulado.

Entrega: schema Prisma atualizado e migration criada.

## Fase D2 — Desempenho ✅

- Reutilizar student_question_attempts com mode SIMULATED.
- Reutilizar student_flashcard_review_logs.
- Adicionar índices para aluno, monitor e janela temporal.
- Definir referência entre item do simulado e tentativa.

Entrega: consultas eficientes e histórico preservado.

## Fase D3 — Validação ✅

- Testar constraints de unicidade.
- Testar migration em banco limpo.
- Testar preservação de questões e tentativas.
- Validar geração com 30, menos de 30 e zero questões.

Entrega: camada de dados pronta para o backend.

# 2. Backend

## Fase B1 — Ciclo e domínio ✅

- Criar módulo weekly-simulations.
- Calcular a última sexta-feira às 00h em America/Sao_Paulo.
- Implementar bloqueio por simulado anterior incompleto.
- Implementar estados do simulado.
- Criar contratos de serviço e repositórios.

Entrega: regras de ciclo testadas sem dependência de HTTP.

## Fase B2 — Diagnóstico ✅

- Agregar tentativas de questões desde a última sexta.
- Agregar avaliações de flashcards por tópico.
- Aplicar pesos de questões e flashcards.
- Calcular dificuldade por tópico.
- Aplicar suavização para poucos dados.
- Criar snapshot versionado do diagnóstico.

Entrega: diagnóstico reproduzível e auditável.

## Fase B3 — Distribuição ✅

- Reservar uma questão por tópico disponível.
- Distribuir vagas restantes pela dificuldade.
- Aplicar maiores sobras.
- Redistribuir vagas quando um tópico esgotar questões.
- Priorizar questões inéditas, depois erradas, depois acertadas.
- Nunca repetir questão no mesmo simulado.
- Usar todas as disponíveis quando houver menos de 30.

Entrega: algoritmo de seleção coberto por testes unitários.

## Fase B4 — Geração assíncrona ✅

- Criar job idempotente por aluno/monitor/ciclo.
- Criar endpoint de solicitação.
- Processar geração no worker.
- Persistir simulado, itens e snapshot em transação.
- Implementar retry e estado FAILED.
- Não consumir o ciclo quando não houver questões.

Entrega: simulado gerado sem bloquear a requisição HTTP.

## Fase B5 — Resolução e resultado ✅

- Criar endpoint para consultar simulado.
- Criar endpoint para responder item.
- Calcular acerto no backend.
- Persistir tentativa SIMULATED.
- Impedir duas respostas no mesmo item.
- Atualizar progresso e concluir automaticamente.
- Criar endpoint de resultado por matéria e tópico.
- Não expor resposta correta antes do envio.

Entrega: fluxo backend completo de geração até resultado.

## Fase B6 — Segurança e observabilidade ✅

- Validar acesso do aluno ao monitor.
- Aplicar idempotência em geração e respostas.
- Registrar request, job, ciclo, status e duração.
- Evitar dados sensíveis nos logs.
- Testar concorrência, autorização e retries.

Entrega: backend pronto para integração com frontend.

# 3. Frontend

## Fase F1 — Estado por monitor ✅

- Consumir o status semanal do backend.
- Exibir ações para cada estado.
- Mostrar Gerar simulado apenas quando permitido.
- Mostrar Continuar simulado anterior quando bloqueado.
- Mostrar Ver resultado após conclusão.

Entrega: botão controlado pelo estado real do backend.

## Fase F2 — Geração ✅

- Disparar solicitação assíncrona.
- Desabilitar cliques duplicados.
- Exibir Preparando simulado.
- Fazer polling ou revalidação controlada.
- Navegar quando estiver pronto.
- Permitir nova tentativa após falha.

Entrega: fluxo de geração assíncrona funcionando.

## Fase F3 — Resolução ✅

- Criar tela de questões.
- Exibir progresso e posição.
- Permitir avançar, voltar e pausar.
- Persistir cada resposta.
- Retomar após reload.
- Tratar falhas de rede sem perder resposta.
- Suportar quantidade menor que 30.

Entrega: aluno consegue concluir o simulado com segurança.

## Fase F4 — Resultado ✅

- Exibir nota, acertos e erros.
- Exibir desempenho por matéria e tópico.
- Exibir tópicos prioritários.
- Informar quando foram usadas menos de 30 questões.
- Informar que o resultado influenciará o próximo ciclo.

Entrega: relatório pós-simulado funcional.

## Fase F5 — Qualidade visual ✅

- Garantir responsividade desktop/mobile.
- Adicionar estados de loading e erro acessíveis.
- Garantir navegação por teclado.
- Validar foco após ações.
- Remover mocks do fluxo real.

Entrega: experiência pronta para validação de produto.

# 4. Validação final

- Rodar testes unitários de dados, diagnóstico e distribuição.
- Rodar testes de API e concorrência.
- Rodar testes de frontend.
- Validar fluxo manual com aluno sem dados, aluno com dados de questões, aluno com dados de flashcards, menos de 30 questões, simulado incompleto na sexta seguinte, falha/retry e dois cliques simultâneos.
- Executar typecheck, lint e build de backend e frontend.
