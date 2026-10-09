# Deploy monolítico Koyeb/Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Empacotar API, worker Node.js e parser Python/Docling em um único container hospedável em uma única instância gratuita, usando Upstash Redis externo.

**Architecture:** Uma imagem baseada em Python 3.12 instalará o ambiente Docling, Node.js e o backend compilado. Um supervisor iniciará a API na porta `$PORT`, o worker BullMQ e o servidor HTTP Docling em `127.0.0.1:8080`. Redis continuará externo no Upstash via `REDIS_URL=rediss://...`.

**Tech Stack:** Docker, Python 3.12, uv, Docling, Node.js, TypeScript, BullMQ, ioredis, supervisord, Koyeb/Render.

**Spec:** `docs/superpowers/specs/2026-09-25-monolithic-koyeb-render-deploy-design.md`

## Global Constraints

- O parser continuará usando `services/document-parser/scripts/run_http_server.py` e o contrato `/health`/`/v1/parse`.
- O container usará uma única réplica.
- Redis não será embutido; a variável será uma URL TCP/TLS do Upstash (`rediss://`).
- A API será o único processo exposto publicamente pela porta `$PORT`.
- O worker e o parser não receberão domínio público.
- Credenciais de Supabase, OpenRouter, Asaas e Upstash serão fornecidas somente por variáveis de ambiente.

## Review Focus

- `$PORT` ausente ou não propagado: a API deve escutar na porta injetada pela plataforma.
- Um processo filho morrer: o supervisor deve registrar o erro e fazer o container sair/reiniciar de modo observável.
- Parser iniciar depois do worker: o worker deve tolerar a inicialização transitória e registrar falha/retry sem derrubar a API.
- `REDIS_URL` com `rediss://`: API e worker devem usar TLS sem exigir código especial por ambiente.
- Imagem construída a partir da raiz do monorepo: os arquivos do backend e do parser devem estar disponíveis no contexto do Docker.

### Task 1: Definir o supervisor e o entrypoint

**Files:**
- Create: `deploy/supervisord.conf`
- Create: `deploy/entrypoint.sh`
- Test: `deploy/tests/test_runtime_config.sh`

**Interfaces:**
- Consumes: `/app/backend/dist/server.js`, `/app/backend/dist/worker.js`, `/app/services/document-parser/scripts/run_http_server.py`, `$PORT` e as variáveis de ambiente do backend.
- Produces: processos `api`, `worker` e `document-parser` supervisionados; parser em `127.0.0.1:8080`.

- [ ] **Step 1: Write the failing runtime configuration test**

  O teste deve ler os arquivos de configuração e falhar se não encontrar os três programas, `$PORT`, `127.0.0.1:8080`, o comando da API, o comando do worker ou um comando que faça o processo principal sair quando o supervisor terminar.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `bash deploy/tests/test_runtime_config.sh`

  Expected: FAIL porque os arquivos `deploy/supervisord.conf` e `deploy/entrypoint.sh` ainda não existem.

- [ ] **Step 3: Implement the minimal supervisor configuration**

  Configurar `supervisord` em foreground, com `autorestart=true`, logs para stdout/stderr e os comandos:

  ```ini
  [program:api]
  command=node /app/backend/dist/server.js
  autorestart=true
  stdout_logfile=/dev/stdout
  stderr_logfile=/dev/stderr

  [program:worker]
  command=node /app/backend/dist/worker.js
  autorestart=true
  stdout_logfile=/dev/stdout
  stderr_logfile=/dev/stderr

  [program:document-parser]
  command=python /app/services/document-parser/scripts/run_http_server.py --host 127.0.0.1 --port 8080
  autorestart=true
  stdout_logfile=/dev/stdout
  stderr_logfile=/dev/stderr
  ```

  O entrypoint deve executar `exec supervisord -n -c /etc/supervisor/supervisord.conf`.

- [ ] **Step 4: Run the test to verify it passes**

  Run: `bash deploy/tests/test_runtime_config.sh`

  Expected: PASS.

### Task 2: Criar a imagem única do backend

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Test: `deploy/tests/test_dockerfile_contract.sh`

**Interfaces:**
- Consumes: `backend/package-lock.json`, `backend/package.json`, `services/document-parser/pyproject.toml`, `services/document-parser/uv.lock` e a configuração da Task 1.
- Produces: imagem com `/app/backend/dist`, ambiente Python em `/app/services/document-parser/.venv`, Node.js, uv, Docling e supervisord.

- [ ] **Step 1: Write the failing Docker contract test**

  O teste deve verificar que o Dockerfile usa Python 3.12, copia os dois lockfiles, executa `npm run build`, executa `uv sync --locked`, copia `deploy/`, expõe apenas `$PORT` via runtime e usa o entrypoint do supervisor.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `bash deploy/tests/test_dockerfile_contract.sh`

  Expected: FAIL porque ainda não existe Dockerfile na raiz.

- [ ] **Step 3: Implement the Dockerfile and dockerignore**

  Usar uma imagem `python:3.12-slim`, instalar Node.js LTS e `supervisor`, copiar primeiro os manifestos para aproveitar cache, executar `npm ci`/`npm run build` no backend, executar `uv sync --locked --no-dev --no-install-project` no parser e copiar os fontes necessários para o runtime.

  O Dockerfile deve definir `PATH=/app/services/document-parser/.venv/bin:$PATH`, `PYTHONUNBUFFERED=1`, `HOST=0.0.0.0`, `DOCUMENT_PARSER_BASE_URL=http://127.0.0.1:8080`, `EXPOSE 3000` apenas como documentação e o entrypoint do supervisor.

- [ ] **Step 4: Run the contract test and build the image**

  Run: `bash deploy/tests/test_dockerfile_contract.sh && docker build -t meumonitorai-monolith:test .`

  Expected: contrato PASS e build concluído sem erro.

### Task 3: Validar os processos dentro do container

**Files:**
- Modify: `deploy/entrypoint.sh` se necessário
- Create: `deploy/tests/test_container_smoke.sh`

**Interfaces:**
- Consumes: imagem `meumonitorai-monolith:test`, variáveis locais de teste e portas internas da Task 2.
- Produces: smoke test da API, parser e conexão do processo Node com o Redis configurado.

- [ ] **Step 1: Write the failing smoke test**

  O teste deve iniciar o container com `PORT=3000`, `REDIS_URL` de teste, `DOCUMENT_INGESTION_V3_ENABLED=true` e variáveis mínimas, aguardar `/health` da API e `/health` do parser via `docker exec`, e falhar se os processos não estiverem ativos.

- [ ] **Step 2: Run the smoke test to verify it fails**

  Run: `bash deploy/tests/test_container_smoke.sh`

  Expected: FAIL até a imagem e o runtime estarem implementados.

- [ ] **Step 3: Ajustar somente os problemas de inicialização encontrados**

  Corrigir caminhos, permissões, propagação de `$PORT`, ordem de boot e encaminhamento de logs sem alterar a lógica do backend ou do parser.

- [ ] **Step 4: Run the smoke test to verify it passes**

  Run: `bash deploy/tests/test_container_smoke.sh`

  Expected: API e parser respondem; os logs exibem inicialização da API, worker e parser.

### Task 4: Documentar o deploy na Koyeb/Render

**Files:**
- Create: `docs/deploy/monolithic-koyeb-render.md`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: imagem e variáveis das Tasks 1–3.
- Produces: procedimento repetível de deploy, lista de variáveis e troubleshooting.

- [ ] **Step 1: Write the documentation checks**

  Verificar que a documentação lista `REDIS_URL=rediss://...`, `DOCUMENT_PARSER_BASE_URL=http://127.0.0.1:8080`, `$PORT`, o comando Docker implícito, uma réplica e a necessidade de não publicar o parser/worker.

- [ ] **Step 2: Add the deployment documentation**

  Documentar criação do serviço a partir da raiz do repositório, variáveis obrigatórias, health check `/health`, volume/limite de memória, configuração de uma réplica e validação pós-deploy.

- [ ] **Step 3: Run final verification**

  Run: `bash deploy/tests/test_runtime_config.sh && bash deploy/tests/test_dockerfile_contract.sh && npm --prefix backend run typecheck && git diff --check`

  Expected: todos os testes PASS e typecheck com exit code 0.
