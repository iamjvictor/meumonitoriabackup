# Test plan — extração estruturada em outros PDFs

## Escopo

Exercitar `StructuredQuestionExtractionService` em dois documentos locais de questões com conteúdo distinto de Pedro Lucas: `Quimica-3.pdf` (caderno discursivo) e `Estequiometria.pdf` (questões objetivas e discursiva). Verificar quantidade e identificação das questões, enunciados, alternativas quando existirem, fórmulas/notação, referências de chunk e evidência visual.

## Preparação e isolamento

- Calcular SHA-256 dos PDFs e não repetir arquivos idênticos.
- Enviar cada PDF uma vez ao Docling v2 local (`127.0.0.1:8083`) para texto, chunks e assets reais.
- Carregar configuração do OpenRouter diretamente com `dotenv.parse(backend/.env)` antes dos imports de configuração; fixar `QUESTION_EXTRACTION_MAX_TOKENS=16000`, `QUESTION_EXTRACTION_TIMEOUT_MS=180000` e `QUESTION_EXTRACTION_REASONING_EFFORT=none`.
- Executar a extração estruturada real uma vez por documento, sem reconciliação nem retries.
- Usar repositório em memória. Vincular cada asset real aos chunks com página sobreposta e enviar seus bytes reais como imagem; registrar que esse vínculo é do harness e não uma leitura do banco.
- Não usar banco, Storage, worker completo nem persistir registros de produção.

## Verificações e critérios

1. **Cobertura:** comparar a lista estruturada com as questões visíveis no PDF; separar discursivas das objetivas e só exigir alternativas quando impressas.
2. **Fidelidade textual:** conferir numeração, limites do enunciado e ausência de soluções/anotações manuscritas dentro da questão.
3. **Notação e fórmulas:** comparar fórmulas químicas, reações, índices, expoentes e unidades com as páginas renderizadas.
4. **Proveniência visual:** validar que `sourceChunkIds` pertencem ao documento e `visualEvidence.assetId` aponta para asset fornecido, registrando página e modo de associação.
5. **Chamada e custo:** confirmar uma janela e uma chamada LLM por documento; registrar modelo, tokens reportados, duração, status e custo quando disponível.
6. **Persistência isolada:** guardar a saída recebida pelo repositório em memória para demonstrar os valores entregues à fronteira de persistência; isso não comprova gravação no banco nem flags internas do repositório Prisma.

## Comandos de reprodução

```bash
sha256sum tests/document-parser/teacher-materials/Quimica-3.pdf tests/document-parser/teacher-materials/Estequiometria.pdf
cd backend
node --import tsx src/scripts/.qa-run-other-question-pdfs.ts
```

O script temporário foi removido depois da execução. Os resultados JSON e o relatório final permanecem em `tests/document-parser/results/` e nesta pasta de especificação.
