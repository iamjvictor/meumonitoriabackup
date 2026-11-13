# Validação

- AC-001: cinco PDFs baixados; assinatura e tamanhos conferem com o banco. Arquivos ignorados pelo Git e documentados na pasta local.
- AC-002: matriz isolada executa OCR/QUESTIONS, OCR/KNOWLEDGE, PDF textual/QUESTIONS e PDF textual/KNOWLEDGE; OCR e serviços do worker são simulados. PDF.js lê separadamente os arquivos reais de pH e simulado. O simulado tem 10 marcadores textuais de questão.
- AC-003: matriz centralizada em tests/document-parser; executar em backend com `node --experimental-test-module-mocks --import tsx --test ../tests/document-parser/document-worker-content-matrix.test.ts`: 6/6 passaram.
- OCR real: `DOC_CHUNKER_URL=http://127.0.0.1:8083 python3 -m unittest tests/document-parser/test_ocr_upload.py`, com parser local OCR habilitado: 1/1 passou; 163 caracteres nativos, 2.355 caracteres em 3 trechos OCR, páginas 1 a 4 cobertas.
- Limites: nenhum cenário verifica quantidade de questões persistidas, nem cobre OCR real para questões. Os testes com mocks não exercitam banco, OpenRouter ou reconstrução de referências. Os PDFs locais não são versionados.
