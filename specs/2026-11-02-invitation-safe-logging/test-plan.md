# Plano independente de QA — logs seguros da ativação do convite

Escopo: logs emitidos pelas etapas de ativação do convite no use case e controller. Testes unitários com repositórios/provisionadores e request logger locais; sem API externa, banco compartilhado ou envio de e-mail.

Critérios de aceite da tarefa:
- AC-LOG-001: etapas lookup, checagem de conta, provisionamento e resgate registram início, sucesso ou falha sem e-mail, nome, token, senha, payload, mensagem de exceção ou sessão.
- AC-LOG-002: falhas usam apenas classificação e códigos internos seguros; cada erro continua sendo propagado/mapeado com o mesmo contrato HTTP e sem mensagem sensível.
- AC-LOG-003: falha do observador/logger não altera sucesso, falha, ordenação ou efeitos da ativação.

| ID | Cenário | Nível | Critério | Resultado esperado |
|---|---|---|---|---|
| QA-LOG-001 | Sucesso de ativação completa todas as quatro etapas | Unit | AC-LOG-001 | Observer registra quatro pares started/completed em ordem; nenhum valor pessoal, token ou senha nos eventos serializados. |
| QA-LOG-002 | Erro do provedor ao provisionar conta com mensagem contendo dados sensíveis | Unit | AC-LOG-001, AC-LOG-002 | Evento final contém apenas tipo/código allowlisted; erro original continua propagado e mensagem sensível não chega ao observer. |
| QA-LOG-003 | Erro ao resgatar vaga após provisionamento | Unit | AC-LOG-001, AC-LOG-002 | Falha atribuída a `seat_redemption`; conta criada e erro permanecem com semântica original, sem detalhes privados nos eventos. |
| QA-LOG-004 | Controller transforma AuthRepositoryError em resposta pública | Unit/API controller | AC-LOG-001, AC-LOG-002 | Request logger recebe só evento/etapa/resultado/tipo/código; resposta permanece código HTTP público esperado e omite mensagem original. |
| QA-LOG-005 | Observer que lança exceção durante cada callback | Unit | AC-LOG-003 | Callback de observabilidade não altera resultado da ativação nem substitui a exceção real da operação. |

Comandos previstos: `cd backend && ASAAS_WEBHOOK_URL=https://qa.invalid/api/v1/payments/webhooks/asaas node --import tsx --test src/modules/payments/__tests__/sponsored-seat-invitation.use-case.test.ts src/modules/payments/__tests__/sponsored-seat-invitation.controller.test.ts src/modules/payments/__tests__/sponsored-seat-invitation-safe-logging.qa.test.ts` e `npm run typecheck`. A URL `qa.invalid` é apenas para satisfazer a validação local de ambiente; nenhum serviço externo é chamado.
