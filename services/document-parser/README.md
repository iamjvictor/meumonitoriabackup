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

`GET /health` responde `{"status":"ok"}`.

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

O parser real depende dos modelos do Docling. A primeira requisição em um
ambiente novo pode baixar artefatos de modelo e consumir tempo, memória e
rede.

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
layout, dependências e o contrato básico sem exigir uma conversão real do
Docling em cada execução.

## Limites

O servidor não persiste artefatos em disco nem mantém fila. Estados de falha
distinguem erro de entrada e erro do parser para facilitar o diagnóstico no
fluxo do backend depois.
