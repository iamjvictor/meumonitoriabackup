# QA independente — busca de evidência (P3)

Plano preparado antes dos testes exploratórios, associado a AC-002/004/005.

- Isolamento: todas as fontes lexicais/vetoriais recebem apenas documentId do estado; IDs externos não podem ampliar escopo.
- Identidade/versão: versão mismatched deve falhar antes de buscas; desconhecida deve marcar cobertura parcial.
- Segmento: hits devem registrar associação comprovável ao segmento quando candidato já está segmentado; query de outro segmento deve ser rejeitada ou retornada como conflito explícito.
- Paginação: cursor deve produzir páginas sem perdas/repetições, encerrar exatamente no último hit, e não pode ser reciclado entre consulta/candidato/documento diferentes.
- Cobertura: falhas de embeddings, assets sem indexação e truncamento devem degradar para parcial, nunca declarar cobertura global completa.
- Tabelas: validar recuperação lexical/semântica de tabela com conteúdo de linhas/cabeçalho quando query natural não aparece como substring literal.

Arquivo independente `backend/src/worker/services/question-graph/__tests__/search-document-evidence.qa.test.ts`. Testes unitários usam datasource fake; SQL real e vetor pgvector precisam de banco de integração, registrados como lacuna caso não haja ambiente isolado. Não alterar produção.
