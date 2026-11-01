# Processamento de PDFs

Índice central da documentação de upload, OCR, extração de texto e imagens, chunks, base de conhecimento e questões. **Estado em 27/10/2026:** os dois PDFs de teste passam pelo `/chunk/v2` local, com chunks limitados e imagens exportadas. As flags visuais são desligadas por padrão; associação com questão, chat e revisão humana ainda não foram medidos ponta a ponta. Código local e testes não significam rollout em produção.

## Comece aqui

| Tema | Documento | Uso |
| --- | --- | --- |
| Melhorias pendentes | [Problemas e correções](./MELHORIAS-PDF.md) | Backlog medido do fluxo de questões, imagens, fórmulas e testes finais. |
| Questões, fluxo atual | [Processamento de questões](./questoes.md) | Entrada, ramificações, extração, persistência, limites e testes. |
| Base de conhecimento e incidentes | [Processamento da base de conhecimento](./base-conhecimento.md) | Parser Docling, configuração, falhas observadas e operação. |
| Escopo, tag e tópico | [Categorização de documentos](./categorizacao-documentos.md) | Efeito do upload e dos vínculos de tópico no processamento. |
| Testes com PDFs reais | [Corpus do parser](../../tests/document-parser/README.md) | `ocrTeste.pdf`, `questionsQuimica.pdf` e resultados medidos. |
| Avaliação visual | [Corpus e relatório visual](../../tests/document-parser/visual-quality/README.md) | Corpus piloto, avaliador, limitações e execução necessária antes do canário. |
| Contrato do serviço Python | [README do document-parser](../../services/document-parser/README.md) | Endpoints e execução local. |
| Implantação | [Rollout do doc-chunker](./operacao/doc-chunker-rollout.md) | Canário, métricas e reversão. |

## Specs de PDF e parser

| Documento | Assunto | Situação |
| --- | --- | --- |
| [Qualidade do parser e questões, 26/10](./specs/2026-10-26-document-parser-quality-design.md) | OCR, cortes de questões, corpus e métricas | Spec com baseline; partes ainda pendentes. |
| [Doc-chunker de produção, 24/10](./specs/2026-10-24-doc-chunker-production-design.md) | `/chunk`, tokenizer, timeout, fallback e logs | Spec do caminho de conhecimento. |
| [Imagens de PDF e chat, 27/10](./specs/2026-10-27-chat-multimodal-document-images-design.md) | Recortes, storage, vínculos com questões e IA multimodal | Implementado localmente; validação ponta a ponta e rollout pendentes. |
| [Avaliação de imagens e perguntas, 27/10](./specs/2026-10-27-avaliacao-qualidade-imagens-questoes-design.md) | Corpus, métricas, rubrica e canário | Avaliador inicial implementado; corpus e execução real incompletos. |
| [OCR adaptativo Docling](./specs/2026-08-27-docling-smart-ocr-design.md) | Decisão por camada de texto e OCR | Spec histórica; conferir implementação atual. |
| [Pipeline Docling com memória controlada](./specs/2026-09-26-worker-docling-memory-pipeline-design.md) | Projeção, tabelas, figuras e memória | Spec histórica. |
| [Ingestão de conhecimento sem extrair questões](./specs/2026-10-05-knowledge-base-no-question-extraction.md) | Separação por tag | Regra refletida no worker. |
| [Herdar tópico do documento nos chunks](./specs/2026-08-27-inherit-document-topic-to-chunks.md) | Fallback de tópico | Spec do vínculo de tópico. |
| [Qualidade de questões, doc central](./specs/2026-08-26-document-question-pipeline-quality-design.md) | Candidatas, conclusão e revisão | Histórico. |
| [Qualidade de questões, variante backend](./specs/2026-08-26-document-question-pipeline-quality-design-backend.md) | Versão anterior do backend | Histórico; preservada por ter conteúdo distinto. |

## Planos e registros de trabalho

| Documento | Assunto |
| --- | --- |
| [Ingestão V3](./planos/2026-08-25-document-ingestion-v3.md) | Etapas de integração de layout e parse runs. |
| [Qualidade de questões](./planos/2026-08-26-document-question-pipeline-quality.md) | Plano central de candidatas e agentes. |
| [Qualidade de questões, variante backend](./planos/2026-08-26-document-question-pipeline-quality-backend.md) | Plano anterior preservado. |
| [Melhoria V3 e MinerU](./planos/2026-09-08-melhoria-v3.md) | Arquitetura exploratória de parser visual; descreve fases históricas. |
| [Doc-chunker de produção](./planos/2026-10-24-doc-chunker-production.md) | Implementação do `/chunk` e rollout. |
| [Imagens de PDFs, chat e qualidade](./planos/2026-10-27-imagens-pdf-chat-qualidade.md) | Implementação 1–7 e avaliação 8; parser v2 retestado, integração visual ponta a ponta pendente. |
| [Backlog de questões](./questoes-backlog.md) | Pendências e relatórios de testes. |
| [Backlog de questões do backend](./questoes-backlog-backend.md) | Erros e tarefas operacionais anteriores. |
| [Desativação temporária de OCR](./historico/2026-08-27-disable-ocr-temporarily.md) | Decisão antiga; não define a configuração atual de produção. |

## Documentação mantida perto do código

- [Serviço Docling](../../services/document-parser/README.md): contrato HTTP e comandos locais.
- [Fixtures e testes do parser](../../tests/document-parser/README.md): PDFs de regressão e limites do teste.
- [Chat RAG](../../backend/src/modules/chat/README.md): recuperação e montagem do contexto para a conversa.
- [Processamento de questões](./questoes.md): índice dos documentos sobre o caminho pedagógico de PDFs.
