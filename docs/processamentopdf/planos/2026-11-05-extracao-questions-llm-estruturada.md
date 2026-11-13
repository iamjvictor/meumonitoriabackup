# Extração de questões com LLM estruturada — plano de implementação

> Plano de implementação; execução backend concluída para chamada única, reconciliação por texto-fonte e roteamento visual. A validação real do modelo/PDF permanece com QA independente.

**Objetivo:** Para `QUESTIONS`, persistir todo o texto recuperado em chunks/embeddings e produzir um array de questões fundamentadas no conteúdo integral do documento.

**Arquitetura:** O worker mantém parser e persistência; um serviço de extração estruturada consome todos os textos dos chunks, suas páginas e assets visuais necessários, envia todo o conteúdo em um único corpo/chamada e valida candidatas. Vetores continuam para busca; texto e imagens são a entrada de extração. Saída vai para revisão, sem cadeia de agentes de completamento.

**Tecnologias:** TypeScript, Node test, Prisma existente, Docling/PDF.js, OpenRouter com saída JSON estruturada e suporte visual.

**Desenho:** [Desenho proposto](../specs/2026-11-05-pedro-lucas-question-extraction-design.md).

## Restrições e pontos de revisão

- Preservar PDF original, tag e fluxo `KNOWLEDGE_BASE`; não executar reprocessamento no banco nesta implementação sem tarefa autorizada.
- Não usar vetores numéricos como substitutos do texto; não truncar silenciosamente conteúdo que exceda a janela do modelo.
- Enviar todos os chunks e imagens relevantes em uma única chamada. O orçamento padrão é 16.000 tokens e é encaminhado exatamente conforme `QUESTION_EXTRACTION_MAX_TOKENS`; input acima de `QUESTION_EXTRACTION_INPUT_MAX_TOKENS` e resposta `finish_reason=length` falham explicitamente, sem chamadas subdivididas. A etapa tem `QUESTION_EXTRACTION_TIMEOUT_MS` dedicado (180.000 ms) e `QUESTION_EXTRACTION_REASONING_EFFORT` dedicado (`none`), sem alterar configurações globais.
- Para QA com `backend/.env` contendo outro limite, sobrescrever apenas no processo de teste — sem editar o `.env` secreto — por exemplo: `NODE_ENV=test QUESTION_EXTRACTION_MAX_TOKENS=16000 QUESTION_EXTRACTION_TIMEOUT_MS=180000 QUESTION_EXTRACTION_REASONING_EFFORT=none`.
- PDF escaneado com OCR insuficiente, PDF misto e página vazia: registrar lacuna, não declarar sucesso completo (T1).
- Páginas atravessadas, texto repetido, rodapés repetidos e numeração repetida em provas diferentes: preservar sequência, remover marca d'água apenas quando repetida em páginas distintas e deduplicar com proveniência, não apenas número (T2–T3).
- Saída inválida, resposta incompleta, erro do modelo e falha parcial de embeddings: preservar evidência e estado recuperável, sem sucesso falso (T1–T4). Truncamento não recebe retry dividido.
- Imagem de questão/alternativa e associação ambígua: passar bytes e contexto correto ou marcar pendência (T3–T4).
- Não inventar banca, ano, gabarito ou alternativas; guardar origem e manter questões incompletas em revisão (T3–T4).

## Mapa de arquivos e pacotes

- T1 — `backend/src/worker/services/document-worker.service.ts`, `chunk.service.ts`, repositório documental e testes próprios: contrato de cobertura, persistência e ordenação antes da extração (AC-001).
- T2 — novo módulo de preparação do corpo único em `backend/src/worker/services/` e seus testes: todos os chunks e referências, limite de contexto e agregação (AC-002).
- T3 — `backend/src/worker/services/question-extraction.service.ts`, cliente OpenRouter/esquemas e testes próprios: extrator estruturado, multimodal e validação de proveniência (AC-002–AC-004).
- T4 — repositório de questões/worker e testes de persistência: candidatas em revisão, idempotência e estados de falha, sem agentes de completamento neste fluxo (AC-005).
- T5 — `tests/document-parser/` e documentação de execução: testes de aceitação e regressão, incluindo simulado original (AC-001–AC-006).

A distribuição de arquivos é por responsabilidade; T1 → T2 → T3 → T4 → T5 em sequência onde houver dependência. Antes da execução, conferir alterações preexistentes e instruções locais; não sobrescrever trabalho de terceiros.

### T1 — Conteúdo integral antes de extrair questões

- [ ] Criar teste com texto por páginas que inclua teoria, questão, fórmula e gabarito, mais caso OCR: a união dos trechos dos chunks cobre integralmente o texto normalizado, preserva páginas e não depende do tipo de bloco.
- [ ] Executar o teste e confirmar falha na lacuna existente; implementar chunking/cobertura e estado recuperável para falha de extração, persistência ou embedding.
- [ ] Executar testes de worker/chunk/repositório; verificar ordem parser → chunks persistidos → embeddings persistidos → extração estruturada.

### T2 — Preparar o corpo único

- [ ] Definir `QuestionSourceChunk { id, text, pages, provenance }` e preparar um corpo único ordenado com todos os chunks e referências.
- [ ] Testar documento curto em uma chamada e documento longo acima do orçamento; falhar explicitamente se não for possível preservar conteúdo.
- [ ] Verificar que não há subdivisão ou corte silencioso e que a proveniência permanece no corpo enviado.

### T3 — Extrator estruturado e evidência visual

- [ ] Criar teste de contrato para `extractQuestions(documentId, windows)` que verifique todos os textos/IDs/páginas, schema `questions[]`, banca/ano/gabarito opcionais e envio das imagens relevantes no mesmo pedido multimodal.
- [ ] Implementar requisições estruturadas, tratamento de schema inválido e limite de resposta, validação das referências; lacuna de imagem necessária leva a revisão, sem valor inventado.
- [ ] Executar testes com cliente simulado: entradas nativa/OCR, limite de contexto, saída inválida, ausência de evidência e falha parcial. Validar que o modelo configurado suporta schema e imagem antes do uso real.

### T4 — Persistência e integração do worker

- [ ] Criar testes de integração com repositórios simulados: resultado estruturado produz candidatas para revisão com fontes corretas; repetição não duplica; ausência de gabarito/banca/ano permanece explícita.
- [ ] Integrar T3 ao worker após T1, sem bloquear conteúdo por classificação `QUESTION` e sem acionar agentes de completamento existentes neste fluxo. Registrar estados de falha parcial e retry.
- [ ] Executar testes de worker, repositório e typecheck; confirmar que `KNOWLEDGE_BASE` permanece funcional.

### T5 — Aceitação independente

- [ ] Ampliar `tests/document-parser/questions-flow.test.ts` com o PDF Pedro Lucas: dez números distintos, enunciados e alternativas A–E, sem mistura; comparar com referências revisadas e testar questão 08 entre páginas.
- [ ] Exercitar OCR e documentos já existentes, incluindo preservação de fórmulas e instruções, e cobertura de todos os chunks. Comparar saída e proveniência com fixtures de referência, não apenas com contagem.
- [ ] Rodar suíte local com parser real e serviços externos simulados; registrar o resultado de cada critério. Rodar verificação multimodal real separada somente quando ambiente/credenciais estiverem disponíveis e registrar modelo, custos, interpretação das imagens e limitações.

## Validação e entrega

Registrar comando, resultado e lacuna por AC em `specs/2026-11-05-extracao-questions-llm/validation.md`; QA independente revisa os contratos e testes. Não fazer commit, deploy ou alterações no banco por iniciativa própria.
