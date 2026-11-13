# Preparação para o banco de questões

`questoes.json` usa nomes de colunas SQL. Os 480 registros estão em `REJECTED` para evitar uso antes da revisão; 14 têm `correct_answer` ANULADA e nenhuma alternativa correta. A validação da aplicação atualmente não aceita MANUAL, PROCESSO_SELETIVO ou alternativas anuladas; precisa ser adaptada antes da importação.

As imagens estão em `imagens/` e mapeadas por questão, ordem, página e SHA-256 em `referencias-imagens.json`. Os endereços públicos são nulos enquanto o bucket não existir. `image_urls` está vazio e o HTML ainda não contém as imagens; não importar como questão completa até publicar e posicionar as imagens.

`source_fetched_at` registra a data de preparação deste arquivo local, pois não se conhece a data original de obtenção do PDF. Não comprova a data de publicação da prova. Os nomes das provas e o tipo PROCESSO_SELETIVO são descrições normalizadas para identificação, a confirmar no fluxo de importação. Os textos e as posições exatas das imagens exigem revisão contra o PDF.

O SQL define uma tabela de ligação a `question_bank_items`, com URL pública, ordem e página de origem; acesso pela API bloqueado até definição de políticas. Não há UUID de questão nem registros para inserir na tabela de referências antes de importar as questões.
