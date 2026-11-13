# Pacotes de trabalho

O arquiteto coordena; no máximo dois implementadores simultâneos, com arquivos exclusivos. A sequência abaixo evita escrita concorrente no worker. QA não edita produção.

- T1 — AC-001/002: cobertura e embeddings. Responsáveis: `backend/src/worker/services/document-worker.service.ts`, `chunk.service.ts`, `backend/src/repositories/document-worker.repository.ts` e testes correspondentes. Dependências: nenhuma. Não alterar caminho `KNOWLEDGE_BASE` sem teste de regressão. Verificar cobertura de todos os caracteres normalizados, páginas, persistência e falha de embedding.
- T2 — AC-003/007: corpo único e limites. Responsáveis: novo módulo e testes próprios em `backend/src/worker/services/`. Depende do contrato de chunks de T1. Verificar ordenação, uma única chamada, cobertura integral e erros explícitos de limite.
- T3 — AC-003/004/005: extração estruturada e imagem. Responsáveis: `question-extraction.service.ts`, schemas/cliente OpenRouter e testes próprios. Depende de T2; preservar edições existentes. Verificar schema, todos os chunks, 10 objetos, campos opcionais e evidência multimodal.
- T4 — AC-005/006: integração/persistência. Responsáveis: worker e repositório de questões após liberação por T1/T3. Verificar retry, idempotência, pendências e ausência de agentes de completamento.
- T5 — AC-001–007: QA independente. Responsáveis: `tests/document-parser/` e `test-plan.md`/`validation.md`; depende das interfaces dos pacotes. Conferir o PDF Pedro Lucas com referência revisada, PDFs de regressão e execução real multimodal distinta de mocks.

Cada pacote inclui teste que demonstra o comportamento esperado, execução do teste e evidência no registro de validação. Não reprocessar banco, fazer commit ou deploy como parte dos pacotes sem autorização aplicável.
