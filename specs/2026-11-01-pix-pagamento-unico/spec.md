# Pix de pagamento único para turmas patrocinadas

A decisão atual substitui o requisito anterior que tratava Pix mensal como recorrente.

- AC-001: Pix mensal cria checkout `DETACHED`, sem assinatura; pagamento confirmado concede um mês de acesso, renovação manual.
- AC-002: Pix anual cria checkout `DETACHED`; pagamento confirmado concede 12 meses.
- AC-003: Cartão mensal permanece `RECURRENT`; cartão anual permite à vista ou até 12x.
- AC-004: Tela e resumo descrevem corretamente duração e renovação, para 1 ou mais alunos.
- AC-005: Webhooks aplicam confirmação de modo idempotente; redirecionamento do navegador não concede acesso.
- AC-006: Documentar URLs efetivas de webhook e retorno e comprovar cenários com fakes e, quando disponível, Sandbox.
