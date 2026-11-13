# Validação QA — persistir saída estruturada

## Resultado

**Aprovado com lacuna de cobertura de baixa severidade.** O caminho ativo entrega as candidatas diretamente ao repositório, mantendo validação do schema e IDs de proveniência. O teste isolado passou sem banco real nem OpenRouter. A prova atual cobre o texto exato da alternativa `3 × 10^17`, mas não faz uma asserção equivalente para o `statement`, embora AC-001 e o título do teste cubram ambos.

## Comandos executados

1. `node --import tsx --test src/worker/services/__tests__/structured-question-extraction.service.test.ts` (em `backend/`): falhou ao importar ambiente, antes de executar casos, pois `ASAAS_WEBHOOK_URL` não estava configurada.
2. `ASAAS_WEBHOOK_URL=https://example.org/hook NODE_ENV=test node --import tsx --test src/worker/services/__tests__/structured-question-extraction.service.test.ts` (em `backend/`): **7 passaram, 0 falharam**. O valor de webhook é somente configuração sintética para inicialização; teste usa cliente e repositório falsos.

Nenhum banco, OpenRouter ou serviço externo foi acessado.

## Evidências por critério

| Critério | Resultado | Evidência |
|---|---|---|
| AC-001: conteúdo estruturado inalterado | Parcialmente demonstrado | O serviço define `questions = extracted` e passa cada `candidate` diretamente a `repository.save` ([serviço](../../backend/src/worker/services/structured-question-extraction.service.ts:105)). O teste compara o array de alternativas e a string `3 × 10^17` ([teste](../../backend/src/worker/services/__tests__/structured-question-extraction.service.test.ts:88)). Falta asserção de igualdade exata do `statement`. O repositório padrão atribui `text: candidate.statement` e `alternatives: candidate.alternatives` ([repositório](../../backend/src/repositories/question.repository.ts:350)); normalização do enunciado é usada apenas para hashes/chaves ([serviço](../../backend/src/worker/services/structured-question-extraction.service.ts:207)). |
| AC-002: schema, referências e revisão | Passa no serviço; persistência real não exercitada | O schema é validado antes do retorno do extrator e referências a chunks/visuais são verificadas antes de retornar candidatas; o teste rejeita referência a chunk inexistente e schema inválido sem persistir (testes isolados passam). O caminho padrão define `needsReview: true` e `status: 'PENDING_REVIEW'` ([serviço](../../backend/src/worker/services/structured-question-extraction.service.ts:215), [repositório](../../backend/src/repositories/question.repository.ts:370)). As relações de chunks e imagens são delegadas ao repositório/Prisma; não houve teste de banco.
| AC-003: chamada única e escopo | Passa no serviço estruturado | O teste confirma exatamente uma chamada e que ambos os chunks aparecem no texto do pedido (teste de truncamento e teste de envio completo). Esta revisão não mede outros fluxos de documento.
| AC-004: expoente e referência inválida | Passa com repo dublê | A alternativa `3 × 10^17` preserva igualdade literal; referência `outro-documento` é rejeitada antes do `save`. Trata-se de evidência da fronteira serviço/repositório, não gravação real.

## Duplicatas e idempotência

A retirada da reconciliação elimina sua deduplicação semântica. A persistência mantém deduplicação/idempotência exata: calcula `textHash` do enunciado normalizado e `sourceKey` de documento+número+enunciado ([serviço](../../backend/src/worker/services/structured-question-extraction.service.ts:207)); o repositório serializa por chaves e consulta colisão de conteúdo antes de fazer upsert ([repositório](../../backend/src/repositories/question.repository.ts:321)). Assim, respostas literalmente idênticas tendem a colidir e não criar repetidas; paráfrases, numeração inconsistente ou duplicatas semanticamente iguais podem persistir separadas. Isso corresponde ao risco aceito na especificação e deve ser observado pela revisão do professor.

## Achado

- **Baixa — cobertura incompleta de AC-001:** o teste `persiste a resposta estruturada sem reescrever expoente, metadados ou proveniência` não compara `savedCandidate.statement` a `llmQuestion.statement`. Reproduzir lendo esse teste; o caso passa sem demonstrar a preservação exata do enunciado na fronteira. O código atualmente passa o objeto candidato diretamente, então não identifiquei regressão funcional nesse ponto. Encaminhado ao arquiteto como lacuna de teste, não alteração de produção.

## Limitações

- Não houve chamada real ao modelo, captura local do PDF nem gravação no banco. Os artefatos anteriores em `tests/document-parser/results/` não foram usados como prova desta persistência.
- O workspace tem muitas alterações alheias e os arquivos dessa feature aparecem como não rastreados; a inspeção se limitou aos arquivos da extração estruturada, contrato de persistência e especificação.

## Complemento após revisão

O teste de persistência direta passou a comparar literalmente também o enunciado salvo com o retornado pela LLM (`savedCandidate.statement === llmQuestion.statement`). O implementador reexecutou a suíte específica: 7/7 passaram. A verificação usa repositório simulado; não houve gravação em banco.
