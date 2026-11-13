# Guardrail para cinco alternativas por questão

## Objetivo

Manter a extração estruturada fiel ao documento e garantir que toda questão entregue pelo grafo tenha exatamente cinco opções A–E. Afirmações numeradas, tópicos e itens de verdadeiro/falso fazem parte do enunciado quando são apresentados como conteúdo a avaliar; não devem virar opções extras.

## Abordagens consideradas

- **Somente instrução de prompt:** simples, mas não impede listas inválidas e não detecta quando há A–E mais opções F–H.
- **Prompt mais validação e reparo no grafo (escolhida):** o extrator orienta a separação entre enunciado e opções; o revisor detecta contagem/rótulos incorretos; o agente de alternativas devolve um conjunto final A–E; saída ainda inválida permanece pendente. É um pouco mais trabalho, mas estabelece a regra no contrato e no fluxo.

## Decisões

- O formato persistido continua `{label,text}` e não muda o schema Prisma de `Question`.
- O extrator pode retornar opções incompletas quando não conseguir ler todas; não deve inventar opções nessa etapa. O revisor delega a correção/complemento ao agente de alternativas.
- O agente de alternativas recebe a lista atual completa e contexto OCR/Docling/imagens, e retorna um conjunto final com exatamente A, B, C, D e E, uma vez cada.
- Enunciados com asserções I, II, III, afirmações ou verdadeiro/falso devem preservar esses itens no statement. As cinco opções, quando existirem, representam combinações/avaliações desses itens.
- A questão só pode ficar `ready` quando tiver cinco alternativas não vazias A–E e gabarito compatível; caso contrário fica pendente de revisão.
- O fluxo continua local e sem persistência adicional ao banco neste teste.

## Critérios de aceite

- O extrator limita cada lista de alternativas aos rótulos A–E e distingue afirmações do enunciado das opções.
- O revisor roteia alternativas excedentes, faltantes, duplicadas ou inválidas ao agente de alternativas.
- O agente de alternativas produz um conjunto final ordenado A–E e preserva opções que o contexto confirma.
- A validação de saída exige exatamente cinco alternativas; 6 ou 8 opções não podem resultar em `ready`.
- Questões discursivas continuam podendo receber cinco alternativas geradas.
- Testes incluem alternativas F–H e enunciados com asserções I/II/III, além de casos com opções incompletas.
