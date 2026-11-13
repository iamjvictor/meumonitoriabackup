# QA independente — integração do grafo e saída parcial

Plano criado antes dos testes de integração, vinculado a AC-001 e AC-010.

## Fronteira observada

`DocumentWorkerService` chama `questionExtractionService.processDocument(document.id)` nos ramos Docling e PDF.js. O `QuestionExtractionService.processDocument` delega a `StructuredQuestionExtractionService.processDocument`, que hoje extrai e salva diretamente. Para comprovar a correção, o teste deve injetar uma implementação controlável do serviço de questões e observar a ordem grafo → repositório.save; um teste do worker que só confirma a chamada do service não comprova execução do grafo.

## Cenários a executar após integração

- Grafo com questão completa e sem pendências: worker encaminha ao grafo, persistência recebe exatamente a saída consolidada, ordem correta.
- Grafo com questão parcial: resposta e pendências permanecem na saída persistida, status do documento/etapa representa sucesso parcial ou pendente, sem marcar conteúdo completo.
- Erro do grafo: nenhuma candidata parcial é salva como completa; fila registra operação falha/recuperável, preservando artefatos extraídos.
- Tag KNOWLEDGE_BASE: grafo não é chamado e operações específicas de QUESTIONS permanecem ignoradas.
- Caminho Docling e fallback PDF.js: ambos chamam uma única vez o mesmo fluxo agêntico após chunks/embeddings prontos.

Arquivo alvo isolado após alteração: `backend/src/worker/services/__tests__/document-worker.question-graph.qa.test.ts` se seam de integração no worker permitir. Se arquitetura mantiver execução no wrapper de `QuestionExtractionService`, acrescentar teste isolado para esse wrapper em arquivo `.qa.test.ts`. Dependências externas serão mockadas; teste real de banco/provider pertence aos cenários de integração end-to-end e será reportado como lacuna caso indisponível.

Não executar até o implementador fornecer a seam de integração. Não editar produção ou testes de terceiros.
