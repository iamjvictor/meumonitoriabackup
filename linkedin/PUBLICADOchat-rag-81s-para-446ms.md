# De 8,1 segundos para 446 ms no retrieval do nosso chat com RAG

Uma otimização importante no Meu Monitor AI não começou trocando o modelo.

Começou entendendo o caminho que a pergunta percorria.

Antes, uma dúvida sobre uma questão anexada gerava embedding da mensagem inteira, fazia busca vetorial e depois montava o contexto. O retrieval chegava a aproximadamente 8,1 segundos.

O problema é que a própria questão já tinha fontes oficiais no banco: gabarito, chunks relacionados e escopo de monitor e matéria.

Então criamos um fast path:

- validamos o acesso do aluno;
- confirmamos que a questão pertence ao monitor e à matéria;
- buscamos as fontes oficiais diretamente pelo relacionamento da questão;
- usamos o gabarito e a explicação antes do suporte semântico;
- evitamos embedding quando a evidência é suficiente;
- armazenamos o contexto normalizado no Redis por cinco horas.

No teste real, o retrieval caiu para 446 ms.

Isso representa uma redução aproximada de 94,5% nessa etapa.

O log mostrou:

`DIRECT_QUESTION_SOURCE`

`shouldEmbed: false`

`scoreAverage: 0.9`

`retrievalSignal: strong`

O tempo total ainda ficou em 13,9 segundos, porque a geração do LLM levou 12,3 segundos. Essa separação foi essencial: o RAG deixou de ser o gargalo, e agora conseguimos medir o custo real da geração.

Também ficou claro que benchmark controlado e teste real têm papéis diferentes. O primeiro valida a arquitetura. O segundo revela o comportamento do banco, da rede, do modelo e do histórico juntos.

A próxima otimização está no prompt enviado ao LLM: o histórico chegou a 12 mensagens e o contexto final passou de 10 mil caracteres.

Arquitetura boa não é apenas adicionar componentes. É saber quando não executar uma etapa cara.

No seu sistema, você mede o tempo de recuperação separado do tempo de geração?

#RAG #InteligenciaArtificial
