# Relatório QA — persistência de assets visuais

## Resultado

Não encontrei bloqueio nos testes locais para tentar reprocessar o IFF. A persistência foi convertida de várias gravações sequenciais em uma instrução SQL parametrizada, com `ON CONFLICT` e atualização condicional pelo checksum. Os testes independentes cobrem 73 assets, integridade de campos, retry com atualização de metadados e a corrida de duas tentativas usando o mesmo objeto.

## Revisão do diff

- A instrução usa `Prisma.sql` com payload JSON como parâmetro; nomes de tabela/colunas são constantes, sem concatenação de entrada do usuário. O checksum diferente continua gerando erro após a confirmação da linha persistida.
- `ON CONFLICT` usa a constraint composta que existe no schema: `(document_id, parse_run_id, source_key)`. O resultado é relido e confirmado por sourceKey/checksum.
- Mesmo `sourceKey` e checksum preservam o ID e atualizam metadados de posição, tipo, bbox e caption.
- Falhas não removem objetos do Storage. Isso evita que o cleanup de uma tentativa remova um objeto usado por uma gravação concorrente ainda não commitada. O custo é que falhas permanentes podem deixar objetos órfãos; retry usa paths determinísticos, mas limpeza futura precisa de política própria.
- Não houve alteração no schema de `Question` ou migrations.

## Evidências

- Teste independente [document-visual-asset.repository.73-assets.qa.test.ts](/home/joaov/Documents/01_Projetos_Desenvolvimento/MeuMonitorAI/backend/src/repositories/__tests__/document-visual-asset.repository.73-assets.qa.test.ts): 3/3 passou — lote de 73, atualização de metadados, corrida entre falha e gravação concorrente.
- Testes existentes do repositório visual (`document-visual-asset.repository.test.ts` e `document-visual-asset.repository.asset-kind.test.ts`): 11/11 passaram.
- `npm run typecheck -- --pretty false` no diretório `backend`: passou.
- Executei `EXPLAIN (COSTS OFF)` sem `ANALYZE` contra o banco configurado, sem executar gravação. O Postgres aceitou a query e mostrou `Insert on document_visual_assets`, `Conflict Resolution: UPDATE`, o índice de conflito `document_visual_assets_document_id_parse_run_id_source_key_key`, filtro de conflito por checksum e `Function Scan on jsonb_array_elements`.

## Limites

`EXPLAIN` verifica sintaxe, colunas e índice, mas não executa nem mede a instrução. Os testes de 73 assets usam mocks e não reproduzem latência/transação real do Postgres. O reprocessamento do IFF continua sendo a validação prática de que o P2028 de 5 s foi resolvido; ele não foi executado por este agente.
