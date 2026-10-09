# 2 - O documento tem um layout. A IA precisa saber disso.

Extrair texto de um PDF não significa entender o documento.

A ordem interna de um arquivo pode ser diferente da ordem em que uma pessoa lê a página. Em documentos com duas colunas, essa diferença mistura enunciados, exemplos e referências.

Por isso, estamos usando parsing orientado a layout. O sistema considera posição, página, ordem visual, tipo de bloco e relação com imagens, tabelas e fórmulas.

O resultado não é apenas texto extraído. É uma representação mais próxima da estrutura original.

Essa etapa reduz um problema comum em aplicações com LLM: entregar um contexto que contém as palavras certas, mas na relação errada.

Antes de buscar significado, precisamos preservar a organização que dá significado ao documento.

#DocumentAI #RAG
