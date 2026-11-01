# Forma de pagamento nas turmas patrocinadas

**Status:** aprovado; decisão atualizada pelo usuário para parcelamento anual no cartão.
**Data:** 01/11/2026

## Intenção

Deixar o professor escolher Pix ou cartão na tela de turmas patrocinadas antes de abrir o checkout Asaas, para que o método e o tipo de cobrança estejam claros para cada plano.

## Comportamento acordado

- Depois de escolher o plano, um menu expansível **Forma de pagamento** revela as opções disponíveis. A forma precisa ser escolhida antes de revisar e pagar.
- **Anual:** Pix gera checkout de pagamento único (`DETACHED`). Cartão de crédito oferece pagamento à vista ou parcelado em até 12 vezes: enviar `chargeTypes: ['DETACHED', 'INSTALLMENT']` e `installment.maxInstallmentCount: 12`; o pagador escolhe o número no checkout Asaas.
- **Mensal:** Pix ou cartão de crédito recorrente (`RECURRENT`). No Pix, o Asaas gera uma cobrança mensal que o pagador precisa quitar; no cartão, a cobrança recorrente pode ser processada automaticamente.
- O checkout hospedado recebe somente o método selecionado. A compra patrocinada continua sem split.
- A forma escolhida fica registrada no lote. Lotes pendentes editados reutilizam o método original; idempotência distingue métodos diferentes. Lotes existentes assumem `CREDIT_CARD` como método histórico.
- A lista e o resumo da compra mostram o método selecionado.

## Objetivos e limites

- Cobrir anual Pix/cartão e mensal Pix/cartão recorrente na criação do checkout. A cotação recebe apenas monitor, período e e-mails; seu preço não depende da forma de pagamento.
- Preservar webhooks, concessão de acesso, cancelamento mensal e comportamento de lotes existentes.
- Pix Automático, parcelamento de Pix/anual mensal, mais de 12 parcelas e métodos adicionais ficam fora do escopo.
- A implementação inclui uma migração aditiva para persistir `billingType`; após autorização explícita do usuário, ela foi aplicada ao Supabase configurado e validada com `prisma migrate status`.

## Abordagens consideradas

1. Liberar os dois métodos diretamente no checkout hospedado do Asaas. Tem menos mudanças no app, mas não mostra a escolha na tela do professor.
2. Mostrar o menu na tela do professor e enviar ao Asaas somente a opção escolhida. Foi a abordagem escolhida pelo usuário; oferece confirmação clara antes de sair do painel e preserva a opção nos lotes pendentes.

## Critérios de aceite

- **AC-001:** escolher anual com Pix cria checkout `DETACHED`; anual com cartão cria checkout com `DETACHED` e `INSTALLMENT`, limitado a 12x. Em ambos, Asaas recebe somente o `billingType` selecionado.
- **AC-002:** escolher mensal mostra Pix e cartão; cada método cria checkout `RECURRENT` mensal com apenas o `billingType` escolhido.
- **AC-003:** não é possível revisar/pagar sem escolher uma forma válida; trocar plano limpa uma seleção incompatível/antiga.
- **AC-004:** a cotação e o preço não dependem da forma de pagamento; preço-base anual e regra de split permanecem iguais; todos os checkouts patrocinados continuam com `splits: []`.
- **AC-005:** método é salvo/listado e preservado ao editar lote pendente; idempotência distingue métodos.
- **AC-006:** registros existentes continuam válidos e são tratados como compras por cartão.

## Referências

- [Checkout Asaas](https://docs.asaas.com/docs/asaas-checkout)
- [Checkout recorrente](https://docs.asaas.com/docs/checkout-with-subscription-recurring)
- [Assinaturas e Pix Automático](https://docs.asaas.com/docs/difference-between-automatic-pix-and-subscriptions)
- [Checkout para cartão de crédito](https://docs.asaas.com/docs/checkout-for-credit-card)
