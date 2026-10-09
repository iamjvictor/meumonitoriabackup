# Processamento da Base de Conhecimento

Registro dos erros observados durante o processamento de documentos e das respectivas análises.

## 1. Caractere NUL rejeitado pelo PostgreSQL

Erro:

```text
invalid byte sequence for encoding "UTF8": 0x00
```

Contexto:

- O PDF foi extraído corretamente.
- O erro ocorreu ao salvar `DocumentText` no PostgreSQL.
- O texto extraído continha o caractere NUL (`\u0000`).
- O PostgreSQL não aceita esse caractere em campos `TEXT`.

Impacto:

- A operação `NORMALIZE_TEXT` falhou.
- O documento foi marcado como `FAILED` após as tentativas do worker.

## 2. Parser Docling retornando HTTP 404

Erro:

```text
Parser respondeu HTTP 404. upstreamCode=NOT_FOUND upstreamMessage=Endpoint inexistente.
```

Endpoint envolvido:

```text
GET /v1/parse/{parseRunId}/result
```

Análise:

- O worker tentou buscar o resultado de um parse antigo.
- O log não apresentava um novo `POST /v1/parse` antes do `GET /result`.
- O `idempotencyKey` era baseado no hash do arquivo, mas não incluía o `documentId`.
- O mesmo PDF enviado em documentos diferentes podia reutilizar o mesmo `parseRunId`.
- O serviço Docling atual trabalha com resposta inline e não possui necessariamente a rota `/result`.

Impacto:

- O documento era marcado como `FAILED` antes da extração seguir para as próximas etapas.

## 3. Resposta `404` do OpenRouter para `openai/gpt-5-mini`

Erro:

```text
OpenRouter chat falhou (404): No endpoints found that can handle the requested parameters.
```

Contexto:

- O erro ocorreu em agentes que solicitavam respostas estruturadas.
- Exemplos: alternativas, resposta correta, revisão de qualidade e normalização.
- O modelo solicitado foi `openai/gpt-5-mini`.
- O OpenRouter não encontrou um endpoint compatível com os parâmetros solicitados, especialmente o formato estruturado exigido.

Comportamento observado:

- O agente falhou individualmente.
- O sistema acionou o fallback `google/gemini-3.7-flash`.
- As chamadas de fallback retornaram HTTP `200`.

Conclusão:

- Esse erro não interrompeu necessariamente o processamento do documento.
- O resultado pode ser concluído com o modelo de fallback ou ficar parcialmente pendente de revisão.

## 4. Timeout e resposta truncada do Qwen

Erros observados:

```text
OpenRouter excedeu o timeout configurado.
```

```text
A resposta estruturada terminou por limite de tokens.
```

Modelo envolvido:

```text
qwen/qwen3.5-35b-a3b
```

Análise:

- A reconstrução da fonte da questão excedeu o tempo configurado em duas tentativas.
- Em outra tentativa, o modelo terminou com `finishReason: length`.
- A resposta veio com `responseChars: 0` e `completionTokens: 2000`, indicando que atingiu o limite antes de produzir uma estrutura válida.

Comportamento observado:

- O sistema tentou novamente conforme a política de retry.
- Depois acionou o fallback `google/gemini-3.7-flash`.
- O fallback retornou HTTP `200` e permitiu a continuidade.

## 5. Resposta estruturada incompleta e inconsistência matemática na conclusão da questão

Erro observado em 2026-09-29:

```text
Resposta estruturada nao atende ao schema local.
model: google/gemini-2.5-flash
```

Resposta recebida do modelo:

```json
{
  "explanation": "..."
}
```

Contexto:

- A etapa de conclusão exigia `alternatives`, `correctAnswer` e `explanation`.
- O modelo retornou somente `explanation`, portanto a resposta era JSON válido, mas incompleta para o schema local.
- O worker repetiu a chamada e registrou tentativas adicionais (`attempts: 2`).
- A explicação também aceitou um gabarito mesmo reconhecendo que o domínio matemático apresentado estava incorreto ("a alternativa A é a mais próxima").
- A etapa posterior de revisão de qualidade respondeu HTTP 200; portanto, esse erro pertence ao contrato da conclusão da questão, não ao parser Docling.

Impacto:

- Questões podem ser salvas com explicações inconsistentes ou ficar em processamento parcial quando a resposta estruturada não contém todos os campos exigidos.
- Uma explicação que admite que o gabarito não é matematicamente defensável não deve ser promovida automaticamente para revisão comum.

Melhorias necessárias:

- Registrar no log os campos ausentes e o `task` exato da resposta rejeitada, em vez de somente `issues: [Array]`.
- Preservar campos válidos da fonte quando apenas um agente falhar, mantendo a questão como `PENDING_REVIEW` com `missingFields` explícito.
- Validar a consistência entre `correctAnswer`, alternativas e explicação antes de persistir a questão.
- Tratar expressões de domínio, radicais, frações e equações como conteúdo matemático que exige validação específica; não aceitar a justificativa "alternativa mais próxima" como resposta correta.
- Diferenciar falha de schema incompleto, resposta truncada e inconsistência pedagógica nos indicadores de processamento.

Critérios de aceitação:

```text
Uma resposta que contenha somente explanation não é considerada conclusão completa.
Uma questão com gabarito inconsistente fica PENDING_REVIEW e registra a inconsistência.
O log identifica task, campos ausentes, modelo, tentativa e trecho seguro da resposta.
Questões válidas continuam sendo persistidas mesmo quando outra questão do documento falha.
```

## 6. `BrokenPipeError` no servidor Docling

Erro:

```text
BrokenPipeError: [Errno 32] Broken pipe
```

Contexto:

- O Docling concluiu a conversão e gerou o layout corretamente.
- O erro ocorreu ao enviar a resposta HTTP de volta ao worker.
- O cliente provavelmente encerrou a conexão antes do servidor terminar de escrever a resposta.
- O worker estava configurado com timeout de aproximadamente 3 segundos.

Impacto:

- Pode haver requisições duplicadas ou novas tentativas do worker.
- O erro não significa necessariamente que a conversão Docling falhou.

## 7. Conclusão do processamento observado

Nos logs analisados, o processamento conseguiu avançar além do Docling:

- O PDF foi convertido em 6 páginas.
- Embeddings foram gerados com sucesso.
- Os fallbacks do Gemini responderam com HTTP `200`.
- Uma questão foi salva para revisão.
- Em alguns casos, uma questão foi salva como conclusão parcial por ausência da resposta correta:

```text
monitor.question_completion_partial_for_review
missingFields: ['correctAnswer']
```

Para confirmar o encerramento completo do processamento, procurar pelos eventos:

```text
monitor.document_processing_completed
monitor.document_job_completed
```

A presença de erros individuais de modelo não implica, por si só, que o documento inteiro falhou, pois o pipeline possui fallback e revisão parcial.

## 8. Arquitetura atual do parser Docling

O Docling é um serviço Python isolado em `services/document-parser`. Ele é
responsável exclusivamente por converter um PDF em uma representação técnica
do documento; ele **não** acessa Prisma, Supabase, Redis, tabelas de questões
ou provedores de IA.

```text
arquivo no Storage
       |
       v
worker Node.js / fila de documentos
       |  POST multipart/form-data (campo file)
       v
serviço Python Docling (porta 8080)
       |  markdown + documento bruto + layout normalizado
       v
ingestão V3 no backend
       |  persiste layout, projeta texto e executa as demais etapas
       v
normalização -> blocos -> chunks -> embeddings -> questões/revisão
```

O contrato público do serviço é deliberadamente pequeno:

- `GET /health` retorna `200` com `{"status":"ok"}`.
- `POST /v1/parse` recebe `multipart/form-data`, com o campo obrigatório
  `file`, e responde o resultado na própria requisição.
- O resultado contém `inputSha256`, `markdown`, `document`, `layout` no
  formato `docling-layout-v1` e `textAnalysis`.
- Não há fila, banco de dados, artefato persistido ou rota de consulta de
  resultado no serviço Python. Portanto, as rotas
  `/v1/parse/{parseRunId}` e `/v1/parse/{parseRunId}/result` não fazem parte
  do contrato do Docling atual e retornam `404`.

O adaptador do backend aceita tanto respostas inline quanto o protocolo
assíncrono histórico. Para a implantação Docling atual, a resposta inline é
o caminho esperado. A idempotência canônica e a persistência são obrigações
do backend, não do processo Python.

## 9. Seleção da fonte de texto no worker

As variáveis abaixo definem se o conteúdo textual continua no caminho legado
ou usa a projeção produzida pelo Docling:

| Variável | Valor/limite | Efeito |
| --- | --- | --- |
| `DOCUMENT_INGESTION_V3_ENABLED` | `true` para usar a ingestão V3 | Habilita o envio do PDF ao parser. |
| `DOCUMENT_PARSER_BASE_URL` | URL privada do parser, por exemplo `http://document-parser.railway.internal:8080` | Obrigatória ao selecionar Docling. |
| `DOCUMENT_TEXT_SOURCE` | `pdfjs` (padrão) ou `docling` | Define a origem do texto nas etapas posteriores. |
| `DOCUMENT_WORKER_CONCURRENCY` | inteiro de 1 a 8; padrão 2 | Limita jobs de documento processados pelo worker Node.js. |

`DOCUMENT_TEXT_SOURCE=docling` exige as duas primeiras configurações. Nesse
modo, o worker utiliza `parsedPdf`, projetado do `LayoutDocument` persistido,
e não importa nem executa PDF.js na etapa de extração de texto. Se a projeção
Docling não existir ou a conversão falhar, o job é interrompido e marcado como
falho; não há fallback silencioso para PDF.js. O rollback operacional é
explícito: definir `DOCUMENT_TEXT_SOURCE=pdfjs` e reprocessar conforme a
política do produto.

## 10. OCR e classificação da camada de texto

Antes de converter, o serviço inspeciona a camada de texto nativa do PDF com
`pypdfium2`. Uma página é considerada com texto nativo quando tem pelo menos
80 caracteres. O documento é classificado assim:

- `TEXT`: pelo menos 70% das páginas possuem texto nativo suficiente.
- `SCANNED`: menos de 30% das páginas possuem texto nativo suficiente.
- `MIXED`: qualquer caso intermediário.

Por padrão, o serviço privilegia texto nativo e não habilita OCR de forma
implícita. Quando a extração posterior concluir que o documento precisa de
OCR, o worker marca o documento como `NEEDS_OCR` e deixa as etapas dependentes
pendentes, em vez de fabricar texto de baixa confiabilidade. Uma alteração na
política de OCR deve preservar essa decisão auditável em `textAnalysis` e
adicionar testes de PDF textual, escaneado e misto.

## 11. Memória, concorrência e retenção de resultados

O processo Docling pode ter um consumo base relevante: runtime Python,
Docling, pypdfium2 e modelos carregados pelas bibliotecas. Isto é diferente de
uma retenção indevida por job.

O `CachedParseService` mantém somente o mapa `_in_flight`, indexado pelo
SHA-256 dos bytes recebidos:

- dois uploads idênticos simultâneos compartilham uma única conversão;
- antes de resolver ou rejeitar a `Future`, a entrada é removida do mapa;
- um novo upload do mesmo PDF, depois de concluído o anterior, converte de
  novo intencionalmente;
- markdown, `document` bruto e layout completos não permanecem em cache entre
  jobs.

Essa mudança reduz retenção de resultados concluídos, mas **não prova**, por
si só, redução de RSS do contêiner. Modelos ou caches internos do Docling
podem permanecer residentes depois da primeira conversão. A validação de
capacidade precisa medir RSS/heap antes e depois de uma sequência realista de
documentos no ambiente de destino.

Há limites importantes para manutenção e dimensionamento:

- o corpo multipart é lido integralmente em memória antes do parse;
- o PDF também é gravado temporariamente durante a conversão e removido ao
  fim da operação;
- a resposta JSON pode ser grande, pois inclui o documento bruto e o layout;
- o servidor aceita no máximo duas conversões ao mesmo tempo por padrão;
- a linha de comando atual expõe host e porta, mas não expõe a concorrência
  como variável ou argumento de deploy;
- o servidor envia pequenos chunks em branco enquanto uma conversão longa está
  em andamento, para manter a conexão viva. O cliente deve consumir o corpo
  completo antes de interpretar o JSON.

Assim, não se deve logar o corpo do PDF nem o JSON integral da resposta. Os
logs devem usar apenas hash, tamanho, quantidade de páginas, duração, status e
o tipo de falha.

## 12. Operação no Docker e Railway

O serviço usa Python 3.12, `docling==2.122.0` e dependências travadas em
`services/document-parser/uv.lock`. O Dockerfile instala o ambiente com
`uv sync --locked`, executa uma verificação de import do Docling durante o
build e inicia `scripts/run_http_server.py` na porta `8080`.

Para Railway, manter o parser como serviço privado:

1. criar o serviço a partir de `services/document-parser`, usando o
   `Dockerfile` desse diretório;
2. configurar a porta interna `8080` e health check `/health`;
3. não expor domínio público, salvo necessidade operacional explícita;
4. configurar no backend
   `DOCUMENT_PARSER_BASE_URL=http://document-parser.railway.internal:8080`;
5. fazer primeiro um deploy escuro com `DOCUMENT_TEXT_SOURCE=pdfjs`;
6. validar health, um `POST /v1/parse` com PDF representativo, logs e métricas
   de memória; só então habilitar `DOCUMENT_TEXT_SOURCE=docling`.

A primeira conversão em um ambiente novo pode baixar ou inicializar artefatos
de modelo. Esse aquecimento deve ser previsto no timeout do worker (o
adaptador usa 600.000 ms por padrão) e acompanhado sem publicar o serviço
para a internet.

## 13. Testes e checklist de manutenção

Os testes do serviço devem ser executados a partir do seu diretório, usando o
ambiente travado:

```bash
cd services/document-parser
UV_CACHE_DIR=/tmp/meumonitorai-docling-uv-cache \
  uv run python -m unittest discover -s tests -p 'test_*.py' -v
```

Antes de alterar o parser ou sua integração, validar:

- contrato de `GET /health` e `POST /v1/parse`;
- uploads inválidos, falha interna do parser e desconexão do cliente;
- coalescência apenas para requisições simultâneas e remoção do `_in_flight`
  tanto em sucesso quanto em erro;
- normalização `docling-layout-v1`, projeção para `parsedPdf` e classificação
  de OCR;
- cancelamento/timeout no adaptador Node.js e encerramento do worker;
- processamento de um corpus representativo, comparando qualidade, duração e
  RSS antes de mudar a fonte padrão para Docling.

O erro `BrokenPipeError` descrito na seção 5 passou a ser tratado como
`docling_http.client_disconnected`: ele indica que o cliente fechou a conexão
enquanto a resposta era enviada e não confirma, isoladamente, falha na
conversão. Já um `404` nas rotas de resultado deve levar primeiro à verificação
do contrato: para este serviço, a resposta é inline em `/v1/parse`.
