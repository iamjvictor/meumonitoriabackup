# Relatório de execução local — IFF 2010, 30 páginas

PDF SHA-256: 1824c111741c4cac5443ad3ecd48c1411722b3d527929becf56dd7f8d550550d. O gabarito de referência é o PROEJA na página física 28; o da página 29 é Técnico Subsequente.

## Alcance

Docling convertido de novo em CPU; extração estruturada e grafo executados localmente com modelo deepseek/deepseek-v4.1-flash e a chave do backend/.env. A extração e o grafo usaram texto; imagens não foram anexadas. Não houve upload, embeddings ou persistência em banco: não é uma execução ponta a ponta de produção. Não foi implementada ferramenta de busca de gabarito. O teste de extração usou null para limite de saída e timeout, por solicitação do usuário; no backend os padrões de configuração atuais podem ser diferentes.

Docling: 569,534 s. LLM de extração: 23,854 s, 13.199 tokens de entrada e 11.416 de saída. Grafo: 42 chamadas, soma de durações 273,455 s, 540.723 tokens de entrada e 50.372 de saída (43.213 de raciocínio incluídos na saída). Não há custo financeiro confirmado no artefato.

## Resultado

Extração: 41 registros numerados de 1 a 40, com Q4 duplicada; o primeiro registro de Q4 tinha somente uma URL e nenhuma alternativa. O grafo preencheu cinco opções para esse registro espúrio. Todos os 41 registros finais têm cinco opções, sem garantir que os textos estejam corretos. Na comparação de 40 números distintos, 28 letras coincidem e 12 divergem. Q4 duplicada é contada uma vez. Sete registros têm ANSWER_CONTEXT_INSUFFICIENT mesmo com graphStage ready. Nenhuma imagem foi fornecida, inclusive nas questões que dependem de figura. A Q11 tem texto matemático corrompido na extração.

Todas as 41 respostas do extrator inicial eram nulas. No grafo as respostas foram classificadas como SOURCE_DOCUMENT, embora o agente apenas exija evidência textual não vazia: não verifica que a evidência seja literal nem que corresponda à prova e questão. Marcação não comprova origem correta.

| Questão | Gabarito PROEJA | Resposta do fluxo | Comparação | Alertas |
|---|---|---|---|---|
| 1 | D | E | Diverge | ANSWER_CONTEXT_INSUFFICIENT |
| 2 | B | C | Diverge | ANSWER_CONTEXT_INSUFFICIENT |
| 3 | B | B | Coincide | — |
| 4 | C | C | Coincide | — |
| 4 | C | C | Coincide | — |
| 5 | D | D | Coincide | — |
| 6 | A | A | Coincide | — |
| 7 | E | E | Coincide | — |
| 8 | B | B | Coincide | — |
| 9 | D | D | Coincide | — |
| 10 | D | D | Coincide | — |
| 11 | D | D | Coincide | — |
| 12 | E | E | Coincide | — |
| 13 | C | C | Coincide | — |
| 14 | B | B | Coincide | — |
| 15 | C | C | Coincide | — |
| 16 | B | B | Coincide | — |
| 17 | A | A | Coincide | — |
| 18 | D | D | Coincide | — |
| 19 | E | E | Coincide | — |
| 20 | C | B | Diverge | — |
| 21 | D | D | Coincide | — |
| 22 | B | C | Diverge | — |
| 23 | A | A | Coincide | — |
| 24 | C | B | Diverge | — |
| 25 | B | B | Coincide | — |
| 26 | E | E | Coincide | — |
| 27 | C | B | Diverge | — |
| 28 | D | D | Coincide | ANSWER_CONTEXT_INSUFFICIENT |
| 29 | C | B | Diverge | — |
| 30 | A | A | Coincide | — |
| 31 | B | C | Diverge | ANSWER_CONTEXT_INSUFFICIENT |
| 32 | C | B | Diverge | ANSWER_CONTEXT_INSUFFICIENT |
| 33 | E | E | Coincide | — |
| 34 | D | D | Coincide | — |
| 35 | E | E | Coincide | — |
| 36 | E | E | Coincide | — |
| 37 | B | C | Diverge | ANSWER_CONTEXT_INSUFFICIENT |
| 38 | C | B | Diverge | ANSWER_CONTEXT_INSUFFICIENT |
| 39 | C | B | Diverge | — |
| 40 | D | D | Coincide | — |

## Pontos de atenção e melhorias

1. Identificar cadernos por instituição, seleção, ano e modalidade, associando questões e gabaritos por segmentos e páginas. Registrar página, tabela e coordenadas da evidência.
2. Criar busca híbrida por gabaritos, combinando semântica, palavras-chave, números, tabelas e metadados; analisar imagem quando necessário e tratar conflito entre cadernos.
3. Validar a evidência contra o contexto e a questão antes de atribuir SOURCE_DOCUMENT; guardar evidência rastreável e marcar resposta gerada por IA corretamente.
4. Evitar criar questão a partir de legenda ou URL; deduplicar por prova e número, verificando enunciado e fonte. Não gerar opções para um enunciado inválido.
5. Manter pendências como estado explícito mesmo quando o grafo encerra; diferenciar execução terminada de conteúdo confiável.
6. Garantir imagem e fórmula com posição e testar com pipeline real, armazenamento e interface.
7. Reduzir repetição do contexto: as 42 chamadas enviaram 540.723 tokens de entrada; recuperar contexto relevante por documento e pré-processar a tabela uma vez.
8. Medir preço real nas informações de cobrança do provedor; não inferir custo apenas de tokens.
