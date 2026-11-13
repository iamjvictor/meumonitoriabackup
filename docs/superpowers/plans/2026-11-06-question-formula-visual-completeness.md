# Questões com fórmulas e evidência visual completas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir questões com evidência textual das fórmulas e figuras reconhecidas pelo Docling corretamente vinculadas, apresentando ambas na revisão docente.

**Architecture:** O parser mantém o texto original e enriquecido das fórmulas; figuras `picture`/`figure` identificadas pelo Docling são exportadas com proveniência. O worker envia o texto integral e somente figuras ligadas aos chunks da questão na chamada multimodal estruturada; persiste essas relações e a interface renderiza LaTeX e mostra as figuras.

**Tech Stack:** Python 3.12, Docling 2.122, Node/TypeScript, Prisma/Postgres local, Supabase Storage local, Next/React, remark-math e KaTeX já instalados.

**Spec:** `docs/superpowers/specs/2026-11-06-question-formula-visual-completeness-design.md`

## Global Constraints

- Nenhuma escrita no Supabase remoto ou produção; o teste de persistência usa exclusivamente `dbtemp` local em `127.0.0.1:56322` e Storage local.
- Uma única chamada estruturada multimodal por documento; preservar o fluxo QUESTIONS e o schema de questões.
- Não inferir símbolos, expoentes ou gabarito sem evidência visual/textual suficiente.
- Professor continua revisando as questões antes da aprovação.
- `do_formula_enrichment=True` permanece ativo.

## Review Focus

- FormulaItem `orig` correto e `text` errado: teste garante que ambas as evidências chegam ao extrator, sem sobrescrita silenciosa.
- Expoente inline em TextItem: teste do `10⁷` não aceita `10 7` como saída correta.
- Questão sem figura detectada: nenhum asset PAGE de fallback é anexado à questão.
- Asset na mesma página de questões vizinhas: proveniência e seleção não ligam figura alheia à questão.
- Enunciado com KaTeX e figuras associadas: revisão renderiza fórmula e imagem sem perder opções ou edição.

---

### Task 1: Preservar evidência matemática e classificar assets visuais

**Files:**
- Modify: `services/document-parser/scripts/doc_chunker.py`
- Modify: `services/document-parser/scripts/visual_asset_export.py`
- Test: `services/document-parser/tests/test_doc_chunker.py`
- Test: `services/document-parser/tests/test_visual_asset_export.py`

**Interfaces:**
- Produz chunks com texto serializado, `formulaEvidence?: Array<{ pageNumber: number; itemRef: string; bbox: number[] | null; originalText: string | null; enrichedText: string }>` (um registro por FormulaItem) e `inlineMathEvidence` derivada da geometria de glifos sobrescritos/subscritos do PDF quando houver (incluindo página, bbox, texto-fonte e forma elevada reconstruída), mantendo o contrato v2 validável.
- Os assets existentes identificados pelo Docling como `picture`/`figure` ficam marcados como `FIGURE`; renderizações de página para OCR/MIXED ficam marcadas `PAGE` e permanecem disponíveis apenas aos fluxos genéricos de conhecimento.

- [ ] Escrever teste de regressão no PDF/fixture com Q04: `orig` e LaTeX enriquecido aparecem em evidências separadas; geometria identifica `10⁷` e `s⁻¹` como sobrescritos sem achatar; o pacote distingue imagens `FIGURE` de assets `PAGE`.
- [ ] Executar testes para confirmar falha antes da implementação.
- [ ] Implementar a preservação de `formulaEvidence`, evidência geométrica inline e `assetKind` sem gerar imagens de página/crops artificiais.
- [ ] Executar testes focados do parser e confirmar que fallback `PAGE` permanece identificado e separado das figuras.

### Task 2: Enviar evidência, persistir texto e associar assets corretamente

**Files:**
- Modify: `backend/src/worker/services/doc-chunker/doc-chunker-v2.client.ts`
- Modify: `backend/src/worker/services/document-worker.service.ts`
- Modify: `backend/src/repositories/document-worker.repository.ts`
- Modify: `backend/src/repositories/document-visual-asset.repository.ts`
- Modify: `backend/src/worker/services/structured-question-extraction.service.ts`
- Test: `backend/src/worker/services/__tests__/document-worker.doc-chunker.test.ts`
- Test: `backend/src/worker/services/__tests__/structured-question-extraction.service.test.ts`
- Test: `backend/src/worker/services/__tests__/structured-question-extraction.formula-visual.test.ts`
- Test: `backend/src/repositories/__tests__/document-question-visual-assets.test.ts`
- Test: `backend/src/repositories/__tests__/document-visual-asset.repository.asset-kind.test.ts`

**Interfaces:**
- Assets do parser carregam `assetKind: 'FIGURE' | 'PAGE'`, `pageNumber`, `bbox`, `sourceItemRef` e bytes.
- Questão preserva LaTeX, texto original e evidência geométrica de sobrescritos/subscritos como contexto para a chamada estruturada única; somente FIGURE do documento é anexado. Figura de apêndice em página diferente pode ser associada quando a questão a referencia literalmente e a âncora é validada.
- Persistência mantém `assetKind` em `DocumentVisualAsset` e liga somente figura citada pela resposta estruturada com proveniência compatível. A resposta inclui `anchorText` literal validado dentro do enunciado/alternativa; a relação guarda a âncora junto com `pageNumber`, `readingOrder` e `bbox` originais do Docling.

- [ ] Escrever teste que falha quando a fórmula original/enriquecida ou a evidência geométrica de `10⁷`/`s⁻¹` não é incluída no request estruturado.
- [ ] Escrever teste que falha quando uma figura de outra questão é enviada/salva; questão sem figura precisa ficar sem `visualEvidence`.
- [ ] Testar que PAGE é filtrado, anchorText precisa existir no texto da questão, e a posição/página/ordem/bbox persistidas são as do FIGURE de origem.
- [ ] Executar os testes para confirmar falha pelo motivo esperado.
- [ ] Implementar a validação de proveniência e filtrar `PAGE` do fluxo QUESTIONS; não criar fallback visual para uma questão sem FIGURE.
- [ ] Executar testes focados do worker/repositório e typecheck backend.

### Task 3: Renderizar fórmulas e evidências na revisão do professor

**Files:**
- Modify: `frontend/src/modules/teacher/components/monitor/MonitorQuestionsReviewTab.tsx`
- Test: `frontend/tests/unit/MonitorQuestionsReviewFormula.test.tsx`

**Interfaces:**
- Enunciado e alternativas aceitam texto simples + delimitadores LaTeX já salvos, com renderer seguro baseado em `remark-math`/`rehype-katex` existentes.
- Assets `STATEMENT` e `ALTERNATIVE:<letra>` exibem apenas figuras reconhecidas e vinculadas no anchorText literal; mantêm proveniência de página/ordem/bbox. Anchor inválido usa fallback ao fim do texto com proveniência; questão sem figura não exibe imagem.
- A edição do professor continua permitindo editar texto e alternativas.

- [ ] Escrever teste de componente que exige Q04 com KaTeX renderizado e Q01 com figura fonte/página/alt corretos no ponto ancorado antes/depois do texto correspondente; Q04 sem figura não deve mostrar imagem.
- [ ] Executar o teste e confirmar que a revisão atual falha por mostrar LaTeX bruto/ausência de imagem.
- [ ] Implementar renderer e apresentação dos assets.
- [ ] Executar teste focal e typecheck frontend.

### Task 4: QA ponta a ponta em ambiente local isolado

**Files:**
- Create: `dbtemp/run-question-formula-visual-e2e.mts`
- Create: `specs/2026-11-06-docling-formula-visual-completeness/test-plan.md`
- Create: `specs/2026-11-06-docling-formula-visual-completeness/validation.md`

**Interfaces:**
- O E2E inicializa usuário/documento/monitor temporários no Supabase local, executa parser, chunks, embeddings e extração real com a chave/modelos de `backend/.env`, mas sobrescreve todas as URLs de banco/Storage pelo `dbtemp` local.
- O relatório lê questão salva e visual links do Postgres local e confirma a resposta da UI usando o mesmo payload/fixture.

- [ ] Preparar cenários para Quimica-3 Q04 (equação `2 H₂O₂(aq) → 2 H₂O(l) + O₂(g)` e `k=4,0 × 10⁷ s⁻¹`), Q05 (`H₂O(l) → H₂(g) + ½ O₂(g)`), e uma questão com asset `FIGURE` genuíno confirmado no manifesto após nova conversão. Simulado Pedro Lucas Q07 alternativa A (`3 × 10¹⁷`) é uma regressão adicional; Estequiometria escaneado confirma que assets `PAGE` não viram figura da questão.
- [ ] Executar QA real de parser, OCR/enrichment, embeddings, LLM, banco local e apresentação da revisão.
- [ ] Verificar que fórmulas e figuras pertencem à questão correta; somente FIGURE aparece em questões, inline na posição ancorada, e nenhuma imagem é anexada se Docling não detectou figura. PAGE permanece fora da relação da questão.
- [ ] Registrar chamadas, IDs locais, outputs sanitizados, testes e limitações; confirmar ausência de escrita remota.

## Sequência e revisão

Tasks 1 → 2 → 3 → 4 são sequenciais porque os contratos dos assets determinam persistência e renderização. Implementador termina cada tarefa e envia diffs/evidência; `revisor_qa` audita testes independentes e executa Task 4. O arquiteto revisa o diff global antes de declarar aceite.
