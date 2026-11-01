# Test plan — forma de pagamento no checkout do aluno

- **AC-001:** na vitrine, forma não selecionada mantém CTA inativo; selecionar intervalo limpa método atual.
- **AC-002:** mensal apresenta cartão recorrente e PIX avulso; anual apresenta PIX à vista e cartão até 12x.
- **AC-003:** backend produz mensal/cartão `CREDIT_CARD + RECURRENT + subscription`; mensal/PIX `PIX + DETACHED` sem subscription; anual/PIX `PIX + DETACHED`; anual/cartão `CREDIT_CARD + DETACHED + INSTALLMENT + maxInstallmentCount 12`.
- **AC-004:** mensal PIX só ativa acesso após `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` correlacionado; `CHECKOUT_PAID` sozinho não ativa mês; mensal cartão mantém fluxo financeiro recorrente; anual continua idempotente.
- **AC-005:** API rejeita método inválido para o intervalo; chaves/fingerprints não reutilizam a sessão de outro método; split aprovado ou fallback `[]` permanece igual.

Testar o corpo enviado pelo frontend e os campos exatos gerados pelo adapter Asaas. Nenhum teste deve chamar API real ou movimentar pagamentos.
