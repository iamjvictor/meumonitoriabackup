# Plano

Adicionar uma opção booleana de ambiente, desligada por padrão, e um limite de caracteres para diagnóstico. Instrumentar a fronteira de retorno do Docling/persistência no `DocumentWorkerService` e a fronteira de envio no `EmbeddingService`. Não alterar processamento, chunks, embeddings, persistência ou credenciais.

## Verificação

Teste unitário do worker/embedding com captura de console; typecheck; fluxo document-parser contra Docling local com a flag ligada para auditar os PDFs de professor.
