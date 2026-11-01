# Document Parser HTTP Service — Docling

Serviço HTTP isolado para o Docling v2 no MeuMonitorAI. Ele não acessa
Prisma, Supabase, `DocumentBlock`, `QuestionSpan` ou agentes de IA: recebe um
PDF e devolve um resultado auditável para comparação.

O projeto fixa `docling==2.122.0` em Python 3.12. A lógica de conversão
continua baseada na API pública do Docling v2 e agora é exposta via HTTP em
`POST /v1/parse`.

## Uso local

```bash
cd services/document-parser
uv sync --locked
uv run python scripts/run_http_server.py --host 0.0.0.0 --port 8080
```

`GET /health` responde `{"status":"ok"}`. `GET /ready` responde 503 até Docling
e o tokenizer estarem carregados localmente; depois responde 200.

## Doc-chunker de base de conhecimento

`POST /chunk` recebe o mesmo multipart `file` e exige `X-Document-Id`,
`X-Request-Id` (UUID) e `X-Expected-SHA256`. A resposta é JSON integral,
inclui `X-Request-Id` e `request_id`, hash, versão do tokenizer e chunks com
texto contextualizado, texto original, títulos e páginas. O serviço rejeita o
hash antes de converter, limita uploads a 50 MiB e não envia espaços de
heartbeat antes do resultado. Configurações: `DOC_CHUNKER_MAX_UPLOAD_BYTES`,
`DOC_CHUNKER_MAX_RESPONSE_BYTES`, `DOC_CHUNKER_TIMEOUT_MS`,
`DOC_CHUNKER_MAX_CONCURRENCY` e `DOCUMENT_PARSER_ENABLE_OCR`.

O tokenizer `Qwen/Qwen3-Embedding-8B` é fixado no código em
`c90816d848505624c2434128dfc61132162a0ee9` e pré-carregado durante o build.
O chunker limita texto contextualizado a 500 tokens, usa OCR somente quando
`DOCUMENT_PARSER_ENABLE_OCR=true` e retorna `OCR_REQUIRED` em PDFs escaneados
ou mistos sem OCR. Se um chunk contextualizado exceder o limite, o serviço o
divide em partes menores, preservando o texto bruto na ordem original e
repetindo o contexto de títulos em cada parte. O evento
`doc_chunker.chunking.split` registra a divisão.

`POST /chunk/v2` usa os mesmos headers e o mesmo multipart, mas responde com
`application/vnd.doc-chunker.v2+zip`. O ZIP contém `manifest.json` com os
chunks, proveniência, referências de item, página, bbox, legenda, ordem de
leitura e hashes; os recortes PNG ficam em `assets/<assetKey>.png`. O endpoint
v1 continua JSON e não inclui imagens. O worker só usa o v2 quando
`DOCUMENT_VISUAL_ASSETS_ENABLED=true`.
Para PDFs escaneados ou mistos, quando o Docling não emite um recorte `Picture`
em uma página sem camada de texto suficiente, o v2 também renderiza a página
como PNG. Esses assets têm referência `#/pages/N` e não têm bbox; a associação
com uma questão específica requer revisão ou evidência adicional.

`POST /v1/parse` exige `multipart/form-data` com o campo `file` e responde:

```json
{
  "status": "completed",
  "inputSha256": "…",
  "result": {
    "markdown": "…",
    "document": { "schema_name": "DoclingDocument" },
    "layout": { "schemaVersion": "docling-layout-v1" }
  }
}
```

O serviço mantém somente as conversões em andamento, indexadas pelo SHA-256
do arquivo enviado. Uploads iguais que chegam simultaneamente compartilham
uma única conversão; depois que ela termina, a entrada é removida. Repetir o
upload após a conclusão converte novamente: a persistência e a idempotência
do resultado canônico pertencem ao backend. Isso reduz a retenção de
markdown, documento e layout completos entre jobs, mas não substitui medir o
RSS do processo em produção (por exemplo, no Railway), pois as bibliotecas
do Docling podem manter modelos globais em memória.

O build da imagem baixa o tokenizer. O Docling ainda pode carregar recursos de
conversão durante o aquecimento da aplicação e requer memória compatível com o
tamanho dos PDFs e a concorrência configurada.

## Docker

```bash
cd services/document-parser
docker build -t meumonitorai-document-parser:docling-http .
docker run --rm -p 8080:8080 \
  meumonitorai-document-parser:docling-http
```

O Dockerfile fixa `uv` em `0.10.9`, copia `uv.lock` e instala as dependências
com `uv sync --locked --no-dev --no-install-project`; portanto, o ambiente da
imagem usa exatamente as versões resolvidas no lockfile.

## Testes

Execute os testes pelo ambiente fixado no lockfile:

```bash
UV_CACHE_DIR=/tmp/meumonitorai-uv-cache uv run python -m unittest discover -s tests -p 'test_*.py' -v
```

Os testes usam fixtures para validar o servidor HTTP, a normalização do
layout, dependências e o contrato básico. O teste de upload abaixo também
executa uma conversão real de uma página com Docling.

### Upload HTTP de um PDF do repositório

Com o serviço rodando, use o script para processar qualquer PDF e salvar a
resposta completa para inspeção:

```bash
services/document-parser/.venv/bin/python \
  services/document-parser/scripts/test_pdf_processing.py \
  test/mineru-spike/razao-proporcao-sample-pages.pdf \
  --base-url http://127.0.0.1:8080 \
  --output /tmp/doc-chunker-chunks.json
```

O script envia o PDF por `POST /chunk`, confere o SHA-256, o identificador da
requisição, o contrato e a presença de texto e páginas nos chunks. Ele mostra
um resumo JSON no terminal e, com `--output`, salva todos os chunks. Um erro
HTTP, JSON inválido ou resposta inconsistente encerra com código diferente de
zero. Para usar um serviço privado, execute-o em um ambiente com acesso à URL
interna e passe seu endereço em `--base-url`.

```bash
cd ../..
services/document-parser/.venv/bin/python -m unittest \
  services/document-parser/tests/test_chunk_upload_integration.py -v
```

O teste envia `test/mineru-spike/razao-proporcao-sample-pages.pdf` por
`multipart/form-data` para `/chunk`. Por padrão, substitui apenas o conversor
e o chunker pesados: valida os bytes recebidos, SHA-256, JSON contextualizado,
páginas, proveniência, hash incorreto e falha de conversão sem depender de
modelos externos. A linha `UPLOAD_SAMPLE=` mostra um exemplo compacto da
resposta. Esse exemplo usa texto controlado pela fixture e não mede a qualidade
da conversão Docling.

Na mesma execução, `RealDoclingLocalTokenizerUploadTest` recorta a primeira
página desse PDF e a envia por HTTP ao Docling e ao `HybridChunker` reais. Ele
usa um tokenizer local simples para não depender do download do Qwen e verifica
texto, acentuação, páginas e saída contextualizada. A linha
`REAL_DOCLING_LOCAL_SAMPLE=` mostra a prévia gerada. A contagem de tokens desse
caso não representa a contagem final do tokenizer Qwen.

`RealDoclingOcrUploadTest` renderiza essa página em imagem e a salva como PDF
sem camada de texto. O teste confirma a classificação `SCANNED`, verifica que
sem OCR a rota devolve `OCR_REQUIRED` e, com OCR real do Docling/RapidOCR,
confere texto pesquisável e página de origem. Execute os dois cenários com:

```bash
services/document-parser/.venv/bin/python -m unittest \
  services.document-parser.tests.test_chunk_upload_integration.RealDoclingLocalTokenizerUploadTest \
  services.document-parser.tests.test_chunk_upload_integration.RealDoclingOcrUploadTest -v
```

O teste de OCR usa o mesmo tokenizer local para isolar a conversão; pode levar
mais tempo na CPU. Para validar também o tokenizer Qwen fixado no serviço,
execute o smoke test opcional abaixo.
O teste de PDF com camada de texto roda com OCR desligado e também com OCR
ligado, refletindo a configuração atual do serviço em produção.

Para executar o mesmo upload com conversão e chunking reais, configure os
modelos Docling em cache e rode:

```bash
RUN_REAL_DOCLING_UPLOAD=1 services/document-parser/.venv/bin/python -m unittest \
  services/document-parser/tests/test_chunk_upload_integration.py -v
```

A linha `REAL_DOCLING_UPLOAD_SUMMARY=` mostra páginas, quantidade de chunks e
uma prévia dos dois primeiros. Esse teste é ignorado quando
`RUN_REAL_DOCLING_UPLOAD` não está definido.

## Limites

O servidor não persiste artefatos em disco nem mantém fila. Estados de falha
distinguem erro de entrada e erro do parser para facilitar o diagnóstico no
fluxo do backend depois.
