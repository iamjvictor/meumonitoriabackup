# Teste local do fluxo agentic de questões

Este launcher inicia a API e o worker apontados somente para os serviços locais de `dbtemp`. Ele constrói um ambiente por allowlist: lê `OPENROUTER_API_KEY`, os modelos e os parâmetros de IA necessários de `backend/.env`, mas não herda nem repassa `DATABASE_URL`, variáveis `SUPABASE_*` ou `REDIS_URL` do terminal ou do arquivo. As chaves locais do Supabase são obtidas pelo `supabase status` e nunca são impressas.

## Serviços necessários

- Supabase local iniciado em `dbtemp`: Postgres `127.0.0.1:56322`, gateway `http://127.0.0.1:56321`.
- Redis dedicado para este teste em `127.0.0.1:56379`.
- Docling local respondendo em `http://127.0.0.1:8080`.
- `backend/.env` com `OPENROUTER_API_KEY`, `OPENROUTER_QUESTION_MODEL` e `OPENROUTER_EMBEDDING_MODEL` preenchidos.

O script recusa URLs diferentes das acima e usa o diretório desta pasta como `cwd`, que não pode conter um arquivo `.env`. Isso impede que o `dotenv` do backend preencha variáveis ausentes com valores remotos. O endpoint da API fica em `http://127.0.0.1:33671`.

### Redis isolado

Não use Redis em `6379`: ele pode conter filas de outro ambiente que o worker consumiria. Suba uma instância sem volume persistente e com a porta publicada somente no loopback:

```bash
docker run -d --name meumonitor-agentic-redis \
  -p 127.0.0.1:56379:6379 redis:7-alpine
```

Esse comando cria um container novo, sem montar nem apagar volumes existentes. Se o container já existir, confira seu estado com `docker ps --filter name=meumonitor-agentic-redis`; não remova volumes nem reutilize o Redis de `6379`.

## Primeiro uso

1. Inicie o Supabase local e o Docling e suba o Redis dedicado acima. O launcher verifica os serviços antes de iniciar os processos.
2. Inicialize o schema isolado de checkpoints, somente quando quiser habilitar esse DDL no banco local:

   ```bash
   node tests/document-parser/local-agentic/start-local.mjs --setup-local
   ```

   Essa opção exige conexão exata com `127.0.0.1:56322/postgres` e usa exclusivamente o schema `question_graph_local_test`. Não aponta para `public`, não roda migrations Prisma e não deve ser adaptada para banco remoto. O comando usa o `setup()` oficial do saver LangGraph; rode-o apenas contra o `dbtemp` local.

3. Inicie API e worker juntos:

   ```bash
   node tests/document-parser/local-agentic/start-local.mjs
   ```

O processo define `QUESTION_EXTRACTION_LANGGRAPH_ENABLED=true` e `QUESTION_GRAPH_CHECKPOINT_SCHEMA=question_graph_local_test`. `REDIS_URL` aponta exclusivamente para `redis://127.0.0.1:56379`. `Ctrl+C` encerra API e worker; o container Redis continua ativo.

O launcher é somente de execução: não cria usuário professor, monitor, turma ou arquivo de upload. Use seu fluxo de autenticação de teste local para enviar o PDF pelo endpoint/interface e atribuí-lo a um monitor.

## Limitação da autenticação da interface

O frontend não é iniciado nem reconfigurado por este pacote. Para testar pelo browser, ele precisa apontar para a API `127.0.0.1:33671` e para o Supabase local `127.0.0.1:56321`, além de ter uma conta local de professor com perfil e monitor associados no banco local. Um login existente no Supabase remoto não autentica no Supabase local. Não altere o `.env` remoto do frontend para este teste; use uma configuração local/temporária.

## Segurança e escopo

- O processo recusa se `supabase status` não devolver exatamente `http://127.0.0.1:56321`.
- `DATABASE_URL`, Supabase, Redis e parser são valores locais fixos; o Redis é dedicado em `56379`, e os valores remotos de `backend/.env` e do ambiente de shell são ignorados.
- Apenas configurações de IA em uma allowlist e a chave OpenRouter selecionada são passadas aos filhos. Nenhum valor secreto é impresso.
- Pagamentos ficam simulados; chaves Asaas/Resend não são herdadas.
- O teste pode enviar conteúdo à API OpenRouter usando a chave e o modelo configurados em `backend/.env`.
