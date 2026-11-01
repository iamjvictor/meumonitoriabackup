# Validação

| Critério | Evidência | Resultado |
|---|---|---|
| AC-001 | Teste da opção de pagamento anual | Passou |
| AC-002 | Teste garante ausência de “10% OFF” | Passou |
| AC-003 | Teste backend compara cotação e checkout Pix anual sem desconto | Passou |
| AC-004 | Contrato Asaas anual continua com 12 parcelas | Passou na suíte de pagamentos |

`npm run test:all` passou com 88 testes de contrato, 145 unitários e 18 E2E; 2 E2E ignorados pela configuração do ambiente. `npm run test:payments` passou com 44 testes. `npm run typecheck` passou em frontend e backend.
