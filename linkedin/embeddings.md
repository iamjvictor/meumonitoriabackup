# Embeddings não salvam chunks ruins

Essa foi uma das lições mais importantes do nosso trabalho com RAG.

Antes de transformar um documento em embeddings, precisamos definir o que representa uma unidade de conhecimento.

Um PDF pode ter duas colunas, fórmulas, tabelas e vários assuntos na mesma página. Se cortarmos tudo em pedaços fixos, cada vetor pode representar uma mistura. A busca semântica encontrará o trecho errado com muita convicção.

Por isso, o fluxo começa antes do modelo de embedding:

```text
documento
→ blocos estruturados
→ chunks coerentes
→ conteúdo preparado
→ embedding
→ recuperação no RAG
→ resposta da LLM
```

Chunk é a unidade usada para representar uma ideia. Ele precisa preservar contexto, origem e, quando necessário, fórmulas, tabelas e imagens relacionadas.

Só então convertemos o texto em números que representam significado. Assim, uma busca pode encontrar um trecho relevante mesmo quando a pergunta usa palavras diferentes das palavras da fonte.

Mas existe uma regra simples:

> O embedding não corrige uma informação mal organizada.

Se o chunk estiver incompleto, contaminado ou com uma fórmula quebrada, o vetor continuará carregando esse problema.

Por isso validamos os chunks antes da indexação e mantemos separados o texto original, o conteúdo usado na busca e os metadados de origem. Quando o RAG recupera um trecho, sabemos também de qual documento e página ele veio.

Embeddings não são apenas uma técnica de busca. Eles transformam documentos em uma memória pesquisável para a IA.

E essa memória só é confiável quando foi construída com informação coerente desde o início.

#Embeddings #RAG
