# Campos obrigatórios ao editar questões

## Intenção

Impedir que a revisão/edição salve uma questão sem enunciado, as cinco alternativas preenchidas e um gabarito válido, mostrando os campos pendentes antes do envio. A explicação passa a ser opcional no frontend e no backend.

## Abordagens

1. **Recomendação — validação visual no editor e validação independente na API.** A interface ajuda o professor a corrigir o rascunho; a API protege atualizações diretas. Reutiliza as cinco alternativas que o fluxo de aprovação já exige.
2. Validar apenas no frontend. Rejeitada porque chamadas diretas ainda poderiam salvar questões incompletas.
3. Validar somente no backend. Rejeitada porque o professor só veria o erro depois da tentativa, sem indicação visual nos campos.

## Escopo e limites

- Editor de questões do monitor, incluindo sua chamada de atualização.
- API `PUT/PATCH /:monitorId/questions/:questionId[/review]`.
- Enunciado não pode ficar vazio; alternativas A a E devem existir e conter texto; gabarito deve apontar para uma alternativa preenchida.
- Explicação pode ser omitida, nula ou vazia; não é requisito para aprovação.
- Revisões somente de status (aprovar/rejeitar em lote) mantêm seu fluxo atual; a API valida a completude efetiva ao aprovar.
- Não altera o fluxo de criação de questão manual nem outros componentes de revisão.

## Critérios de aceite

- **AC-005:** ao tentar salvar uma edição incompleta, o frontend não envia a requisição; identifica visualmente os campos inválidos e permite corrigir o rascunho.
- **AC-006:** a API rejeita edição de conteúdo que deixaria enunciado vazio, alternativas incompletas ou gabarito ausente/inválido, com 422 e mensagem de campo clara.
- **AC-007:** uma edição/aprovação válida sem explicação (ou com explicação vazia) é aceita tanto pela interface quanto pela API.
- **AC-008:** uma edição válida mantém o envio atual e atualiza a questão com sucesso; ações somente de status continuam funcionando.

## Chamadas técnicas

Reutilizar um validador frontend puro no handler de salvar e no método de serviço de atualização para bloquear a chamada antes de `fetch`; apresentar mensagens junto aos campos depois da primeira tentativa de salvar. No backend, validar valores efetivos resultantes da edição; requisitos de enunciado/alternativas/gabarito também se aplicam a aprovação sem payload de edição, sem exigir explicação.
