# Test plan — guardrail de cinco alternativas

## Escopo

Verificar que a extração estruturada e o grafo preservam o enunciado e só consolidam listas completas A–E. Testes locais, sem API OpenRouter real e sem gravação no banco.

| ID | AC | Cenário | Resultado esperado |
|---|---|---|---|
| TP-001 | AC-014 | Schema/prompt do extrator com labels A–E e no máximo cinco opções; statement inclui afirmações I, II e III | JSON Schema restringe a lista/rótulos; instrução mantém as afirmações no statement; validação local rejeita opções excessivas, repetidas ou fora de A–E |
| TP-002 | AC-004, AC-006, AC-014 | Revisor recebe 4 opções, rótulo duplicado, texto vazio ou uma opção F | Rota para reparo; estado não fica `ready` |
| TP-003 | AC-004, AC-006, AC-014 | Revisor recebe 6 opções A–F ou 8 opções A–H, com afirmações listadas no statement | Rota para reparo; preserva o statement; não considera a presença parcial de A–E suficiente |
| TP-004 | AC-004, AC-006 | Agente recebe lista incompleta, excedente e questão discursiva | Prompt/schema exigem resposta completa A–E, uma por rótulo; saída incompleta/duplicada/excedente não é aceita |
| TP-005 | AC-006, AC-014 | Reparo altera texto ou rótulo de opções enquanto há gabarito prévio | Gabarito antigo é invalidado/recalculado; `ready` requer gabarito compatível com A–E finais |
| TP-006 | AC-004, AC-006 | Corpus IFF: Q1 (6 opções), Q28 (8, afirmações A–C indevidamente tratadas como opções), Q33 (6) | Teste local comprova roteamento e saída estrutural válida; chamada real ao modelo é lacuna explicitada se não executada |

## Execução

- Bateria focada: cliente OpenRouter, `question-graph` e teste de `StructuredQuestionExtractionService`.
- Typecheck: `npx tsc --noEmit` no diretório `backend`.
- Revisão manual do diff contra AC-004/006/014 e conferência de integridade dos testes.
