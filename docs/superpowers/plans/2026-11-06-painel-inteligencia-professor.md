# Painel de Inteligência do Professor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar análises de desempenho para professoras em níveis geral, monitor e aluno, com autorização comprovável por professora.

**Architecture:** O backend adiciona consultas agregadas autenticadas sob `/api/v1/teachers/me/intelligence`, derivando a professora da sessão e validando a propriedade do monitor antes de qualquer agregado. O frontend acrescenta serviço e estados de navegação ao painel atual. Agregações serão feitas no Prisma/Postgres com paginação, sem transferir histórico bruto.

**Tech Stack:** Fastify, Prisma 7, PostgreSQL, TypeScript, Next.js 16, React, lucide-react, Node test runner e Vitest.

**Spec:** `specs/2026-11-06-painel-inteligencia-professor/spec.md`

## Global Constraints

- Todas as consultas derivam `teacherId` do usuário autenticado e restringem os monitores a `Monitor.teacherId`.
- Dados de aluno só entram no relatório quando associados ao monitor no escopo, conforme serviço/regras atuais de acesso.
- Tentativas usam `status = ACTIVE`; `DailyChallengeAttempt` não é uma segunda tentativa.
- Flashcard reviews contam como dias de prática e continuam métricas distintas de questões.
- Acurácia agregada é média das acurácias individuais; alunos sem tentativas ficam fora da média e são exibidos como “Sem dados”.
- Datas de atividade são agregadas em dias de `America/Sao_Paulo`; o período padrão é 30 dias.
- Lista de alunos deve ser paginada. Nada de histórico completo no cliente.

## Review Focus

- ID de monitor de outra professora: testar 404/403 sem dados agregados.
- ID de aluno de outro monitor/professora: testar resposta sem divulgação.
- Aluno com vários monitores e desafios diários: testar deduplicação na visão geral.
- Datas próximas à meia-noite UTC e tentativas repetidas: testar período local e denominadores.
- Tópicos sem amostra, aluno sem tentativas e falhas do banco: testar mensagens sem fabricar zero ou ranking.

---

### Task 1: Contratos, agregações e autorização no backend

**Arquivos:**
- Criar módulo de inteligência em `backend/src/modules/teacher-intelligence/` com schemas, serviço, repositório, controller e rotas.
- Modificar `backend/src/server.ts` para registrar rotas autenticadas sob `/api/v1/teachers/me/intelligence`.
- Criar testes de serviço/repositório/rotas em `backend/src/modules/teacher-intelligence/**/__tests__/`.

**Interfaces:**
- `GET /overview?period=7d|30d|90d|all` retorna métricas agregadas e cards por monitor.
- `GET /monitors/:monitorId?period=...&page=1&pageSize=20&search=&sort=name|accuracy|lastActivity` retorna métricas, tópicos e página de alunos.
- `GET /monitors/:monitorId/students/:studentId?period=...` retorna métricas individuais e agrupamentos por matéria/tópico.
- Todos os resultados identificam `period`, `generatedAt`, denominadores e `hasData`; percentuais são números 0–100 ou `null` quando sem amostra.

- [ ] Escrever testes falhos para acesso próprio, tentativa de ID de outro professor, média por aluno, aluno multi-monitor, desafio diário duplicado, paginação e tópicos com amostra mínima.
- [ ] Implementar resolução de professora e validação de propriedade antes das agregações, seguindo padrões de `teacher.routes.ts` e `teacher.controller.ts`.
- [ ] Implementar agregações sem contar `DailyChallengeAttempt` em duplicidade e sem multiplicar tentativas por `QuestionTopic`.
- [ ] Rodar testes isolados do módulo e cobrir endpoints com `app.inject`.

### Task 2: Serviço de API do frontend

**Arquivos:** criar `frontend/src/modules/teacher/services/TeacherIntelligenceService.ts` e testes Vitest correspondentes.

**Interfaces:** `getOverview`, `getMonitor(monitorId, options)` e `getStudent(monitorId, studentId, period)` retornam tipos explícitos e erros normalizados; requests incluem credenciais e respeitam URL de backend atual.

- [ ] Cobrir query params, paginação, credenciais e erros HTTP.
- [ ] Implementar os métodos e os tipos a partir dos contratos da Task 1.
- [ ] Rodar os testes unitários do serviço.

### Task 3: Visão geral, cards e navegação de drill-down

**Arquivos:** modificar `frontend/src/modules/teacher/components/TeacherDashboardOverview.tsx`; criar componentes focados em `frontend/src/modules/teacher/components/intelligence/`; atualizar testes existentes do dashboard.

**Interfaces:** selecionar “Painel de Inteligência” abre a visão geral; seleção do card abre o monitor; links de retorno preservam filtros.

- [ ] Cobrir indicadores, seletor de período, cartões de monitores, estados vazio/carregando/erro e navegação.
- [ ] Implementar médias, frequências e cards usando somente dados da API da professora atual.
- [ ] Garantir responsividade, foco visível e operação por teclado nos cards.
- [ ] Rodar testes de dashboard e lint/typecheck do frontend.

### Task 4: Detalhe do monitor, rankings e lista paginada

**Arquivos:** criar componentes de monitor em `frontend/src/modules/teacher/components/intelligence/`; ampliar serviço se preciso; atualizar testes de UI.

- [ ] Cobrir rankings com amostra insuficiente, busca, ordenação, paginação, aluno sem dados e abertura do aluno.
- [ ] Implementar métricas do monitor, dois rankings de tópicos sem sobreposição e lista paginada.
- [ ] Rodar testes unitários do detalhe e typecheck.

### Task 5: Detalhe do aluno e validação consolidada

**Arquivos:** criar componentes de aluno em `frontend/src/modules/teacher/components/intelligence/`; atualizar testes e `specs/2026-11-06-painel-inteligencia-professor/validation.md`.

- [ ] Cobrir métricas individuais, evolução no período, matérias/tópicos, flashcards separados e navegação de retorno.
- [ ] Implementar detalhe sem dados de outros monitores nem conversas privadas.
- [ ] Executar testes de autorização, agregação, serviço, telas e typecheck; registrar evidências por AC.
- [ ] Fazer revisão final de todas as consultas por `teacherId`, IDs manipulados, N+1 e limites da paginação.

## Pendências de produto antes de fechar critérios

As decisões listadas em “Decisões para revisão” na spec ainda não foram respondidas. Para começar a implementação, este plano adota provisoriamente as propostas da spec: acesso vigente, médias com peso igual por aluno, flashcards contando apenas para frequência, janela padrão de 30 dias, rankings de tópico com pelo menos 5 respostas e 2 alunos (5 respostas no detalhe individual), e toda tentativa válida conta. Confirmar ou alterar esses padrões antes de tratar os critérios como finais.
