# Bases de conhecimento e livros: execução recuperável

Status: proposta para implementação; nenhuma mudança de produção autorizada por este documento.

## Objetivo e contexto

Processar livros em lotes recuperáveis, com limites reais e rastreabilidade, preservando o contexto usado pelo RAG. O caso de referência é Atkins: 354 páginas digitalizadas, 26.577.361 bytes, execução interrompida sem chunks persistidos. A imagem inspecionada usa Docling 2.122.0, possui `document_timeout` e `page_range`, não apresenta CUDA disponível e habilita enriquecimento de fórmulas e tabelas. O código atual converte o documento inteiro antes de gerar chunks. Existem alterações preexistentes extensas no repositório; preservá-las.

## Escopo

Entrega 1: configurações, benchmark de cinco páginas, limites reais, lotes, checkpoints duráveis, retomada, progresso no backend e validação de cobertura antes da publicação. Somente KNOWLEDGE_BASE, protegida por flag inicialmente desligada. QUESTIONS mantém seu caminho atual e recebe testes de regressão.

Entrega 2: classificação por página, extração textual/visual seletiva, reindexação visual independente e avaliação de recuperação no chat. A primeira entrega prepara os contratos para essa evolução, mas não declara corrigidos os erros de conteúdo já existentes em pH e Orgânica.

Fora do escopo inicial: migração de motor OCR, consenso entre LLMs, infraestrutura GPU, atualização do Docling, processamento em produção, republicação de monitores e alteração geral da política do RAG.

## Critérios de aceite

- AC-001: perfil de conversão validado e versionado: OCR, fórmulas, tabelas, escala OCR, escala de imagens e threads. Preservar os defaults atuais até benchmark justificar mudança.
- AC-002: dividir em lotes de 10 páginas, configuráveis de 1 a 20; preservar páginas absolutas e ordem. Cobertura de 354 páginas deve produzir 36 lotes, último 351–354.
- AC-003: persistir artefatos e checkpoint por lote; processo/redeploy interrompido retoma apenas lotes ausentes, inválidos ou falhos. Resultado parcial do Docling nunca vira checkpoint concluído.
- AC-004: limite por lote e documento; timeout encerra o subprocesso de conversão e seus descendentes. Registrar falha e continuar somente por retry controlado. Documento interrompido não fica eternamente PROCESSING.
- AC-005: retry com mesma identidade não duplica lotes, chunks, assets ou embeddings. Requisições concorrentes têm exclusão e lease recuperável.
- AC-006: logs e progresso incluem execução, lote, páginas inicial/final, etapa, duração, heartbeat e última conclusão; sem chaves, URLs assinadas ou conteúdo pedagógico nos logs.
- AC-007: montar e validar todos os lotes antes de publicar a nova geração no RAG. Página vazia comprovada é distinta de página sem texto por falha. Nenhuma lacuna silenciosa.
- AC-008: preservar título/caminho de seção, páginas, referências de imagens e continuidade de parágrafos/tabelas nas fronteiras dos lotes. Não duplicar conteúdo de fronteira.
- AC-009: isolamento por professor, monitor e documento nos jobs, artefatos e publicação. Preservar gerações antigas e referências existentes; não executar exclusão em cascata como mecanismo de retry.
- AC-010: benchmark registra tempo de conversão, tempo por etapa disponível, memória e qualidade em cinco páginas, comparando fórmula ligada/desligada e escala atual/reduzida. Não assumir ganho antes da medição.
- AC-011: teste de recuperação usa embedding de consulta e índice com mesmo modelo e dimensão; verifica respostas sustentadas pelo contexto, não apenas presença do documento no top-k.

## Configuração inicial proposta

`KNOWLEDGE_BATCH_PROCESSING_ENABLED=false`; lote=10; concorrência por documento=1 e global de conversão=1; timeout Docling por lote=540 s; limite externo por lote=600 s; TERM→KILL em até 5 s; orçamento inicial de execução do documento=14400 s (4 h), configurável por perfil; máximo de 2 tentativas por lote, com espera de 30 s. Valores são ponto inicial configurável, a calibrar pelo benchmark, não promessa de desempenho.

O orçamento do documento é acumulado e persistido por execução, incluindo retries; retomada da mesma execução não o zera. Nova execução explícita pode ampliar o orçamento e reaproveitar checkpoints compatíveis. Lotes concluídos permanecem salvos após falha ou timeout.

## Referências verificadas

- `services/document-parser/scripts/run_mineru.py`: constrói PdfPipelineOptions.
- `services/document-parser/scripts/doc_chunker.py`: conversão completa e chunking.
- `backend/src/worker/services/doc-chunker/doc-chunker-v2.client.ts`: transporte atual com timeouts de dispatcher zerados.
- Documentação: https://docling-project.github.io/docling/usage/advanced_options/ ; conferir comportamentos na versão instalada, não presumir APIs da versão mais recente.

## Regras objetivas de cobertura

Cada página deve estar CONVERTED, VERIFIED_BLANK ou FAILED. Publicação exige 100% das páginas contabilizadas e zero FAILED. Texto vazio sozinho nunca implica VERIFIED_BLANK. Na primeira entrega, página vazia exige confirmação manual registrada ou detector validado contra fixtures de página branca, texto tênue, fórmula isolada e figura sem texto; qualquer dúvida bloqueia publicação. Manifest inclui contagem de caracteres, itens de layout, imagens, erros e justificativa por página. Nenhum limiar universal de tamanho de texto autoriza descarte.
