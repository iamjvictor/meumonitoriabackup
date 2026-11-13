# Persistir saída estruturada para revisão

Objetivo: desativar temporariamente a reconciliação que reconstrói enunciados/alternativas após a LLM e persistir o conteúdo da resposta estruturada para revisão do professor.

- AC-001: enunciados e alternativas da resposta estruturada chegam inalterados à persistência; `3 × 10^17` não vira `3 × 1017`.
- AC-002: formato estruturado, referências aos chunks/assets do documento e tratamento de falhas continuam validados; itens seguem pendentes de revisão.
- AC-003: texto integral segue em uma chamada, e a alteração não interfere em outros tipos de documento.
- AC-004: testes exercitam a fronteira de persistência com expoente e rejeição de referência inválida. Uma execução simulada não é prova de gravação em banco.

Risco aceito: sem reconstrução/deduplicação posterior, a qualidade e eventuais duplicatas da resposta dependem do modelo e da revisão do professor. A reconciliação permanece no código, desativada no fluxo.
