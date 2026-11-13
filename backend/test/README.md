# Testes dos documentos do professor

Os PDFs baixados para inspeção local ficam em `../tests/document-parser/documentos-professor/`. Eles são ignorados pelo Git para não enviar documentos pessoais ao repositório. A matriz de testes está centralizada em `tests/document-parser/document-worker-content-matrix.test.ts`.

Execute a matriz de processamento com:

```bash
cd backend
node --experimental-test-module-mocks --import tsx --test ../tests/document-parser/document-worker-content-matrix.test.ts
```

A matriz cobre quatro combinações: OCR e PDF textual, cada um com as tags `QUESTIONS` e `KNOWLEDGE_BASE`. Todos os cenários usam bytes sintéticos e mocks para parser, banco, armazenamento, embeddings e extração de questões. Eles verificam a lógica do worker sem depender dos PDFs privados, de serviços locais ou de respostas reais do OCR; não medem questões realmente extraídas ou persistidas.

Um segundo teste opcional lê os PDFs do **pH e pOH** e do **Simulado Pedro Lucas** com o extrator PDF.js real. Se os PDFs privados ignorados pelo Git estiverem ausentes, o Node marca esse teste como `SKIP` com uma instrução clara. Quando os arquivos estão disponíveis, confere páginas e texto nativo, incluindo dez marcadores `Questão NN` no Simulado. Esses marcadores confirmam texto no PDF, não questões extraídas ou persistidas.

Para testar OCR real da fixture escaneada de conhecimento, há também `tests/document-parser/test_ocr_upload.py`. Execute na raiz do repositório com `DOC_CHUNKER_URL=http://127.0.0.1:8080 python tests/document-parser/test_ocr_upload.py`. Inicie o serviço local do parser antes. Esse teste não chama embeddings nem modelos pagos; envia o PDF ao parser e verifica os trechos com páginas citáveis. Sem `DOC_CHUNKER_URL`, o unittest aplica skip. É necessária a fixture local `tests/document-parser/ocrTeste.pdf` e as dependências Python do parser.

Os arquivos PDF são fixtures locais de inspeção, ignorados pelo Git. Não inclua versões de PDFs do professor no repositório.
