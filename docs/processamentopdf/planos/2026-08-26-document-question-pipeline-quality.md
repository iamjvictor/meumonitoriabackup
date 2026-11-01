# Document Question Pipeline Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aumentar a recuperação e a completude das questões extraídas sem perder validação, contexto ou rastreabilidade.

**Architecture:** Corrigir os contratos nas bordas do pipeline, tornar a promoção de candidatas orientada por evidência, e separar fallbacks de tópico/conclusão do caminho crítico. Cada mudança será isolada por testes e logs agregados.

**Tech Stack:** TypeScript, Node.js, Prisma/Postgres, Docling HTTP, Zod, OpenRouter, Node test runner.

**Spec:** `docs/processamentopdf/specs/2026-08-26-document-question-pipeline-quality-design.md`

## Global Constraints

- `REVIEW_REQUIRED`/`PENDING_REVIEW` é revisão humana normal, não falha.
- Não apagar o PDF original nem remover rastreabilidade de fonte.
- Toda alteração comportamental deve ter teste antes da implementação.
- Falhas não recuperáveis devem permanecer bloqueadas.
- Subagentes: priorizar `gpt-5.4-mini`, `reasoning_effort: low`; fallback `gpt-5.6-luna`, `reasoning_effort: low`.

### Task 1: Promoção de candidatas orientada por contexto

**Files:** `backend/src/worker/services/question-extraction.service.ts`, testes existentes do serviço.

- [ ] Escrever testes para promover continuações e blocos com alternativas ausentes quando houver evidência contextual.
- [ ] Executar os testes e confirmar falha.
- [ ] Implementar a regra mínima, preservando bloqueios irrecuperáveis.
- [ ] Executar testes focados e typecheck.

### Task 2: Fallback de tópico e status de operação

**Files:** serviços de classificação de blocos/questões, persistência de questões e testes correspondentes.

- [ ] Escrever testes para aplicar fallback quando o classificador falhar ou não retornar tópico principal.
- [ ] Executar os testes e confirmar falha.
- [ ] Implementar fallback e impedir que classificação não bloqueante produza `PARTIAL_SUCCESS` indevido.
- [ ] Executar testes focados.

### Task 3: Conclusão estruturada de gabarito e explicação

**Files:** serviços em `backend/src/worker/services/completeQuestion/`, cliente OpenRouter e testes.

- [ ] Escrever testes para resposta vazia, truncada, schema inválido e geração independente de gabarito/explicação.
- [ ] Executar os testes e confirmar falha.
- [ ] Implementar prompts compactos, fallback por tarefa e validação matemática/estrutural.
- [ ] Executar testes focados e typecheck.

### Task 4: Normalização resiliente do layout Docling

**Files:** adapter/orchestrator e schemas/normalizers de layout em `backend/src/worker/services/document-parser/`, testes de contrato.

- [ ] Escrever testes para formatos de bbox do Docling e elemento inválido isolado.
- [ ] Executar os testes e confirmar falha.
- [ ] Implementar normalização tolerante com evento de degradação.
- [ ] Executar contrato do parser e testes focados.

### Task 5: Telemetria e resumo de qualidade

**Files:** serviços de ingestão/extraction/classification e testes de logs/resumo.

- [ ] Escrever testes para contagens agregadas e motivos de retenção.
- [ ] Executar os testes e confirmar falha.
- [ ] Implementar resumo por documento e classificação consistente de erro versus revisão normal.
- [ ] Executar testes focados.

### Task 6: Verificação integrada

- [ ] Executar todos os testes backend relevantes.
- [ ] Executar typecheck e contratos de document parser.
- [ ] Revisar diff e consultar o documento de teste no Supabase.
- [ ] Reprocessar o PDF e comparar baseline: questões completas, incompletas, retidas e fallbacks.

