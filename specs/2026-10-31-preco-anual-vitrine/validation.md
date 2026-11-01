# Validação

| Critério | Tarefa | Evidência | Resultado |
| --- | --- | --- | --- |
| AC-001 | T-001 | Cards dos dois layouts mostram 12x de R$ 47,92 no cartão ou R$ 575,04 à vista quando anual está disponível. | Implementado; contratos e unitários passaram. |
| AC-002 | T-001 | Seletor anual informa 12 parcelas no cartão e o total à vista. | Implementado; unitário da vitrine passou. |
| AC-003 | T-002 | Checkout envia `DETACHED` + `INSTALLMENT` com limite 12; `calculateAnnualPriceCents(5990) = 57504`; pedido persiste `serviceMonths = 12`; webhook anual concede o período de forma idempotente. | Backend payments 44/44 passaram. |

O payload do provider foi confirmado pelo contrato automatizado; não foi criado checkout real no Sandbox. As taxas finais dependem da configuração da conta Asaas.
