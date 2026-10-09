# 3 - Uma resposta confiável precisa mostrar de onde veio

Em sistemas com LLM, não basta perguntar se a resposta parece boa.

Também precisamos saber qual informação foi usada para produzi-la.

Por isso, cada bloco e cada chunk mantém metadados como documento, página, posição e origem. Quando um trecho é recuperado pelo RAG, conseguimos voltar à fonte original.

Essa é a ideia de proveniência: preservar o caminho entre a resposta e o dado que a sustentou.

Na prática, isso facilita revisão, investigação de erros e atualização da base. Se uma fonte mudar, sabemos quais conteúdos precisam ser reprocessados.

Rastreabilidade não é um detalhe administrativo. É parte da confiabilidade do sistema.

#RAG #DataProvenance
