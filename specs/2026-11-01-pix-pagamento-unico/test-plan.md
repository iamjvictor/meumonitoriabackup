# Plano independente de QA — Pix avulso em vagas patrocinadas

## Escopo e critérios

- AC-001: Pix mensal cria cobrança avulsa (`DETACHED`), sem assinatura/ciclo recorrente; após confirmação válida concede exatamente um mês de acesso.
- AC-002: Pix anual cria cobrança avulsa (`DETACHED`) e, após confirmação, concede doze meses.
- AC-003: cartão mensal mantém checkout recorrente (`RECURRENT`, ciclo mensal) e acesso mensal; cartão anual mantém compra avulsa com parcelamento em até 12 vezes e acesso de doze meses.
- AC-004: lotes de 1 e 10 alunos preservam quantidade, valor total cotado, beneficiários e ausência de split nos quatro pares período/método.
- AC-005: eventos de webhook válidos atualizam estado e acesso uma única vez; duplicatas/reentregas não duplicam períodos nem vagas; evento de criação/pendente não concede acesso.
- AC-006: retorno de sucesso/cancelamento serve apenas para UX; confirmação de webhook é fonte de verdade. O checkout contém callback URLs válidas e webhook está configurado no ambiente de produção, sem expor segredos.
- AC-007: UI apresenta Pix como cobrança avulsa, explica duração/renovação manual e mostra cartão mensal recorrente e anual parcelável; valores e método enviados correspondem à seleção.

## Cenários independentes

1. Matriz de criação: quantidade 1 e 10 × mensal/anual × Pix/cartão. Verificar `billingType`, `chargeTypes`, `subscription`, `installment.maxInstallmentCount`, itens e total no payload Asaas simulado; nenhuma chamada externa.
2. Confirmação Pix mensal: `PAYMENT_CREATED` não libera vaga; `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` aplica o período de um mês apenas conforme eventos canônicos. `CHECKOUT_PAID` por si só não pode liberar Pix mensal enquanto o checkout não estiver correlacionado com pagamento confirmado.
3. Confirmação Pix anual: ativa por doze meses a partir da confirmação; não aplica janela mensal nem recorrência.
4. Cartão mensal recorrente e anual parcelado: validar sem regressão do payload, ciclo e duração de acesso.
5. Idempotência: reentregar o mesmo evento/provider payment ID, inclusive concorrente se suportado; não criar vagas/períodos duplicados. Evento tardio/duplicado não encurta nem estende incorretamente serviço.
6. Expiração/cancelamento: `CHECKOUT_EXPIRED`, `PAYMENT_OVERDUE`, cancelamento ou pagamento vencido mantêm vaga sem acesso; uma confirmação tardia só altera o acesso conforme política de reconciliação, sem reabrir checkout nem duplicar o lote.
7. Métodos e intervalos cruzados: mismatch de `billingType`, externalReference inexistente ou status não confirmado não concede acesso.
8. Callbacks/webhook: inspecionar configuração de URL base e rota de webhook para produção; sucesso e cancelamento não marcam pagamento como confirmado sem webhook.
9. UI: testar rótulos/resumo mensal Pix (avulso, 1 mês), anual Pix (avulso, 12 meses/manual), cartão mensal recorrente, cartão anual até 12x; payload da ação segue seleção.

## Execução e segurança

- Rodar testes unitários backend/frontend focados usando mocks/fakes.
- Inspecionar diffs e configuração de webhook/callback sem imprimir valores secretos.
- Não usar banco de produção, API de produção, credenciais reais, gerar cobranças, migrar ou alterar código de produção.
- Para qualquer cenário sem fake adequado ou dependendo de confirmação real do Asaas, registrar lacuna em vez de executá-lo.

## Observação de contrato

O plano anterior `docs/superpowers/specs/2026-10-27-sponsored-student-seats-and-annual-plan-test-plan.md` diz que Pix mensal é `RECURRENT`. Esse comportamento contradiz o pedido explícito mais recente (“Pix é pagamento único”) e não deve servir como critério para este QA; a mudança de contrato precisa ser consolidada pelo arquiteto nos artefatos principais.
