# Turmas patrocinadas: tratamento de erro da tela

> **For agentic workers:** execute the steps task by task and verify each acceptance criterion.

**Goal:** Corrigir a apresentação duplicada e pouco útil de falhas ao carregar a tela de turmas patrocinadas.

**Architecture:** Manter falhas independentes para monitores e histórico; consolidar falhas simultâneas em um aviso único, normalizar falhas 5xx e preservar compra quando só o histórico falhar.

**Tech Stack:** Next.js 16 Client Component, React, Vitest e Testing Library.

**Spec:** `specs/2026-11-01-ui-erro-turmas-patrocinadas/spec.md`

## Global Constraints

- Preservar os contratos de compra e autenticação atuais.
- Erros de validação continuam detalhados; erros internos são amigáveis.
- Falha de histórico não bloqueia nova compra se monitores estiverem disponíveis.

## Review Focus

- Duas chamadas de listagem falham ao mesmo tempo: só um aviso e uma ação de retry.
- Apenas histórico falha: formulário de compra continua funcional.
- Erros 5xx repetidos são normalizados e não revelam texto interno.

### Task 1: Estado de erro da tela patrocinada

**Files:**
- Modify: `frontend/src/modules/teacher/components/TeacherSponsoredClassesPage.tsx`
- Test: `frontend/tests/unit/TeacherSponsoredClassesPage.test.tsx`
- Test: `frontend/tests/unit/TeacherStorefrontAnnualPlan.test.tsx` (ajustar consulta para as ocorrências esperadas do preço anual)

- [x] Fixar teste de falha dupla: um único alerta amigável, sem texto técnico e com retry.
- [x] Executar teste relevante e confirmar a falha esperada antes de alterar o componente.
- [x] Consolidar alerta quando ambos endpoints falham; manter aviso contextual para falha parcial.
- [x] Corrigir expectativas ambíguas que falharam no teste completo sem reduzir cobertura.
- [x] Executar suítes unitárias e E2E do frontend e registrar resultado.
