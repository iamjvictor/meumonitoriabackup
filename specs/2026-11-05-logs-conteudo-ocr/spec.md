# Logs auditáveis do OCR até chunks e embeddings

## Objetivo

Permitir inspecionar, em execução local controlada, o texto OCR/nativo recebido do Docling, persistido nos chunks e enviado ao provedor de embeddings, para verificar se o conteúdo se perde entre etapas.

## Critérios de aceite

- AC-001: Com `DOCUMENT_EXTRACTION_CONTENT_LOG_ENABLED=true`, o worker registra conteúdo de cada chunk recebido e persistido, com documento, índice, páginas e tamanho.
- AC-002: Com a mesma opção ativa, embeddings registra o texto efetivamente enviado (`embeddingContent` ou `content`) por chunk/lote, com metadados correspondentes.
- AC-003: Sem a opção, logs não incluem conteúdo textual dos documentos.
- AC-004: Os logs têm limite configurável de caracteres por chunk e informam truncamento; o padrão é seguro e a flag é desativada por padrão.
- AC-005: Testes cobrem ativação, desativação e que o texto logado para embeddings corresponde à entrada real do cliente.
