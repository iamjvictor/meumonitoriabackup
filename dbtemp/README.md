# Avaliação local do processador de documentos

Este projeto Supabase é descartável e isolado do banco de desenvolvimento/produção: usa portas `563xx`, Postgres em `127.0.0.1:56322` e arquivos em `dbtemp/storage/`. O CLI já importou os PDFs nos buckets locais `monitor-documents` e `document-parser-artifacts`.

## Fixtures

- `storage/monitor-documents/Quimica-3.pdf`: material de questões (10 questões discursivas).
- `storage/monitor-documents/Estequiometria.pdf` e `pH e pOH.pdf`: resolução/anotações para base de conhecimento. A página 3 de Estequiometria contém imagem/anotações que devem permanecer recuperáveis como asset visual.
- `sql/00_extensions.sql`: habilita pgvector, dependência do schema Prisma.
- `sql/10_seed_document_e2e.sql`: tenant e documentos de teste com IDs fixos.
- `sql/90_cleanup_document_e2e.sql`: remove somente o tenant/documentos desta avaliação.
- `artifacts/`: relatórios de execução e saídas estruturadas.

## Inicialização / repetição

```bash
supabase start --workdir dbtemp
psql 'postgresql://postgres:postgres@127.0.0.1:56322/postgres' -v ON_ERROR_STOP=1 -f dbtemp/sql/00_extensions.sql
cd backend
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:56322/postgres' npx prisma db push
cd ..
psql 'postgresql://postgres:postgres@127.0.0.1:56322/postgres' -v ON_ERROR_STOP=1 -f dbtemp/sql/10_seed_document_e2e.sql
```

O histórico Prisma tem uma dependência antiga em uma tabela criada no histórico paralelo Supabase. Por isso este ambiente de avaliação usa o schema Prisma declarativo (`db push`), sem alterar/aplicar migrações de produção.

## Isolamento e limpeza

Não use `.env` de produção para a URL do banco. O teste deve sobrescrever `DATABASE_URL` com a URL local acima. Para limpar o tenant de teste, execute `sql/90_cleanup_document_e2e.sql` contra `127.0.0.1:56322`; para apagar integralmente este Postgres local, `supabase db reset --workdir dbtemp`. `supabase stop --workdir dbtemp` interrompe os serviços sem apagar os arquivos.
