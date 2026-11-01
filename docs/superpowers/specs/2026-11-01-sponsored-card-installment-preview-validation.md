# Validação — estimativa de parcelas e tentativa anterior

- AC-001/002: QA independente aprovou 27 testes de tela e estimativa, incluindo arredondamento e ausência em Pix/mensal; typecheck frontend aprovado.
- AC-003/004: QA independente aprovou 17 testes de criação/controller, incluindo falha sem nova chamada ao provider, pendência e reutilização de URL; typecheck backend aprovado.
- A tentativa Pix existente foi consultada apenas em leitura: estado `CHECKOUT_CREATION_FAILED`, sem ID/URL de checkout e sem evento de checkout correlacionado. A causa original não foi persistida no banco e o stdout histórico do backend não estava disponível nesta sessão.
- Nenhum checkout, cobrança ou alteração remota foi criado nesta implementação. Não houve validação autenticada ponta a ponta com o Asaas; uma integração de banco foi ignorada na suíte do implementador por depender de ambiente isolado.
