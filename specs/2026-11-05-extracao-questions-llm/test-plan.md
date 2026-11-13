# Plano de testes QA independente

Base: `spec.md`, critérios AC-001–AC-007. Escopo desta revisão: validar código e testes sem alterar produção nem gravar no banco; executar uma chamada real, autorizada, ao modelo configurado somente com repositório em memória. A chamada real será feita uma vez por rodada e identificada à parte dos testes com dublês.

| ID | Cenário | Critérios | Nível / evidência esperada |
| --- | --- | --- | --- |
| TP-001 | PDF nativo Pedro Lucas pelo caminho PDF.js | AC-001/002/004 | Comparar texto completo normalizado, página/offsets, cobertura de chunks e sequência 01–10 com o PDF renderizado. |
| TP-002 | PDF escaneado e PDF misto | AC-001/002 | Verificar worker/parser executando OCR adaptativo, texto e falhas por página; mocks não bastam para alegar OCR real. |
| TP-003 | Persistência de chunks e embeddings antes da chamada | AC-002/006 | Verificar ordem e falha sem falso sucesso com contratos/testes de integração; nenhuma persistência em banco de produção. |
| TP-004 | Corpo textual integral, ordenado e sem divisão | AC-003/007 | Interceptar a chamada e confirmar todos os chunks, IDs e páginas numa chamada única. Documento acima do limite deve falhar claramente, sem truncar ou subdividir. |
| TP-005 | Provider e schema JSON estruturado | AC-003/007 | Verificar payload real/provider, schema aceito, `finish_reason`, uso agregado e número de requests; não registrar chave nem texto de reasoning. |
| TP-006 | Extração real do Pedro Lucas | AC-004/007 | Uma chamada ao modelo com o documento integral. Comparar saída bruta anterior à reconciliação e saída final: dez questões distintas, enunciados completos, A–E, Q08 contínua, Q07 expoente e ausência de rodapés intrusos. |
| TP-007 | Imagem em questão/alternativa | AC-005 | Verificar asset real vinculado a chunk, envio multimodal, resposta com `visualEvidence` e papel correto. Requisição HTTP 200 isolada não prova que o modelo interpretou a figura. |
| TP-008 | Múltiplos assets, páginas e números repetidos | AC-004/005/006 | Confirmar que IDs de asset, página e papel persistem sem associação cruzada ou fusão indevida de questões. |
| TP-009 | Repetição, retry e falha parcial | AC-002/006/007 | Verificar idempotência sem duplicatas, estado recuperável após erro e ausência de sucesso parcial indevido. |
| TP-010 | Formatos variados e regressões | AC-003/007 | Cobrir discursivas, verdadeiro/falso e número variável de alternativas, além de KNOWLEDGE_BASE sem alteração de comportamento. |
| TP-011 | Configuração de modelos da aplicação | AC-007 | Executar `ai-models.config.test.ts` e determinar se eventual divergência de modelo é causada pela alteração analisada, por `.env` ou por expectativa/configuração preexistente. |
| TP-012 | Contrato da UI para questões com figuras | AC-005/006 | Verificar leitura de URLs/roles e renderização de asset junto ao enunciado ou alternativa por teste e inspeção do caminho consumidor. |
| TP-013 | Avisos de reconciliação até a fronteira de persistência | AC-004/006/007 | Reprocessar offline a captura real e o PDF; verificar que tokens órfãos não alteram o enunciado, avisos de Q07 chegam a `saveQuestion.metadata`, e o serviço faz uma única chamada stub. |

## Regras de execução e interpretação

- Usar configuração de modelo/chave somente da `backend/.env`, lida em memória; não imprimir nem salvar credenciais.
- Para a chamada de QA, somente overrides de processo permitidos: `QUESTION_EXTRACTION_MAX_TOKENS=16000`, timeout de 180 s e reasoning `none`. Configuração em disco permanece intacta.
- Contar requests no limite HTTP. Persistência deve ser substituída por memória e nenhum banco de produção pode ser conectado/escrito.
- Capturar separadamente objeto estruturado bruto do provider e resultado após reconciliação, omitindo segredos e reasoning textual; comparar campos por questão.
- Se o modelo ou parser externo falhar, registrar status, fase e evidência agregada. Uma falha externa limita a conclusão, não transforma o cenário em sucesso.
- Testes com mocks, teste de parser real e inferência real são evidências diferentes e devem ser reportados separadamente.
