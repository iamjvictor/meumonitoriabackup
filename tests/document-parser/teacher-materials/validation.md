# Validação ponta a ponta — materiais do professor

Executada em 2026-11-02 nos PDFs copiados para este diretório. Os testes usaram o parser local e dry run; não gravaram documentos, questões ou embeddings em banco.

## Critérios e resultados

| Critério | Resultado | Evidência |
| --- | --- | --- |
| AC-001 — `Quimica-3.pdf` produz dez unidades numeradas e chunks com cobertura exata | PASS no caminho PDF.js: 10 blocos, 10 candidatas, números 01–10. | `results/Quimica-3.questions-pdfjs.json` |
| AC-002 — IA cria alternativas, gabarito e explicação para as dez discursivas | NÃO PASSOU: 19 chamadas receberam HTTP 401. Alternativas geradas: 0/10. | `results/ai-dry-run/Quimica-3.dry-run.md` |
| AC-003 — OCR de materiais de conhecimento produz chunks limitados | PASS técnico: 3 chunks por material; máximo 487 tokens em Estequiometria e 489 em pH/pOH. | `results/Estequiometria.knowledge.json`, `results/pH e pOH.knowledge.json` |
| AC-004 — figuras e anotações da página 3 de Estequiometria são exportadas | PASS no parser v2: 8 assets, incluindo 2 na página 3, sem warnings; hashes e PNGs verificados. | `results/Estequiometria.visual-summary.json`, `results/Estequiometria.chunk-v2.zip`, `results/Estequiometria-page3-annotated.png` |
| AC-005 — assets visuais persistem, são descritos/indexados e recuperados como conhecimento | NÃO EXECUTADO: requer worker com `DOCUMENT_VISUAL_ASSETS_ENABLED=true`, storage/banco isolados e descrição/embeddings disponíveis. A configuração local continua desligada por padrão. | Os testes de componentes passaram, mas não substituem a ingestão e recuperação reais. |
| AC-006 — OCR visual também exporta assets para pH/pOH | PASS no parser v2: 3 assets nas páginas 1, 3 e 4, sem warnings; pacote e hashes verificados. | `results/pH e pOH.visual-summary.json`, `results/pH e pOH.chunk-v2.zip` |

O texto reconhecido contém erros em fórmulas e notação química. A página 3 de Estequiometria não produziu chunk textual, mas sua imagem com anotações está no pacote visual v2; falta provar que o worker a transforma em chunk de descrição recuperável.

## Testes de componentes

- Python: `uv run python -m unittest tests/test_visual_asset_export.py tests/test_doc_chunker.py -v` — 12 testes passaram.
- Backend: 8 dos testes focados de worker/parser/assets passaram na execução agrupada. Os 2 testes de `document-worker` passaram ao serem repetidos com `node --experimental-test-module-mocks` — total 10/10.
- Chat visual: 6 testes passaram para carregamento de imagem, contexto visual, recuperação, prompt e gateway multimodal.

## Próximo bloqueio

Atualizar a credencial local do OpenRouter para uma chave válida e repetir `test-question-dry-run.ts --limit=10`. Depois, usar ambiente isolado com storage/banco e a flag visual ativada para comprovar persistência, indexação e recuperação dos assets. Não considerar o campo “Questões completadas” do relatório dry run como sucesso: nesta execução ele conta candidatas processadas, mesmo com os agentes falhando.
