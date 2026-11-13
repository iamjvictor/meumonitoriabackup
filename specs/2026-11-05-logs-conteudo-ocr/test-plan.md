# Plano de testes — conteúdo nos logs de OCR, chunks e embeddings

| ID | Critério | Cenário e execução | Resultado esperado |
|---|---|---|---|
| T-001 | AC-001 | Capturar logger no helper usado pelo worker, com flag ligada, para chunk de entrada e chunk persistido, diferenciando `raw_text` e `text` | Uma entrada por chunk, contendo stage, documentId, índice, páginas, texto armazenado e texto de embedding |
| T-002 | AC-002, AC-005 | Rodar `EmbeddingService` com client/repositório dublês e `embeddingContent` diferente de `content` | `embeddingText` logado é exatamente o texto enviado ao client; `text` mantém o conteúdo persistido; ids/índice acompanham cada item |
| T-003 | AC-003 | Repetir helper/serviço com flag desligada | Nenhuma chamada de log com conteúdo |
| T-004 | AC-004 | Usar texto maior que limite configurado | Texto exibido é truncado no limite, tamanho original preservado e `textTruncated=true` |
| T-005 | AC-001, AC-002 | Auditar chamadas locais dos PDFs do professor com o parser em `:8083` e flag ligada | Texto OCR por chunk associado às páginas; resposta e texto por página não vazios para PDF escaneado |
| T-006 | regressão | Executar typecheck e testes pontuais do worker/chunker | Sem erro de tipos ou regressão nos fluxos afetados |
