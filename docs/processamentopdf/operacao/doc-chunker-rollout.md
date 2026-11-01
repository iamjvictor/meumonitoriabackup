# Rollout do Doc-chunker

## Preparação

1. Confirmar que `OPENROUTER_EMBEDDING_MODEL` gera vetores de 2048 dimensões e que `DOCUMENT_TEXT_SOURCE=pdfjs` está configurado no worker.
2. Aplicar a migration aditiva `202610240001_docling_chunks` com `cd backend && npm run prisma:deploy`.
3. Construir e publicar a imagem `services/document-parser` no serviço privado do Railway. A imagem pré-carrega o tokenizer Qwen na revisão fixada no código.
4. Configurar `DOC_CHUNKER_MAX_CONCURRENCY=1`, `DOC_CHUNKER_MAX_UPLOAD_BYTES=52428800`, `DOC_CHUNKER_MAX_RESPONSE_BYTES=20971520`, `DOC_CHUNKER_TIMEOUT_MS=600000` e `DOCUMENT_PARSER_ENABLE_OCR=false` inicialmente.
5. Verificar `/health` e `/ready`; não rotear jobs Docling enquanto readiness retornar 503.

## Canário

1. Manter `DOCUMENT_TEXT_SOURCE=pdfjs` por padrão.
2. Em homologação, configurar `DOCUMENT_CHUNKER_BASE_URL` com a URL privada do parser e selecionar `docling` para um conjunto controlado de PDFs textuais, com tabelas, longos e escaneados.
3. Conferir em logs `request_id`, `document_id`, `job_id`, `job_attempt`, hash, duração, contagem de chunks, páginas e conclusão de embeddings. Logs não podem expor texto, PDF, vetores, nome de arquivo ou credenciais.
4. Confirmar que `KNOWLEDGE_BASE` tem chunks prontos com embedding 2048D e citações de página; validar que `QUESTIONS` e `FLASHCARDS` permanecem no pipeline atual.
5. Testar timeout, queda de conexão, resposta inválida, hash divergente, OCR ausente, reinício do parser e falha do provedor de embeddings.

## Produção e critérios de parada

Ativar `auto` somente após o canário demonstrar qualidade de recuperação, citações corretas, memória estável, taxa de falha aceitável e reuso dos chunks em retry de embeddings. O fallback automático é limitado a erro de rede, timeout, indisponibilidade 5xx, corpo interrompido e resposta inválida; erros de entrada, hash, OCR e ausência de texto permanecem falhas explícitas.

Parar a ampliação se houver crescimento de `document_stage.stalled`, reinícios/OOM, aumento de `DOC_CHUNKER_TIMEOUT`, documentos sem chunks citáveis, mistura de engines ou embeddings com dimensão incompatível. Investigar por `request_id` e `document_id` antes de reabrir o canário.

## Reversão

1. Definir `DOCUMENT_TEXT_SOURCE=pdfjs` para jobs novos.
2. Manter o serviço e a migration aditiva ativos; os campos Docling são opcionais e os chunks já persistidos não precisam ser apagados.
3. Deixar jobs correntes terminarem com a fonte registrada. Se houver erro de embeddings, repetir o job Docling para reutilizar o lote `source_key` já salvo.
4. Não remover colunas nem dados de proveniência durante a reversão. Uma migração destrutiva exige plano separado.
