# Pacotes

## Tarefa 1 — Runner de pipeline local (AC-001 a AC-004, AC-006)

- Objetivo: executar por código de teste os serviços reais de descrição/indexação visual e extração/completação de questões, em duas rodadas independentes por cada uma das quatro matrizes.
- Responsável: implementador Luna.
- Arquivos permitidos: `tests/model-comparison/runner/**`, `backend/test/e2e/**`, `backend/.env.test.*`, README de model-comparison. Não editar `backend/src/**`, migrations, `.env`, configurações de produção nem artefatos baseline.
- Dependências: snapshot existente `dbtemp/artifacts/9df3b11e-d426-4542-aa57-1d1982f17f01/question-origin-snapshot.json`, importador local, fixture de modelo visual e catálogo já criado.
- Limites: somente 127.0.0.1:56322 e Storage Supabase local. DB por teste+rodada. Não ler/escrever databases remotos. Identificar cada saída com `runId` e evitar compartilhar destinos. Reutilizar OCR, chunks e embeddings do snapshot. Nenhuma chamada de embedding/OCR deve regenerar vetores/texto. Nunca passar chaves a logs/relatórios.
- Verificação do implementador: testes fake para lifecycle e bloqueios; executar dry-run local antes de qualquer inferência. Cada chamada em produção do teste tem que capturar usage real ou registrar NAO_VERIFICADO. O executor autorizado pelo usuário em 2026-11-02 permite rodar os quatro experimentos depois de passar os preflights locais.

## Tarefa 2 — Relatório e comparação (AC-005, AC-007)

- Objetivo: adaptar o comparador para ler baseline Gemini já existente e duas rodadas efetivas de cada teste; comparar enunciados, alternativas, gabarito e explicação, knowledge visual, retries, tokens, custo, latência e variação entre rodadas.
- Responsável: sessão principal; delegar depois de fixar o schema do resumo da Tarefa 1.
- Arquivos permitidos: `tests/model-comparison/comparar_testes.ts`, seus testes e `tests/model-comparison/README.md`.
- Limites: baseline sem custo reportado fica NAO_VERIFICADO; sem verdade docente, não calcular acurácia. Não inferir provider, custo ou resultado ausente.

## Tarefa 3 — QA independente (AC-001 a AC-007)

- Objetivo: revisar diffs, verificar isolamento, imports, fail-closed de API, saídas, métricas e relatório.
- Responsável: revisor_qa Luna.
- Arquivos permitidos: `tests/model-comparison/qa/**`, `specs/model-comparison/test-plan.md`, `specs/model-comparison/validation.md`.
- Limites: testes pagos só podem ser iniciados pelo coordenador em execução expressamente autorizada. QA usa fakes e leitura de artefatos sem PII.
