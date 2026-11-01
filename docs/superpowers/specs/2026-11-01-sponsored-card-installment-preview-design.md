# Design — estimativa de parcelamento nas turmas patrocinadas

## Intenção

Mostrar ao professor, antes de iniciar o checkout, como o total anual no cartão se divide em até 12 parcelas. Também evitar chamar de “em processamento” um lote cuja criação do checkout já falhou.

## Abordagens consideradas

- **Estimativa local por parcela:** dividir o total cotado por 12, formatar em BRL e identificar como estimativa; o Asaas continua sendo a fonte do valor final. Escolhida porque usa a cotação aprovada sem criar checkout.
- **Consultar o Asaas para simular:** exigiria criar/consultar uma sessão de checkout e dependeria de regras que só o provedor conhece; não é necessária para mostrar uma estimativa prévia.

## Decisões e limites

- Exibir a estimativa apenas para plano ANUAL com CARTÃO DE CRÉDITO, no resumo da compra e na revisão antes do pagamento.
- Exemplo: total de R$ 287,52 mostra `Estimativa: até 12x de R$ 23,96`.
- Informar que condições e valor final são confirmados no checkout Asaas; não anunciar juros ou valor garantido.
- Pix anual permanece pagamento único. Mensal permanece recorrente e não exibe parcelas.
- Não enviar nova solicitação ao Asaas automaticamente após falha ambígua. Diferenciar o estado `CHECKOUT_CREATION_FAILED` do estado realmente pendente e orientar o professor a revisar o lote no histórico.
- Não alterar a tentativa de produção já registrada, nem criar checkout ou cobrança nesta tarefa.

## Critérios de aceite

- **AC-001:** Anual + cartão exibe até 12x e a estimativa arredondada de total/12 nas duas áreas de resumo.
- **AC-002:** Anual + Pix e ambos os métodos mensais não exibem a estimativa.
- **AC-003:** Repetir uma chave cuja tentativa anterior terminou em `CHECKOUT_CREATION_FAILED` retorna erro distinto de `CHECKOUT_PENDING`, sem chamar novamente o provider.
- **AC-004:** Uma tentativa ainda pendente continua protegida contra duplicação; checkout existente continua reutilizando sua URL.

## Risco conhecido

A falha inicial de produção não persiste o código/status da resposta Asaas no banco. Esta mudança corrige a classificação da repetição e a informação da tela, mas não recupera a causa original sem os logs do terminal daquela tentativa.
