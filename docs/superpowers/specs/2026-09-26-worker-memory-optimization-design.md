# Especificação — memória e responsabilidades do worker

Data: 2026-09-26  
Status: proposta para implementação; nenhuma alteração de runtime realizada por este documento.

## 1. Objetivo

Reduzir a memória permanente e os picos do worker, eliminar retenção de layouts após jobs e concentrar a interpretação física de PDFs no parser Python. Preservar qualidade de extração, idempotência, persistência, retries e geração de conteúdo pedagógico.

O relato de 208 MiB é o ponto de partida, não uma meta nem uma medição reproduzida de produção. Sucesso exige comparação antes/depois no mesmo ambiente e com a mesma carga, além dos critérios funcionais abaixo.

## 2. Evidências e limites do diagnóstico

| Evidência | Classificação | Implicação |
| --- | --- | --- |
| `MineruParserAdapter.inlineResults` armazena layouts sem remoção, limite ou expiração | Confirmada no código e em reprodução isolada | Retenção crescente por execução distinta durante a vida do adaptador |
| Após 100 submissões simuladas e chamadas a `getResult`, permaneceram 100 layouts; `inFlightParses` ficou vazio | Reprodução com HTTP simulado | A retenção de resultados é independente de requisições pendentes |
| Após o Docling, `DocumentWorkerService` chama `extractPdfPagesWithLayout` | Confirmada no código | O mesmo PDF passa por dois extratores quando V3 está habilitado |
| A rotina PDF.js não encerra explicitamente o documento e inspeciona operadores de todas as páginas | Confirmada no código | Recursos sem ciclo de vida explícito e trabalho adicional; não prova isoladamente outro vazamento |
| `chunk.service.ts` importa `gpt-tokenizer` estaticamente | Confirmada no código | Custo de carregamento mesmo antes de um job de documento |
| Download integral, `arrayBuffer`, `Buffer.from` e `Blob` no envio | Confirmada no código | Há representações simultâneas e cópias do arquivo durante o processamento |
| Documentos têm concorrência 2; o processo também atende simulados, webhooks e desafios diários | Confirmada no código | Os 208 MiB não representam somente a infraestrutura BullMQ |

Medição exploratória local de RSS após imports cumulativos: Node vazio 51 MiB; BullMQ/ioredis 76 MiB; SDK Supabase/Prisma Client 84 MiB; tokenizador 129 MiB; PDF.js 469 MiB. Em processo separado, Node + PDF.js chegou a 397 MiB. O ambiente local usava Node 25.8.1; o Dockerfile especifica Node 22. Os números não constituem orçamento de produção nem atribuição exata de memória por biblioteca.

Não foi coletado heap snapshot do processo de produção. Não há evidência de PDFs em payloads BullMQ: a fila de documentos transporta `documentId`. O heartbeat atual informa disponibilidade, não consumo de memória.

## 3. Escopo e alternativas

### Abordagem escolhida: evolução em etapas

Corrigir o estado retido, instrumentar o processo e substituir a segunda leitura do PDF por uma projeção do layout Docling. Manter no Node a lógica de negócio e a integração com filas, persistência e geração pedagógica. É a alternativa que ataca as causas observadas sem reescrever o worker.

### Alternativas consideradas

- Corrigir apenas o cache e reduzir concorrência: entrega inicial útil, mas mantém parsing duplicado e dependências pesadas.
- Transferir todo o pipeline para Python ou separar imediatamente cada fila em um processo: amplia a migração e pode aumentar a memória total por duplicação de runtimes. Fora desta entrega; reavaliar somente com medições posteriores.

### Fora do escopo

- Troca de BullMQ, Redis, ORM, fornecedor de armazenamento ou modelos de IA.
- Reescrita das regras de questões, flashcards, embeddings ou pagamentos.
- Mudanças no frontend, migração automática de documentos antigos ou deploy nesta tarefa documental.
- Forçar GC, reiniciar periodicamente o worker ou limitar heap como substituto da correção de retenções.

## 4. Arquitetura alvo

```text
BullMQ (documentId)
  → worker: valida documento e controla execução
  → transporte limitado do PDF
  → Python/Docling: PDF, OCR, layout, ordem de leitura e evidência visual
  → worker: valida contrato e persiste layout
  → projeção de páginas/texto a partir do layout persistido ou recém-retornado
  → normalização pedagógica, chunks, embeddings, questões e flashcards
  → finalização e liberação de recursos temporários
```

O parser continua responsável pela interpretação física do arquivo. O worker continua responsável pela normalização textual de domínio, qualidade, orquestração e persistência. A resposta do parser não deve passar a conter regras de negócio de questões ou pagamentos.

## 5. Requisitos

### WM-01 — Eliminar retenção de layouts (P0)

- O resultado inline deve pertencer à execução corrente, usando `ParseSubmission.result`, sem um cache permanente no adaptador.
- Remover `inlineResults` e adaptar seus consumidores. `getResult` fica responsável por resultados remotos do protocolo assíncrono; não deve consultar HTTP para uma submissão inline que já trouxe o resultado.
- Preservar a deduplicação de chamadas simultâneas por `inFlightParses`, com remoção em `finally` tanto em sucesso quanto em falha.
- Persistência e idempotência continuam apoiadas no armazenamento durável. Verificar o caminho de submissão já existente: um resultado necessário para retomada deve ser recuperado da persistência ou do protocolo remoto, nunca depender de cache local perdido em restart.
- Não guardar layouts, buffers ou respostas completas em campos do serviço, logs ou coleções de histórico.

Aceite: 100 documentos distintos concluídos não deixam resultados em coleções do adaptador; chamadas concorrentes equivalentes preservam deduplicação; falha HTTP, resposta inválida e erro na persistência liberam estado transitório. Reinício e retry não dependem de memória do processo anterior.

### WM-02 — Observabilidade de memória (P0)

- Emitir evento `monitor.worker_memory` no boot, a cada 30 segundos e nas fronteiras de download, parsing, persistência e finalização do job, inclusive erro.
- Campos em bytes: `rss`, `heapUsed`, `heapTotal`, `external`, `arrayBuffers`; adicionar PID, uptime, versão Node, etapa e contadores de jobs ativos por fila. Nas fronteiras de documento, incluir `documentId`, `jobId` e tentativa quando disponíveis.
- Não somar `external` e `arrayBuffers` como medidas independentes. Distinguir RSS do processo de memória agregada do container.
- Logs não podem incluir conteúdo de PDFs, resultados completos, credenciais ou URLs assinadas. O observador não acumula amostras em memória e seu timer deve ser encerrado no shutdown.
- Falha de telemetria não pode interromper jobs nem modificar a semântica do heartbeat existente.

Aceite: esquema de eventos consistente, amostras periódicas sem jobs, finalização observável em erro e encerramento do timer. É possível comparar memória em repouso e por etapa sem inferir o valor a partir do tamanho de arquivos.

### WM-03 — Reutilizar o resultado Docling (P1)

- Com V3 habilitado e parsing concluído, extrair a entrada de `DocumentTextExtractionService` a partir de `LayoutDocument`, sem abrir o PDF com PDF.js.
- Criar um adaptador puro de layout para páginas/texto, preservando número e quantidade de páginas, páginas vazias e a ordenação `readingOrder` dentro de cada página.
- Usar texto normalizado quando disponível e texto bruto como alternativa; preservar fórmulas e tabelas conforme o contrato e as fixtures de qualidade. Não concatenar representações equivalentes do mesmo elemento duas vezes.
- Derivar evidência visual dos elementos/assets do parser. Não equiparar automaticamente quantidade de assets ao antigo `imageCount`: crops, tabelas e fórmulas podem duplicar evidências. Ausência de informação não pode ser convertida silenciosamente em certeza de ausência de imagem.
- Atualizar a procedência da extração e sua versão; registros Docling não podem continuar identificados como `pdfjs-layout-adapter`.
- Manter estados e rastreamento de `EXTRACT_TEXT`/`NORMALIZE_TEXT`, com metadados indicando a fonte. Versionar o processamento para impedir reutilização indevida de resultados incompatíveis.
- Durante a transição, usar `DOCUMENT_TEXT_SOURCE=pdfjs|docling`, default `pdfjs` para compatibilidade. `docling` exige V3 habilitado e URL do parser configurada; configuração inconsistente deve falhar no boot.
- Erro Docling não pode acionar fallback implícito para PDF.js. Preservar a política atual de falha e retry. A flag permite reversão explícita da fonte textual, não ignora falhas da ingestão V3.
- Se o contrato atual não fornecer ordem ou evidência visual suficiente, corrigir/versionar o contrato Python antes de promover o modo `docling`.

Aceite: no modo `docling`, teste do job completo comprova zero chamadas ao extrator PDF.js. Páginas, fórmulas, alternativas, tabelas e evidências visuais passam pelo corpus de regressão da seção 7. O modo legado permanece selecionável durante a implantação gradual.

### WM-04 — Recursos e transporte do PDF (P1)

- No caminho PDF.js temporariamente mantido, garantir destruição do documento/loading task em `finally`, cobrindo falhas na abertura e durante a leitura. Executar limpeza por página após concluir seu uso, conforme a API da versão instalada.
- Restringir o tempo de vida do binário à fase que efetivamente o consome. A geração pedagógica não deve reter deliberadamente o PDF original.
- Remover a cópia intermediária `Buffer.from(fileBytes)` se desnecessária à API Blob utilizada. Documentar as cópias ainda necessárias; não denominar esse transporte como streaming enquanto ele materializar todo o arquivo.
- Preservar hash, MIME, nome e conteúdo enviado. Retry deve reconstruir um corpo válido, sem reutilizar stream consumido.
- Esta entrega mantém o protocolo multipart atual. Streaming ponta a ponta ou download direto pelo Python são uma evolução condicionada às medições, pois exigem revisão de limites, autenticação e contrato.

Aceite: erros intermediários executam cleanup; fixtures chegam ao parser com bytes/hash corretos; retry transmite o arquivo completo; não há binário retido pelo serviço após encerrar o job. Comparar `external` e `arrayBuffers` na carga controlada.

### WM-05 — Concorrência configurável (P1)

- Introduzir `DOCUMENT_WORKER_CONCURRENCY`, inteiro positivo, default 2 para preservar comportamento existente. Valores inválidos devem falhar na validação de configuração.
- No perfil de implantação com memória restrita, configurar explicitamente 1 antes do ensaio de carga. Comparar com 2 usando o mesmo corpus.
- Registrar a concorrência efetiva no boot; não alterar concorrência de pagamentos ou simulados nesta entrega.
- Não implementar pausa automática por RSS nesta fase. Primeiro medir os picos e o efeito sobre duração e vazão.

Aceite: configuração 1 impede sobreposição de jobs de documentos; configuração 2 mantém o comportamento anterior; retries e shutdown continuam corretos. A configuração selecionada para produção acompanha o relatório de memória e vazão.

### WM-06 — Carregamento de dependências (P2)

- Carregar o serviço pesado de documentos apenas quando chegar o primeiro job dessa fila, mantendo uma única promessa de inicialização compartilhada entre jobs concorrentes. Uma falha nessa inicialização deve permitir nova tentativa.
- Revisar imports transitivos: nenhum caminho de boot de simulados, pagamentos ou scheduler pode invalidar a otimização carregando o mesmo módulo pesado antecipadamente.
- Adiar o tokenizador sem trocar encoding, contagem, limites ou sobreposição de chunks. Import dinâmico reduz custo antes do primeiro uso; não promete liberar módulos após um job.
- PDF.js deve ser carregado apenas no modo legado. Remover dependências do projeto somente após verificar todos os consumidores, inclusive scripts e testes.

Aceite: boot e jobs de outras filas não carregam tokenizador/PDF.js pelo caminho de documentos; o primeiro documento funciona; inicializações concorrentes não duplicam o serviço; as fixtures mantêm contagens e limites de chunks.

## 6. Arquivos e responsabilidades previstos

Caminhos relativos à raiz do projeto; os arquivos novos são propostas, não arquivos já existentes.

| Arquivo | Responsabilidade na entrega |
| --- | --- |
| `backend/src/worker.ts` | Configuração de concorrência, inicialização sob demanda e observabilidade |
| `backend/src/config/env.ts` | Validar novas configurações |
| `backend/src/worker/services/document-parser/mineru-parser.adapter.ts` | Remover retenção e reduzir cópias multipart |
| `backend/src/worker/services/document-parser/document-parse-orchestrator.service.ts` | Preservar resultado inline, retomada e idempotência |
| `backend/src/worker/services/document-parser/document-ingestion-v3.service.ts` | Disponibilizar resultado ao consumidor sem cache permanente |
| `backend/src/worker/services/document-parser/layout-text-projection.service.ts` (novo) | Converter layout em entrada textual compatível com o pipeline |
| `backend/src/worker/services/document-worker.service.ts` | Selecionar fonte de texto e limitar vida de dados transitórios |
| `backend/src/worker/services/document-text-extraction.service.ts` | Procedência, versão e compatibilidade da avaliação de qualidade |
| `backend/src/worker/services/pdf-layout-extraction.service.ts` | Cleanup explícito do caminho legado |
| `backend/src/worker/services/chunk.service.ts` | Preservar semântica do tokenizador ao revisar carregamento |
| `backend/src/health/worker-memory.ts` (novo) | Amostragem sem armazenamento de histórico local |
| `services/document-parser/scripts/docling_http_service.py` e `run_mineru.py` | Somente ajustes de contrato demonstrados necessários pelo corpus |

Testes existentes em `backend/src/worker/services/document-parser/__tests__/`, `backend/src/worker/services/__tests__/` e `backend/src/health/__tests__/` devem ser estendidos junto a cada requisito. Evitar uma refatoração geral de arquivos sem relação com a memória.

## 7. Validação e critérios de liberação

### Regressão funcional

Corpus versionado com PDFs pequenos e grandes dentro do limite vigente de upload, múltiplas colunas, páginas vazias, documentos escaneados, fórmulas, tabelas, questões com alternativas e imagens. Identificar arquivos por hash e registrar páginas/tamanho.

Para cada fixture, definir saída esperada revisada: ordem de leitura, fronteiras de páginas, trechos obrigatórios de enunciado/alternativas, representação de fórmulas/tabelas e evidência visual. Não exigir igualdade literal entre dois parsers, mas reprovar perda desses campos ou mudança incorreta de estado de qualidade. Isolar chamadas de IA nos testes determinísticos.

Cobrir também: parser indisponível, timeout, resposta inválida, erro na persistência, retry do mesmo documento, deduplicação simultânea, retomada após restart e shutdown com jobs ativos. Não enviar jobs artificiais à fila de produção.

Executar `npm run typecheck`, testes direcionados dos componentes alterados e suites existentes relevantes de parser/chunking. Ensaios de memória ficam separados dos testes unitários para evitar asserts instáveis de RSS em CI compartilhada.

### Protocolo de memória

1. Usar a mesma imagem Node 22, dependências, limite de container e corpus para baseline e candidato. Registrar revisão, configuração, concorrência e se a medição é do PID ou do container.
2. Medir boot e repouso por 5 minutos, sem jobs; depois realizar 10 jobs de aquecimento.
3. Executar 100 jobs sequenciais em ambiente de teste, distribuídos em 5 blocos de 20. Aguardar 30 segundos sem atividade após cada bloco. Repetir o ensaio três vezes para baseline e candidato.
4. Executar o corpus com concorrência 1 e 2, incluindo os arquivos maiores. Medir pico de RSS/buffers, duração por job, vazão e falhas; amostragem externa de 1 segundo no ensaio complementa os logs de 30 segundos.
5. Em execução diagnóstica separada, permitir GC explícito entre blocos para comparar objetos sobreviventes; nunca habilitar GC periódico no worker de produção.

Critérios obrigatórios:

- Zero layouts finalizados retidos pelo adaptador e zero entradas pendentes após resolução/rejeição das chamadas.
- Após aquecimento e GC diagnóstico, crescimento de `heapUsed` entre o primeiro e o último bloco limitado ao maior entre 10 MiB e 10% do valor do primeiro bloco, em cada uma das três execuções. Crescimento acima disso exige investigação antes da liberação.
- No modo Docling, PDF.js ausente do fluxo e do carregamento atribuível a jobs de documentos.
- Nenhuma regressão funcional no corpus e nenhum OOM na carga acordada.
- Publicar comparação numérica de repouso, pico e vazão. Não declarar sucesso apenas porque o RSS ficou abaixo de 208 MiB.

Meta de otimização: reduzir em pelo menos 20% a mediana dos picos de RSS do worker nas três execuções equivalentes com concorrência 2. A meta é proposta de engenharia, não economia já comprovada. Se não for atingida, registrar a causa e revisar o orçamento antes de considerar concluído o objetivo de redução; não mascarar o resultado comparando concorrências diferentes.

## 8. Sequência de entrega e reversão

1. **P0:** baseline reproduzível, WM-01 e WM-02. Entrega independente da troca de parser textual.
2. **P1:** WM-03 e WM-04, com corpus e flag de transição. Validar o contrato antes de ativar a fonte Docling.
3. **P1:** WM-05 e ensaios de concorrência. Documentar a escolha do perfil com memória restrita.
4. **P2:** WM-06, medir economia de boot e repetir os ensaios após aquecimento.
5. Ativar `DOCUMENT_TEXT_SOURCE=docling` primeiro em homologação e depois na implantação alvo. Encerrar jobs ativos antes de reiniciar; jobs enfileirados permanecem no Redis.

Em regressão da projeção textual, reverter a flag para `pdfjs` e reiniciar de forma controlada, mantendo a correção de retenção e a telemetria. Não apagar resultados persistidos nem reprocessar documentos antigos automaticamente. Reprocessamentos necessários devem ser explícitos e identificados pela versão do pipeline.

## 9. Definição de concluído

- [ ] WM-01 a WM-06 implementados e critérios de aceite demonstrados.
- [ ] Corpus funcional aprovado e testes pertinentes passando.
- [ ] Relatório antes/depois anexado com ambiente, revisões, configurações e resultados das três execuções.
- [ ] Retenção eliminada, parsing duplicado removido do modo Docling e meta de redução avaliada conforme seção 7.
- [ ] Configurações, procedência da extração e procedimento de reversão documentados.
- [ ] Nenhuma alegação de economia baseada somente nos imports exploratórios locais.

Esta especificação orienta o futuro plano de implementação. Sua criação não executa mudanças no worker, migrações ou deploy.
