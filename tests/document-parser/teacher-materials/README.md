# Materiais de teste do professor

Fixtures copiadas de `HERMES/videos/biblioteca/raw` para reproduzir dois caminhos do parser: questões e base de conhecimento com OCR. Os PDFs originais não foram alterados.

| PDF | Fluxo esperado | SHA-256 |
| --- | --- | --- |
| `Quimica-3.pdf` | Questões | `dbc94a84bc48dfba51b0eda410e7cf116430827b6cd8468338030eb10ef3a28d` |
| `pH e pOH.pdf` | Base de conhecimento, OCR | `5dc9b25e4ea2f5eb0729d748d3de2058d53cc90167ad558851504dddd40c4acc` |
| `Estequiometria.pdf` | Base de conhecimento, OCR | `63ac6bcdc1a33ef8a67998886482432496754695f6a3db9c918e3c6e7eb346cd` |

## Rodar os testes

Na raiz do repositório, rode o processamento de conhecimento com OCR habilitado:

```bash
cd services/document-parser
DOCUMENT_PARSER_ENABLE_OCR=true UV_CACHE_DIR=/tmp/meumonitorai-docling-uv-cache uv run python scripts/test_knowledge_parser.py ../../tests/document-parser/teacher-materials/Estequiometria.pdf --output ../../tests/document-parser/teacher-materials/results/Estequiometria.knowledge.json
DOCUMENT_PARSER_ENABLE_OCR=true UV_CACHE_DIR=/tmp/meumonitorai-docling-uv-cache uv run python scripts/test_knowledge_parser.py '../../tests/document-parser/teacher-materials/pH e pOH.pdf' --output '../../tests/document-parser/teacher-materials/results/pH e pOH.knowledge.json'
```

Para auditar as questões de `Quimica-3.pdf`, rode em `backend`. O script importa a configuração do backend, mas não acessa banco, Redis ou IA; as variáveis abaixo são valores locais fictícios exigidos apenas pela validação de configuração:

```bash
cd backend
NODE_ENV=test SUPABASE_URL=https://localhost.invalid SUPABASE_PUBLISHABLE_KEY=test SUPABASE_SERVICE_ROLE_KEY=test DATABASE_URL=postgresql://test:test@127.0.0.1:5432/test REDIS_URL=redis://127.0.0.1:6379 OPENROUTER_EMBEDDING_MODEL=test OPENROUTER_QUESTION_MODEL=test ASAAS_WEBHOOK_URL=https://example.invalid ASAAS_CREDENTIAL_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= node --import tsx src/scripts/audit-question-chunks.ts ../tests/document-parser/teacher-materials/Quimica-3.pdf ../tests/document-parser/teacher-materials/results/Quimica-3.questions-pdfjs.json --source=pdfjs --expect-count=10
```

Para testar a rota Docling/OCR de questões, inicie o serviço HTTP em `services/document-parser` com `DOCUMENT_PARSER_ENABLE_OCR=true` na porta 8080 e acrescente `--parser-url=http://127.0.0.1:8080` (remova `--source=pdfjs` para deixar o modo `auto` decidir). A rota Docling pode produzir resultado diferente do PDF.js; os dois resultados atuais estão preservados para comparação.

## Resultado desta execução

- **Questões, PDF.js:** `Quimica-3.pdf` detectou 10/10 questões numeradas (01–10), criou candidatas determinísticas para as dez e manteve cobertura exata de cada bloco em seu chunk. Nove candidatas estão prontas para completion; a questão 01 aguarda evidência visual.
- **Conclusão por IA:** o dry run tentou 19 chamadas ao OpenRouter; todas responderam HTTP 401, sem tokens e sem alternativas, gabaritos ou explicações gerados. O relatório imprime “Questões completadas: 10” porque conta candidatas processadas mesmo quando os agentes falham; esse total não significa sucesso de completion. Ver `results/ai-dry-run/Quimica-3.dry-run.md`.
- **Questões, Docling/OCR, modo auto:** o mesmo PDF acionou OCR/layout nas páginas 2, 13, 14 e 16, mas o montador Docling produziu zero blocos de questão. Ver `results/Quimica-3.questions.json`. O fluxo atual de `QUESTIONS` usa PDF.js para texto e executa a extração visual em paralelo; o teste PDF.js é o resultado aplicável para as dez questões deste caderno.
- **Base de conhecimento, Estequiometria:** classificação `SCANNED`, OCR habilitado, 3 chunks de texto (35–487 tokens), limite de 500 respeitado. A página 3 não gerou chunk textual, mas o pacote v2 exportou dois assets PNG dessa página (um contém questão e anotações manuscritas). O pacote completo tem 8 assets, sem warnings; ver `results/Estequiometria.visual-summary.json` e `results/Estequiometria.chunk-v2.zip`.
- **Base de conhecimento, pH e pOH:** classificação `SCANNED`, OCR habilitado, 3 chunks textuais (167–489 tokens), limite de 500 respeitado e páginas 1–4 cobertas. O pacote v2 também exportou 3 assets, nas páginas 1, 3 e 4. O texto e os assets foram extraídos, mas há erros OCR em fórmulas/notação química.
- **Persistência e recuperação:** ainda não testadas. Os pacotes confirmam extração de texto e imagem pelo parser, mas não provam armazenamento privado, descrição/indexação visual, embedding ou recuperação RAG. `DOCUMENT_VISUAL_ASSETS_ENABLED` permanece desligada por padrão.
- **Testes de componentes:** 12 testes Python de chunking/assets passaram; 10 testes backend focados em worker/parser/assets passaram (8 no primeiro grupo e 2 após ativar o recurso de mocks do Node); 6 testes de contexto visual, chat e payload passaram.

O recorte visual de maior conteúdo da página 3 está em `results/Estequiometria-page3-annotated.png` para inspeção direta.

Os JSONs em `results/` guardam blocos/candidatas/chunks completos. As auditorias são locais e não gravam questões, embeddings ou documentos no banco.
