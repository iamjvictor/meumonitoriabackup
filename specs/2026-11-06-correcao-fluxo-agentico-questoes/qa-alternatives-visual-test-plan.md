# Plano de QA — alternativas geradas e assets visuais lowercase

Data: 07/11/2026  
Escopo independente: validar o contrato entre agentes quando o modelo combina `AI_GENERATED` com `evidenceQuote` não nulo, o encaminhamento de uma questão estruturalmente completa ao gabarito apesar de pendência pedagógica, e o carregamento dos assets `assetType='figure'` persistidos pelo Docling.

## Critérios cobertos

- **AC-007:** alternativas finais únicas A–E, enunciado preservado e origem/pendências da geração rastreáveis.
- **AC-008:** gabarito ausente recebe proposta A–E AI_GENERATED com baixa confiança/pendência explícita quando aplicável; segue para revisão humana.
- **AC-009:** asset figura associado é carregado e enviado ao nó multimodal; assets PAGE não são tratados como figura.
- **Fluxo reviewer:** pendência pedagógica em alternativas não deve ser confundida com falha estrutural quando já existem cinco opções válidas; o agente de gabarito deve receber a versão final A–E e devolver resultado ao revisor.

## Casos independentes

1. **Inconsistência de proveniência no retorno da LLM:** fornecer cinco opções A–E válidas com `origin='AI_GENERATED'` e `evidenceQuote` não nulo. A inconsistência não pode descartar silenciosamente as cinco opções nem classificá-las como SOURCE_DOCUMENT. O resultado mantém `AI_GENERATED` e expõe `ALTERNATIVES_CONTENT_REQUIRES_TEACHER_REVIEW`, preservando a mensagem/pedência original.
2. **Passagem para o nó de gabarito:** executar grafo completo com as cinco opções do caso 1 e gabarito ausente. O agente de gabarito deve ser chamado depois do nó de alternativas, receber exatamente cinco opções finais A–E, produzir resposta compatível e devolver o resultado ao revisor. A pendência pedagógica continua no payload final PENDING_REVIEW; não pode bloquear o nó de gabarito nem transformar A–E válidas em `ALTERNATIVES_AGENT_INCOMPLETE`.
3. **Pendência que declara impossibilidade:** retornar cinco strings com `pendingIssue` dizendo explicitamente que o modelo não conseguiu criar alternativas coerentes/legíveis. O agente não deve tratar somente a contagem A–E como completude, nem chamar o agente de gabarito para inferir uma resposta sobre opções declaradas inválidas; deve manter alerta/pêndencia.
4. **Asset `figure` lowercase:** mock de persistência Prisma que reproduz os valores reais em lowercase, com uma figura substantiva `assetType='figure'` e uma página `assetType='page'`. O provider deve carregar/enviar a figura e excluir a imagem de página da coleção de figuras.

## Execução

- Testes são determinísticos e usam contexto, provider e clientes LLM dublês; não fazem chamadas pagas.
- Executar somente depois de o implementador notificar que o contrato de alternativas e o filtro visual estão prontos.
- Não alterar produção, schema público, fixtures de critério ou expectativas para acomodar o comportamento atual.
