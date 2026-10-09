# 1 - RAG começa antes do prompt

Muita gente começa um projeto de RAG escolhendo o modelo de linguagem.

No nosso caso, começamos pelo documento.

Um PDF pode misturar colunas, títulos, fórmulas, tabelas, rodapés e conteúdos diferentes na mesma página. Se essa informação entra desorganizada na base, a IA recupera contexto errado e responde com confiança.

Por isso, o fluxo precisa preparar o conhecimento antes da pergunta:

```text
documento → estrutura → chunks → embeddings → recuperação → resposta
```

RAG não é apenas conectar uma LLM a um banco vetorial. É construir uma base em que cada trecho tenha contexto, origem e significado.

A qualidade da resposta começa muito antes do prompt.

#RAG #InteligenciaArtificial
