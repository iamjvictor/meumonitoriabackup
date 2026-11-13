# Validação

- Matriz de 1 e 10 alunos e quatro combinações: aprovada com provider fake; Pix mensal é DETACHED e cartão mensal RECURRENT.
- Frontend: 23 testes de tela e typecheck aprovados. Backend: typecheck e testes focados aprovados.
- Suíte completa de pagamentos: 222 aprovados, 39 ignorados e 2 falhas em testes anteriores de checkout direto relacionados ao fallback sem split.
- Confirmação Pix mensal após expiração: lógica e teste unitário revisados; teste de persistência ignorado por falta de banco isolado `mm_asaas_flow_test`.
- Sandbox Pix não validado com sucesso: conta sandbox sem chave Pix, conforme teste anterior. Sem checkout ou cobrança de produção nesta mudança.
- Webhook configurado: `https://meumonitor-api-worker-production.up.railway.app/api/v1/payments/webhooks/asaas`. Base de retorno: `https://www.meumonitoria.com.br/checkout/retorno` com `batchId` e `status`.
