# Baseline dos parsers: páginas 18–19

Fonte: `test/docsTeste/razao-proporcao-e-regra-de-tres.pdf`, páginas 18 e 19. As duas páginas foram isoladas em um PDF digital e rasterizadas em outro PDF escaneado. Este relatório usa funções reais dos parsers e não grava no banco nem chama agentes de IA.

| Teste | Resultado |
| --- | --- |
| `QUESTIONS`, PDF digital, PDF.js | 11 blocos `QUESTION` e 11 chunks; números 1–10 presentes, com dois itens realmente numerados 10 no material; 9 candidatas determinísticas; blocos 2 e 6 sem candidata. |
| `QUESTIONS`, PDF escaneado, `/v1/parse` com RapidOCR | Conversão HTTP 200 concluída em 40,5 s; 8 blocos e 8 chunks; números 9 e 10 ausentes como fronteiras; seus textos aparecem agregados ao bloco 8. A asserção de números esperados falhou, como deveria. |
| `KNOWLEDGE_BASE`, PDF digital, `/chunk` via `DocChunkerService` | 2 chunks, página 1 coberta, maior chunk com 437 tokens Qwen. |
| `KNOWLEDGE_BASE`, PDF escaneado, `/chunk` via `DocChunkerService` | OCR executado; 3 chunks, páginas 1 e 2 cobertas, 418–478 tokens Qwen por chunk. |

O teste de regressão da fronteira monetária confirmou que `R$ 38,00` e `R$ 1.400,00` não geram mais um falso bloco `00.`. O teste digital ainda revela perdas na etapa seguinte, ao transformar blocos em candidatas. O escaneado revela uma limitação distinta: o OCR lê o corpo das questões 9 e 10, mas perde seus números; a montagem atual junta esses textos à questão 8. Nenhum dos resultados acima demonstra que o worker salvou questões ou embeddings no banco.

O PDF específico que gerou quatro questões de dez ainda não foi disponibilizado. Esse arquivo precisa ser executado nos mesmos dois testes para medir as seis perdas reais.
