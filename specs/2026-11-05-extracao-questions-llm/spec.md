# Especificação: extração estruturada de QUESTIONS

Estado: proposta para implementação; nenhum critério abaixo foi validado nesta entrega. Desenho de referência: [processamento de PDFs](../../docs/processamentopdf/specs/2026-11-05-pedro-lucas-question-extraction-design.md).

## Objetivo

Para PDF com tag `QUESTIONS`, extrair conteúdo nativo e aplicar OCR quando necessário, criar e persistir chunks cobrindo o texto extraído, gerar e persistir embeddings para esses chunks e entregar o conteúdo integral à LLM estruturada. O modelo devolve uma lista de questões para revisão, sem exigir que o backend as classifique previamente e sem acionar a cadeia atual de agentes de completamento.

## Decisão técnica a confirmar na implementação

O pedido original menciona enviar todos os vetores de embeddings à LLM. A proposta envia **os textos correspondentes a todos os chunks**, preservando vetores no banco para busca: embeddings numéricos não permitem recuperar literalmente enunciados ou alternativas. Esta é uma interpretação técnica documentada, não uma confirmação explícita do usuário de que deseja descartar os vetores do prompt.

## Contrato

Entrada: documento `QUESTIONS`, texto e metadados por página, todos os chunks persistidos ordenados, suas referências e imagens relevantes. Extração só é concluída como sucesso integral após persistência de chunks e embeddings, cobertura verificável e respostas estruturadas válidas. Erros ficam rastreáveis e recuperáveis.

Saída lógica: `{questions: [{number, statement, alternatives: [{label, text}], correctAnswer, institution, year, sourceChunkIds, sourcePages, visualEvidence}]}`. Número, gabarito, banca, ano e evidência visual podem ser nulos ou ausentes quando não comprovados; no Pedro Lucas, alternativas completas exigem A–E; em outros documentos, preservar a quantidade e o tipo originais, incluindo questões discursivas. Dados ausentes ou ilegíveis permanecem pendentes de revisão. Modelo e schema devem suportar resposta estruturada e, para imagem, entrada multimodal.

## Persistência e uso de imagens — proposta

O parser deve devolver recortes como assets com página e coordenadas. Os bytes ficam no Storage privado; o banco mantém referência, hash, página e coordenadas. O modelo recebe os textos dos chunks e os recortes pertinentes, identificados por asset ID, e a saída deve apontar para os assets usados em cada questão ou alternativa. A persistência deve manter vínculos explícitos entre questão e asset, com papel e proveniência, para exibir a figura original junto ao enunciado ou alternativa; a descrição textual não substitui a imagem. Se o vínculo for ambíguo ou o recorte ausente, manter pendente de revisão; não afirmar que uma página inteira contém apenas uma questão nem descartar a imagem. Reprocessamentos devem reutilizar assets e vínculos válidos. Os formatos exatos, referências e políticas de acesso devem ser verificados na implementação.

Há uma base parcial no código: `DocumentVisualAssetRepository` salva PNG no bucket privado `document-parser-artifacts` e registra `documentVisualAsset`; `DocumentVisualLinkingService` tenta vincular assets a spans/questões. O envio da imagem ao extrator estruturado, o vínculo de alternativas e a exibição ponta a ponta ainda precisam ser implementados e validados para este fluxo; a flag visual atual deve ser considerada na integração.

Enviar todo o texto concatenado em um único corpo e uma única chamada estruturada. Se a entrada ou saída exceder a capacidade do modelo, registrar falha clara e recuperável; não subdividir em chamadas nem truncar silenciosamente. A garantia de cobertura trata do texto reconhecido, não de conteúdo que o OCR não leu.

## Critérios de aceite

- AC-001: PDFs nativos, digitalizados e mistos percorrem extração adaptativa; falhas ou páginas sem conteúdo ficam visíveis.
- AC-002: Todo texto extraído, após normalização documentada, é coberto por chunks com páginas/offsets; chunks e embeddings são persistidos antes da extração estruturada. Falha ou lacuna impede sucesso integral e permite recuperação.
- AC-003: A LLM recebe todo texto dos chunks em ordem, com IDs e páginas, independentemente de tipo de bloco. Documento inteiro segue em uma única chamada; tamanho excedido resulta em erro explícito.
- AC-004: No PDF local Simulado Pedro Lucas são identificadas exatamente dez questões distintas 01–10, com enunciados completos e cinco alternativas da fonte, incluindo a continuação da 08 e sem mistura entre questões.
- AC-005: Imagens necessárias ao enunciado ou alternativas são encaminhadas ao modelo multimodal com proveniência; leitura ausente, ilegível ou ambígua fica pendente de revisão. Banca, ano e gabarito só são preenchidos quando sustentados pelo texto da fonte. A leitura de gabarito em imagem fica fora desta fase.
- AC-006: Questões estruturadas são persistidas para revisão com origem e estado de completude; repetição não duplica. Fluxo não dispara agentes atuais de completamento.
- AC-007: Testes contemplam documentos nativos, OCR, limites de contexto, falhas, idempotência e regressão; teste real de modelo é identificado separadamente de testes com dublês.

Fora de escopo: interpretar gabarito em imagem nesta fase; modificar `KNOWLEDGE_BASE`, implantar, migrar ou reprocessar documentos do banco nesta tarefa de documentação.
