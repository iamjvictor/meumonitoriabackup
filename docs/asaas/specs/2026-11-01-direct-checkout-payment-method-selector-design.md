# Forma de pagamento no checkout direto do aluno

## Objetivo

Na vitrine pública do professor, permitir que o aluno escolha explicitamente a forma de pagamento compatível com o plano antes de ir ao checkout Asaas.

## Abordagens

- **A — escolha na vitrine (escolhida):** após selecionar mensal/anual, o aluno escolhe PIX ou cartão conforme as combinações permitidas; o backend cria um checkout Asaas com somente o método e tipo de cobrança correspondentes. Dá controle e deixa preço/recorrência claros antes do redirecionamento.
- **B — escolha somente no Asaas:** enviar múltiplos métodos para a página hospedada. Não atende à solicitação de escolha na tela do professor e dificulta associar método a recorrência/parcelamento.

## Regras de produto

- Mensal + cartão: assinatura recorrente mensal.
- Mensal + PIX: cobrança avulsa de um mês; o aluno renova manualmente após o período.
- Anual + PIX: pagamento avulso à vista por 12 meses.
- Anual + cartão: pagamento à vista ou parcelado em até 12 vezes por 12 meses.
- Anual mantém preço calculado no backend e desconto já exibido; não há desconto adicional por PIX.
- A compra direta mantém split elegível do professor. Se a conta de recebimento estiver inelegível, aplica-se o fallback já implementado sem split.

## Critérios de aceite

- **AC-001:** a tela exige uma escolha explícita de forma de pagamento após a escolha do intervalo; trocar de intervalo limpa a seleção.
- **AC-002:** mensal oferece cartão recorrente e PIX avulso; anual oferece PIX à vista e cartão em até 12 parcelas.
- **AC-003:** o servidor só cria combinações válidas: mensal/cartão `RECURRENT`, mensal/PIX `DETACHED`, anual/PIX `DETACHED`, anual/cartão `DETACHED` + `INSTALLMENT` (máximo 12).
- **AC-004:** mensal PIX libera exatamente um mês apenas após confirmação financeira; checkout criado ou redirecionamento não libera acesso. A compra mensal por cartão continua recorrente; anual continua liberando 12 meses por `CHECKOUT_PAID` idempotente.
- **AC-005:** método de pagamento distingue a idempotência de checkouts novos; compra anual e regra atual de split/fallback permanecem intactas.

## Limites e implementação

Manter o checkout hospedado Asaas; não coletar dados de cartão ou QR Pix no frontend. Configurar `billingTypes` para o único método escolhido. Reutilizar o `PaymentOrder` existente: `CHECKOUT_PAID` confirma anual; a cobrança PIX mensal avulsa libera o mês pelo evento financeiro `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` já correlacionado ao pedido. Não criar campo ou migration de método de pagamento; o webhook de checkout traz `billingTypes`/`chargeTypes` e não é a fonte primária da liberação mensal.

## Direção visual e interação

- **Tese visual:** escolha de pagamento compacta e familiar dentro do modal existente, com o verde de seleção atual, tipografia navy e informação curta sobre recorrência/duração.
- **Conteúdo:** intervalo → forma de pagamento compatível → CTA único.
- **Interação:** trocar intervalo limpa a forma selecionada; a escolha atualiza o texto de cobrança; o CTA fica desabilitado até a escolha explícita.
