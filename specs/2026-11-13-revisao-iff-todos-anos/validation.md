# Validação

- AC-001/004: consulta ao banco e GET /api/v1/public-review/iff retornaram 40 questões IFF, todas de 2010, sem carregar JSON local.
- AC-002: o navegador apresentou o ano existente; uma resposta simulada com 2010 e 2011 mostrou os dois anos e filtrou corretamente.
- AC-003: teste no navegador com número 1 em dois anos confirmou decisões independentes; a interface envia o UUID da questão para a rota de edição. Decisões anteriores de 2010 são migradas por ID.
- Testes do módulo de imagens: 2 aprovados. Typecheck de frontend e backend: aprovados.
- A rota mantém a restrição anterior: acessível apenas fora de produção. A edição bem-sucedida não foi executada contra dados reais nesta validação.
