# Tarefas

## Pacote 1 — logs de conteúdo controlados
- Critérios: AC-001 a AC-005
- Arquivos: `backend/src/config/env.ts`, `backend/src/worker/services/document-worker.service.ts`, `backend/src/worker/services/embedding.service.ts` e testes unitários correspondentes.
- Implementador: adicionar primeiro testes de regressão, confirmar falha, implementar logs gated e limite, executar testes específicos/typecheck.
- Limites: não logar conteúdo sem flag; não modificar comportamento do pipeline ou banco.

## Pacote 2 — revisão independente
- Critérios: AC-001 a AC-005
- Arquivos: revisão do diff e plano/relatório QA em `specs/2026-11-05-logs-conteudo-ocr/`.
- QA: verificar gating, truncamento, correspondência do texto com o payload de embeddings, e executar cenários independentes sem editar produção.
