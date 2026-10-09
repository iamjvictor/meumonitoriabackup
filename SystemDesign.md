# MeuMonitor AI — Arquitetura do Sistema e Guia de Operação

Este documento registra a arquitetura atual do MeuMonitor AI, os serviços que
compõem o sistema, a forma de execução local e o desenho planejado para o
primeiro deploy em nuvem.

O objetivo é que qualquer pessoa consiga entender:

- quais processos precisam estar ativos;
- qual é a responsabilidade de cada processo;
- como os serviços se comunicam;
- onde ficam os dados;
- como iniciar o ambiente local;
- como preparar o deploy do MVP;
- quais partes podem ser escaladas futuramente.

---

## 1. Visão geral do produto

O MeuMonitor AI é uma plataforma de estudos que conecta alunos, professores,
monitores de conteúdo e recursos de inteligência artificial.

O aluno pode:

- acessar matérias e monitores autorizados;
- responder questões;
- revisar flashcards;
- acompanhar desempenho e constância;
- conversar com a IA usando o conteúdo autorizado;
- anexar uma questão ou flashcard ao contexto da conversa;
- receber desafios diários.

O professor pode:

- criar e administrar monitores;
- cadastrar conteúdos;
- enviar documentos;
- acompanhar questões e flashcards gerados;
- revisar e publicar conteúdo.

O sistema combina uma aplicação web, uma API, processamento assíncrono de
documentos, Redis, banco de dados PostgreSQL, autenticação e provedores de IA.

---

## 2. Repositórios e diretórios principais

```text
MeuMonitorAI/
├── frontend/                         # Aplicação web Next.js
├── backend/                          # API Fastify, regras e worker Node.js
├── services/
│   └── document-parser/              # Serviço Python/Docling para PDFs
├── test/                             # Scripts e cenários de integração
├── docs/                             # Planos, specs e documentação de projeto
├── README.md                         # Apresentação comercial do projeto
└── systemDEsigne.md                  # Este documento
```

### Frontend

```text
frontend/
├── src/app/                          # Rotas e páginas Next.js
├── src/components/                   # Componentes compartilhados
├── src/modules/                      # Módulos de domínio da interface
├── src/shared/                       # Utilitários e contratos compartilhados
├── public/                           # Assets públicos
└── package.json
```

### Backend

```text
backend/
├── src/server.ts                     # Processo HTTP da API
├── src/worker.ts                     # Processo assíncrono do worker
├── src/routes/                       # Rotas HTTP legadas e adapters
├── src/controllers/                  # Entrada HTTP e respostas
├── src/modules/                      # Módulos verticais de negócio
├── src/services/                     # Serviços de aplicação
├── src/repositories/                 # Persistência e consultas
├── src/queues/                       # Filas BullMQ
├── src/worker/services/              # Processamento assíncrono
├── src/modules/chat/                 # Chat, contexto e RAG
├── prisma/schema.prisma              # Modelo de dados
└── package.json
```

### Document Parser

```text
services/document-parser/
├── scripts/run_http_server.py        # Entrada do serviço HTTP
├── scripts/docling_http_service.py   # Servidor e conversão Docling
├── tests/                            # Testes do parser
├── pyproject.toml                    # Dependências Python
├── uv.lock                           # Versões fixadas
└── Dockerfile
```

---

## 3. Desenho atual da arquitetura

```text
                         ┌─────────────────────────┐
                         │        Navegador         │
                         │  aluno / professor       │
                         └────────────┬────────────┘
                                      │ HTTPS/HTTP
                                      ▼
                         ┌─────────────────────────┐
                         │ Frontend Next.js        │
                         │ frontend                 │
                         │ local: 3000              │
                         └────────────┬────────────┘
                                      │ REST/JSON + cookies
                                      ▼
                         ┌─────────────────────────┐
                         │ Backend API Fastify      │
                         │ backend/src/server.ts   │
                         │ local: 8443              │
                         └──────┬────────┬─────────┘
                                │        │
                     consultas │        │ jobs
                                │        ▼
                                │  ┌───────────────┐
                                │  │ Redis          │
                                │  │ chat + BullMQ  │
                                │  │ local: 6379    │
                                │  └───────┬───────┘
                                │          │ consome jobs
                                ▼          ▼
                    ┌────────────────┐  ┌────────────────────────┐
                    │ Supabase       │  │ Backend Worker          │
                    │ PostgreSQL     │  │ backend/src/worker.ts   │
                    │ Auth           │  │ Node.js + BullMQ        │
                    │ Storage        │  └───────────┬────────────┘
                    └────────────────┘              │ HTTP /v1/parse
                                                     ▼
                                          ┌────────────────────────┐
                                          │ Document Parser          │
                                          │ Python + Docling         │
                                          │ local: 8080              │
                                          └────────────────────────┘

                    API e Worker também acessam:
                    ┌────────────────────────┐
                    │ OpenRouter              │
                    │ chat, geração e        │
                    │ embeddings              │
                    └────────────────────────┘
```

### Componentes externos

O sistema não inicia localmente os seguintes componentes:

- Supabase Auth: autenticação dos usuários;
- Supabase PostgreSQL: dados da aplicação;
- Supabase Storage: arquivos e artefatos persistidos;
- OpenRouter: modelos de chat, geração de questões, flashcards e embeddings.

---

## 4. Processos em execução local

Atualmente o ambiente local usa quatro terminais principais.

### Terminal 1 — Frontend

Diretório:

```bash
cd ~/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/frontend
```

Comando:

```bash
npm run dev
```

Responsabilidades:

- renderizar a interface;
- controlar navegação e estados visuais;
- enviar requisições para a API;
- exibir questões, flashcards, chat e desempenho;
- manter a sessão do usuário no navegador.

Porta padrão local: `3000`.

### Terminal 2 — Backend/API

Diretório:

```bash
cd ~/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend
```

Comando de desenvolvimento:

```bash
npm run dev
```

Comando de produção:

```bash
npm run build
npm run start
```

Responsabilidades:

- receber requisições HTTP;
- autenticar e autorizar usuários;
- validar entradas com Zod;
- aplicar regras de negócio;
- consultar o PostgreSQL via Prisma;
- acessar o histórico do chat no Redis;
- criar jobs para processamento assíncrono;
- responder ao frontend.

Porta local configurada pelo `PORT`; no ambiente atual, normalmente `8443`.

Health check:

```bash
curl http://localhost:8443/health
```

### Terminal 3 — Worker

Diretório:

```bash
cd ~/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend
```

Comando de desenvolvimento:

```bash
npm run worker:dev
```

Comando de produção:

```bash
npm run build
npm run worker
```

Responsabilidades:

- consumir a fila `monitor-documents` no BullMQ;
- processar documentos;
- chamar o Document Parser quando a ingestão V3 estiver habilitada;
- extrair e normalizar texto;
- criar chunks e embeddings;
- extrair questões;
- gerar e revisar flashcards;
- executar o scheduler do desafio diário;
- registrar falhas e concluir jobs.

O worker não recebe tráfego do navegador e não deve ser exposto publicamente.

### Terminal 4 — Document Parser

Diretório:

```bash
cd ~/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/services/document-parser
```

Preparação inicial:

```bash
uv sync --locked
```

Comando:

```bash
uv run python scripts/run_http_server.py --host 0.0.0.0 --port 8080
```

Health check:

```bash
curl http://localhost:8080/health
```

Responsabilidades:

- receber PDF por HTTP;
- executar a conversão com Docling;
- devolver markdown e estrutura de layout;
- informar status e erros do parser.

O parser não acessa Prisma, Supabase, Redis ou OpenRouter. Ele é um serviço
especializado e isolado.

### Redis

O Redis pode estar rodando em segundo plano e, por isso, não ocupar um dos
quatro terminais.

Verificação:

```bash
redis-cli ping
```

Resposta esperada:

```text
PONG
```

Caso não esteja rodando:

```bash
redis-server
```

Porta local: `6379`.

---

## 5. Fluxos principais

### 5.1 Acesso ao sistema

```text
Usuário
  │
  ▼
Frontend
  │ login/signup
  ▼
Backend
  │
  ▼
Supabase Auth
  │ sessão/token
  ▼
Backend grava cookies HttpOnly
  │
  ▼
Frontend acessa rotas protegidas
```

O frontend não deve possuir a chave administrativa do Supabase. Chaves
server-only permanecem exclusivamente no backend.

### 5.2 Processamento de documento

```text
Professor envia PDF
  │
  ▼
Frontend → Backend API
  │ salva o documento e cria job
  ▼
Redis/BullMQ
  │
  ▼
Worker
  │ chama parser
  ▼
Document Parser/Docling
  │ devolve layout e markdown
  ▼
Worker normaliza e persiste
  │
  ├── chunks
  ├── embeddings
  ├── questões
  └── flashcards
       │
       ▼
Supabase PostgreSQL/Storage
```

O upload não deve ficar bloqueado esperando toda a geração de conteúdo. A
API registra o job e o worker executa o processamento em segundo plano.

### 5.3 Chat com contexto

```text
Aluno envia mensagem
  │
  ▼
Frontend → Backend Chat API
  │ valida usuário, matéria e referências
  ├── lê histórico no Redis
  ├── recupera evidências autorizadas no PostgreSQL
  ├── consulta OpenRouter
  └── salva contexto/histórico no Redis
       │
       ▼
Resposta para o frontend
```

No estágio atual, o contexto conversacional do chat fica no Redis. O
PostgreSQL permanece como fonte oficial das entidades e evidências, enquanto
o Redis mantém o histórico operacional da conversa.

### 5.4 Desafio diário

```text
Worker inicia
  │
  ▼
Scheduler calcula o próximo horário local
  │
  ▼
À meia-noite executa a geração
  │
  ▼
Persiste o desafio no PostgreSQL
```

O scheduler está dentro do processo do worker. Portanto, se o worker estiver
desligado no horário previsto, a execução dependerá da estratégia de
recuperação implementada pelo scheduler.

---

## 6. Variáveis de ambiente essenciais

As variáveis devem ser configuradas no `backend/.env` localmente e nos
secrets da plataforma em produção.

### Backend

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=8443

DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379

SUPABASE_URL=https://...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

OPENROUTER_API_KEY=...
```

### Document Parser

```env
DOCUMENT_INGESTION_V3_ENABLED=false
DOCUMENT_PARSER_BASE_URL=http://127.0.0.1:8080
DOCUMENT_PARSER_REQUEST_TIMEOUT_MS=30000
DOCUMENT_PARSER_MAX_ATTEMPTS=1
```

Quando API, worker e parser estiverem em serviços distintos, o valor
`DOCUMENT_PARSER_BASE_URL` deverá apontar para o domínio privado ou interno do
serviço do parser, e não para `127.0.0.1`.

Da mesma forma, `REDIS_URL` em produção deverá apontar para o Redis gerenciado
ou para o domínio privado fornecido pela plataforma.

Nunca versionar:

- `SUPABASE_SERVICE_ROLE_KEY`;
- `OPENROUTER_API_KEY`;
- `DATABASE_URL` com credenciais;
- `REDIS_URL` com senha;
- tokens, cookies ou chaves de webhook.

---

## 7. Como iniciar o ambiente local

### Pré-requisitos

- Node.js compatível com o projeto;
- npm;
- Python 3.12;
- `uv`;
- Redis;
- acesso ao Supabase;
- variáveis do OpenRouter;
- dependências instaladas.

### Instalação

Frontend:

```bash
cd frontend
npm install
```

Backend:

```bash
cd backend
npm install
npx prisma generate
```

Parser:

```bash
cd services/document-parser
uv sync --locked
```

### Ordem de inicialização

```text
1. Redis
2. Document Parser
3. Backend API
4. Backend Worker
5. Frontend
```

O frontend pode ser iniciado antes dos demais processos, mas as telas que
dependem da API só funcionarão quando o backend estiver disponível.

### Erro de porta ocupada

Se aparecer `EADDRINUSE`, alguma instância já está usando a porta.

Verifique a API:

```bash
lsof -nP -iTCP:8443 -sTCP:LISTEN
```

Verifique o parser:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

Verifique o Redis:

```bash
lsof -nP -iTCP:6379 -sTCP:LISTEN
```

Não iniciar uma segunda instância na mesma porta. Primeiro confirmar se a
instância existente já é o processo desejado.

---

## 8. Desenho de deploy do MVP

Para o primeiro ambiente publicado, o frontend pode ficar separado e o
backend pode ser comprimido em poucos serviços para reduzir custo.

### Opção recomendada

```text
Cloudflare ou outro host
└── Frontend Next.js

Railway — projeto MeuMonitorAI
├── Serviço backend-api
│   └── API HTTP
├── Serviço backend-worker
│   └── Worker + desafio diário
├── Serviço Redis
│   └── BullMQ + histórico do chat
└── Document Parser
    └── serviço separado quando necessário

Supabase
├── PostgreSQL
├── Auth
└── Storage
```

### Opção econômica para o primeiro MVP

```text
Railway — um serviço backend
├── API
└── Worker

Redis gerenciado ou externo

Frontend separado

Document Parser desativado ou executado em ambiente separado
```

Essa opção exige um comando de inicialização que mantenha API e worker ativos
no mesmo container. É uma solução de economia para validação inicial, não o
desenho final de escala.

O parser Docling deve ser tratado como o processo mais pesado. Não é indicado
misturá-lo com API e worker no mesmo processo quando o sistema começar a
receber uso real.

### Configuração de serviços na Railway

#### Serviço API

Diretório de origem: `backend/`

Build:

```bash
npm install
npm run build
```

Start:

```bash
npm run start
```

A plataforma deve encaminhar a porta definida pela variável `PORT`.

#### Serviço Worker

Diretório de origem: `backend/`

Build:

```bash
npm install
npm run build
```

Start:

```bash
npm run worker
```

Esse serviço não precisa de domínio público.

#### Redis

O backend e o worker devem receber o mesmo `REDIS_URL`.

O Redis precisa ser persistente o suficiente para o uso esperado das filas e
deve possuir política de expiração adequada para o histórico do chat.

#### Document Parser

Quando for publicado, o serviço deverá:

- usar o `Dockerfile` existente ou uma imagem Python equivalente;
- expor a porta configurada pela plataforma;
- responder em `/health`;
- ser acessível pelo worker através de rede privada;
- não ser exposto publicamente sem autenticação interna.

---

## 9. Por que API e worker são processos diferentes

A API atende requisições interativas e precisa responder rapidamente. O
worker executa tarefas demoradas e imprevisíveis.

Manter os processos separados permite:

- um PDF pesado não travar o login ou o chat;
- reiniciar o worker sem derrubar a API;
- aumentar a concorrência do processamento no futuro;
- observar filas e falhas separadamente;
- manter o scheduler do desafio diário ativo independentemente do tráfego HTTP.

No MVP de baixo custo, eles podem temporariamente compartilhar o mesmo
container, mas continuam sendo responsabilidades distintas no código.

---

## 10. Por que o parser é separado

O Document Parser possui runtime Python, dependências específicas e modelos
de processamento de PDF. Ele não precisa conhecer as regras do MeuMonitor AI.

O isolamento oferece:

- atualização independente do Docling;
- testes de contrato HTTP;
- menor acoplamento com Prisma e Supabase;
- possibilidade de usar mais memória somente para o parser;
- substituição futura do Docling por outro parser.

O worker permanece responsável pela orquestração e persistência. O parser
somente converte o arquivo em uma representação estruturada.

---

## 11. Segurança e fronteiras

### Frontend

- não possui chaves administrativas;
- não acessa diretamente o banco;
- envia apenas referências necessárias para a API;
- depende da API para autorização de matérias, monitores, questões e
  flashcards.

### API

- autentica o usuário;
- verifica escopo de acesso;
- valida payloads com Zod;
- não confia em títulos ou textos enviados pelo navegador;
- controla o acesso a documentos e evidências;
- mascara ou omite dados sensíveis nos logs.

### Worker

- não deve ser público;
- deve usar as mesmas credenciais internas necessárias para o processamento;
- deve ser idempotente ao reprocessar jobs;
- deve registrar o status de cada etapa;
- deve encerrar conexões com Redis e Prisma de forma controlada.

### Parser

- deve aceitar somente requisições do worker;
- deve limitar tamanho e tipo de arquivo;
- não deve receber chaves do banco ou do OpenRouter;
- deve expor somente health check e endpoint de parsing;
- não deve persistir dados de negócio.

---

## 12. Operação e diagnóstico

### Sinais de que o ambiente está saudável

API:

```bash
curl http://localhost:8443/health
```

Parser:

```bash
curl http://localhost:8080/health
```

Redis:

```bash
redis-cli ping
```

Worker:

No log deve aparecer a mensagem equivalente a:

```text
Worker de documentos conectado ao Redis
```

### Problemas comuns

#### API não inicia

Possíveis causas:

- porta já ocupada;
- variável obrigatória ausente;
- falha de conexão com banco;
- sessão de Prisma desatualizada.

Verificações:

```bash
npm run typecheck
npx prisma validate
lsof -nP -iTCP:8443 -sTCP:LISTEN
```

#### Worker não inicia

Possíveis causas:

- Redis indisponível;
- migration obrigatória ausente;
- `DATABASE_URL` inválida;
- `REDIS_URL` inválida;
- chave do OpenRouter ausente quando a etapa exigir IA.

Verificações:

```bash
redis-cli ping
npx prisma migrate deploy
npm run typecheck
```

#### Documento não processa

Verificar nesta ordem:

1. API recebeu o upload;
2. job foi criado no Redis;
3. worker está conectado;
4. parser responde `/health`;
5. `DOCUMENT_INGESTION_V3_ENABLED` está correto;
6. `DOCUMENT_PARSER_BASE_URL` aponta para o endereço correto;
7. o documento não excede os limites;
8. há memória suficiente para o parser.

#### Chat sem contexto

Verificar:

1. `REDIS_URL` está correto;
2. o histórico foi gravado no Redis;
3. a matéria está autorizada;
4. a referência enviada é validável;
5. o backend conseguiu consultar as evidências;
6. o OpenRouter respondeu.

---

## 13. Build, testes e validação antes do deploy

### Frontend

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

### Backend

```bash
cd backend
npm run lint
npm run typecheck
npm run build
```

Testes relevantes do backend:

```bash
npm run test:chat
npm run test:document-parser-unit
npm run test:flashcard-generation
```

### Document Parser

```bash
cd services/document-parser
UV_CACHE_DIR=/tmp/meumonitorai-docling-uv-cache \
uv run python -m unittest discover -s tests -p 'test_*.py' -v
```

### Checklist de aceite

- [ ] Frontend abre e consegue autenticar.
- [ ] API responde `/health`.
- [ ] Worker conecta no Redis.
- [ ] Redis responde `PONG`.
- [ ] Parser responde `/health`.
- [ ] Upload cria job.
- [ ] Worker consome e finaliza job.
- [ ] Chat recupera contexto do Redis.
- [ ] Questões e flashcards autorizados aparecem corretamente.
- [ ] Desafio diário permanece agendado.
- [ ] Logs não expõem segredos.
- [ ] Migrations foram aplicadas no banco de produção.

---

## 14. Evolução planejada

### Fase 1 — MVP no ar

- frontend separado;
- API e worker no mesmo serviço ou em dois serviços pequenos;
- Redis gerenciado;
- Supabase como banco, autenticação e storage;
- parser separado ou desativado até validar o fluxo de documentos;
- histórico do chat mantido no Redis.

### Fase 2 — Separação operacional

- API e worker em serviços independentes;
- parser em serviço próprio;
- métricas de fila;
- retries e idempotência de jobs;
- alertas de falha;
- logs centralizados;
- domínio e HTTPS configurados.

### Fase 3 — Escala

- múltiplos workers;
- filas por tipo de processamento;
- limites de concorrência por tarefa;
- armazenamento de histórico durável quando necessário;
- streaming do chat;
- autenticação interna entre serviços;
- autoscaling;
- processamento de documentos mais pesados em máquinas dedicadas.

---

## 15. Decisão atual de infraestrutura

Para o MVP, a decisão registrada é:

```text
Frontend: serviço separado
Backend: Railway
Worker: Railway, inicialmente podendo compartilhar o serviço da API
Redis: serviço gerenciado ou externo
PostgreSQL/Auth/Storage: Supabase
IA: OpenRouter
Document Parser: separado quando a ingestão V3 for ativada
AWS: avaliar somente após validação do MVP e necessidade de controle maior
```

Essa decisão prioriza colocar o produto no ar rapidamente, com baixo custo e
sem transformar a primeira versão em uma operação de infraestrutura complexa.

