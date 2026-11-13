# Tratamento de erros na revisão de questões

## Intenção

Fazer a atualização/revisão de questão explicar ao professor quais dados ou requisitos precisam de correção, em vez de retornar um 500 genérico para erros previsíveis. Falhas inesperadas devem continuar protegidas da resposta pública, mas deixar diagnóstico útil no log do servidor.

## Escopo e limites

- Escopo: rotas `PUT/PATCH /:monitorId/questions/:questionId[/review]`, controller e persistência de revisão em `content-review.repository.ts`.
- Erros de payload, requisitos para aprovar e IDs de tópico/matéria incompatíveis com o monitor serão respostas 4xx com código e mensagem claros.
- Questão inexistente ou não pertencente ao monitor permanece 404.
- Erros inesperados permanecem 500; o log inclui contexto e causa técnica, nunca o payload nem o enunciado da questão.
- Não altera fluxos de criação, flashcards, formatos gerais do error handler nem persistência.

## Abordagens consideradas

1. **Recomendação — mapear erros de domínio no controller e validar escopo no repositório.** Mantém o contrato HTTP na borda e a regra de ownership junto aos dados; logs detalhados ficam restritos ao servidor.
2. Expor a mensagem de qualquer exceção diretamente ao cliente. Rejeitada por poder divulgar detalhes internos do Prisma/infraestrutura.
3. Alterar o error handler global. Rejeitada porque amplia o risco e o escopo para endpoints sem relação com esta falha.

## Critérios de aceite

- **AC-001:** erros de validação do payload informam o campo e o motivo em resposta 422.
- **AC-002:** ausência de tópico, gabarito, cinco alternativas válidas ou explicação ao aprovar retorna erro 422 específico; IDs inexistentes ou de outro monitor também retornam erro 4xx claro.
- **AC-003:** falha inesperada continua retornando 500 genérico ao professor e produz log com requestId, monitorId, questionId e causa técnica, sem texto do payload.
- **AC-004:** questão inexistente/não autorizada continua respondendo 404 e atualização bem sucedida preserva o contrato atual.

## Chamadas técnicas

Usar erros de domínio identificáveis e conversão explícita para `AppError` no controller. Resumir issues Zod por caminho de campo, sem ecoar valores recebidos. Registrar exceções inesperadas com `request.log` e metadados de rota; não registrar `request.body`.
