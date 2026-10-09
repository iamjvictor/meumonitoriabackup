# Scripts de teste por fase

Os entrypoints executáveis ficam neste diretório e são agrupados pela fase do
plano. A implementação pode continuar próxima do código de produção; estes
arquivos são a superfície oficial para validação.

## `chunks/`

Valida a fase de chunks:

- `test-document-chunking.ts`: simulação offline do pipeline;
- `test-document-chunking-path-contract.ts`: contrato do corpus e paths;
- `test-chunk-quality.ts`: elegibilidade, divisão e qualidade;
- `test-question-statement-evidence.ts`: evidência do enunciado.

Os comandos `npm run test:documents`, `npm run test:chunk-quality` e
`npm run test:document-chunking-path-contract` apontam para esta pasta.
