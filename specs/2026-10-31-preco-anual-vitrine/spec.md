# Exibição do preço anual

## Objetivo

Destacar na vitrine e na seleção do plano a opção anual em até 12 parcelas e manter explícito o total pago à vista.

## Decisões e limites

- O backend continua sendo a fonte do preço anual: mensal × 12 × 0,8, arredondado em centavos.
- Exibir 12x de total anual ÷ 12 (R$ 47,92 para o atual preço mensal de R$ 59,90) no cartão ou o total anual à vista (R$ 575,04).
- Destacar a oferta anual com rótulo de 20% de desconto; manter o mesmo total de R$ 575,04 nas duas formas e absorver a taxa do parcelamento na operação.
- O checkout pode oferecer à vista e parcelado; o limite do parcelamento é 12.
- A concessão de acesso do anual permanece em 12 meses após a confirmação.

## Critérios de aceite

- **AC-001:** Os cards da página pública destacam 12x do preço anual dividido por 12 e o total à vista quando anual estiver disponível.
- **AC-002:** A seleção anual informa 12 parcelas no cartão e o total à vista.
- **AC-003:** O checkout continua recebendo o intervalo anual existente e o backend concede 12 meses, sem mudança de contrato.
