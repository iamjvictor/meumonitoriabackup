# Validação

| Critério | Evidência | Resultado |
| --- | --- | --- |
| AC-001 | Teste da falha dupla confirma um único `role="alert"`, mensagem amigável e retry das duas chamadas. | Passou. |
| AC-002 | Teste de falha apenas no histórico confirma que o formulário ainda cota uma compra. | Passou. |
| AC-003 | Testes com erro 500 e mensagem técnica simulados verificam normalização sem expor detalhes internos. | Passou. |

## Suítes

- `cd frontend && npm run test:unit`: 40 arquivos e 136 testes passaram.
- `cd frontend && npm run test:all`: 88 testes de contrato, 136 unitários e 18 E2E passaram; 2 E2E foram pulados por configuração do ambiente.
- `cd frontend && npm run typecheck`: passou.
- `cd backend && npm run test:payments`: 44 testes passaram, incluindo contrato de `DETACHED` + `INSTALLMENT` e `maxInstallmentCount: 12` no anual.
- Varredura dos 203 arquivos de teste do backend: 199 passaram e 4 falharam em arquivos de billing/documentos fora deste escopo. O runner apresentou apenas `test failed`, sem causa detalhada.
