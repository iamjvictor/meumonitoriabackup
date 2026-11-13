# Plano QA — persistência de assets visuais em lote

## Relação com os critérios existentes

Este plano complementa `test-plan.md` e verifica especificamente a persistência do PDF IFF com 73 assets visuais, dentro de AC-005, AC-006 e AC-007. Não altera os critérios de aceite da spec.

## Escopo e isolamento

- Usar 73 assets sintéticos e mocks locais de Prisma e storage.
- Não conectar a Supabase/Postgres remoto, não reiniciar serviços e não reprocessar o IFF nesta suíte.
- Deixar a validação real do documento para a execução coordenada pelo arquiteto após aprovação dos testes locais.
- Preservar os testes existentes de `DocumentVisualAssetRepository`; criar testes QA em arquivo separado.

## Cenários

| Critério | Cenário | Resultado esperado |
| --- | --- | --- |
| AC-005 | Persistir 73 assets dentro do repositório com estratégia de escrita em lote; observar chamadas de consulta e escrita do Prisma. | O caminho de gravação não emite uma consulta de escrita por asset; usa consulta/escrita set-based ou um limite transacional explícito compatível com a operação, sem adicionar deadline na chamada de IA. |
| AC-005 | Construir entrada determinística com 73 keys/bytes/SHA, posições, páginas, dimensões, kind e parseRunId únicos. | Retorno contém exatamente 73 mapeamentos key→assetId; todos os registros mantêm metadados, hash e relação com parseRun/documento corretos. |
| AC-006 | O mock de storage e Prisma executa um lote completo sem perder, reordenar ou duplicar assets. | Há 73 uploads/upserts esperados, com idempotency/path estável em repetição da mesma entrada. |
| AC-006 | Simular erro na escrita DB e erro no upload de um asset. | A falha é propagada com causa/status observável; não é reportada conclusão com contagem parcial. Repetição pode completar sem duplicar assets. |
| AC-006 | Duas tentativas concorrentes usam o mesmo path; uma falha antes do commit e a outra conclui depois. | Cleanup da tentativa falha não deixa uma linha committed apontando para objeto removido. |
| AC-006 | Repetir o mesmo `parseRunId`/`sourceKey`/checksum com metadados de posição/tipo/caption corrigidos. | A linha resultante reflete a política de retry documentada e não mantém silenciosamente metadados obsoletos. |
| AC-007 | Executar testes QA novos junto dos testes existentes do repositório visual e typecheck. | Registrar comandos e evidência; não declarar validação do IFF real a partir de mocks. |

## Limites da evidência

Mock Prisma pode provar que o timeout/configuração foi passado e que o contrato trata 73 itens, mas não mede latência real do Postgres nem confirma que 73 gravações cabem no timeout em Supabase. Se não houver DB local isolado, essa validação e o replay IFF permanecem pendentes.
