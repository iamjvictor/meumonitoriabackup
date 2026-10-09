# 13 - Embeddings também precisam de versionamento

Trocar o modelo de embedding não é uma mudança invisível.

O novo modelo pode representar os mesmos chunks em outro espaço vetorial. Nesse caso, comparar vetores antigos e novos pode produzir resultados inconsistentes.

Por isso, uma base vetorial precisa registrar a versão do modelo, a versão do conteúdo e a configuração usada na indexação.

Quando uma versão muda, conseguimos identificar o que precisa ser reindexado e evitar misturar representações incompatíveis.

Versionar embeddings é tratar a busca semântica como parte do produto, não como um detalhe descartável.

#Embeddings #DataEngineering
