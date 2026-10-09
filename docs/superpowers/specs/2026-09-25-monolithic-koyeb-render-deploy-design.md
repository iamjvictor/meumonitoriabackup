# Deploy monolítico de protótipo — API, worker e Docling

## Objetivo

Executar o backend HTTP, o worker BullMQ e o parser Python/Docling em um único container hospedado em uma única instância gratuita de Koyeb ou Render. O Redis permanecerá no Upstash, compartilhado pela API e pelo worker.

## Escopo

O container terá três processos de aplicação, gerenciados por um supervisor:

- API Fastify/Node.js, exposta na porta `$PORT` da plataforma;
- worker Node.js/BullMQ, sem exposição pública;
- servidor HTTP Python/Docling, acessível somente em `127.0.0.1:8080`.

O Redis não será embutido no container. A conexão será feita por `REDIS_URL` apontando para o Upstash.

## Decisões

### Preservar o parser HTTP existente

O Docling continuará sendo o processo Python definido em `services/document-parser/Dockerfile` e `scripts/run_http_server.py`. O worker continuará chamando `DOCUMENT_PARSER_BASE_URL` por HTTP, usando `http://127.0.0.1:8080` dentro do container.

Isso evita uma reescrita do parser como módulo Node e preserva o contrato `/health` e `/v1/parse` já testado.

### Um único supervisor

O container será iniciado por um processo supervisor com autorestart para API, worker e parser. Se um processo crítico não puder ser mantido, o container deverá encerrar de forma observável para que a plataforma reinicie a implantação, evitando um container aparentemente saudável com apenas parte do sistema funcionando.

### Uma réplica

O protótipo usará uma única réplica. A API e o worker compartilham o mesmo `REDIS_URL` externo; portanto, não haverá estado de fila local dependente da réplica.

## Variáveis principais

```env
REDIS_URL=rediss://...              # Upstash
DOCUMENT_PARSER_BASE_URL=http://127.0.0.1:8080
HOST=0.0.0.0
PORT=$PORT                          # injetada pela plataforma
DOCUMENT_INGESTION_V3_ENABLED=true
```

As demais variáveis atuais do backend continuam obrigatórias, incluindo Supabase, banco, OpenRouter e credenciais de pagamento quando habilitadas.

## Inicialização

O build produzirá `backend/dist` para API/worker e preparará o ambiente Python do Docling. No boot, o supervisor iniciará os três processos e a aplicação verificará dependências por logs e health checks.

O endpoint público de health check será a API (`/health`). O parser será validado internamente em `http://127.0.0.1:8080/health` durante a inicialização ou por um health process separado do supervisor.

## Limitações assumidas

- API, worker e Docling reiniciam juntos;
- CPU e memória são compartilhados pelos três processos;
- não haverá escala independente do parser;
- o plano gratuito pode ser insuficiente para conversões Docling reais, mesmo que a API permaneça leve;
- jobs permanecem no Upstash Redis, mas resultados e arquivos continuam dependendo do Supabase Storage/Postgres;
- não haverá domínio público para o parser nem para o worker.

## Critérios de aceite

1. A imagem constrói sem depender de arquivos fora do repositório.
2. A API responde em `$PORT/health`.
3. O parser responde em `127.0.0.1:8080/health`.
4. O worker conecta ao Upstash e registra seus eventos de inicialização.
5. API e worker usam o mesmo Redis externo.
6. A morte de qualquer processo crítico aparece nos logs e causa restart controlado.
7. O deploy não exige Redis local nem domínio público adicional.
