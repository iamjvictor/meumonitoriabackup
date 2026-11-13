# Correção global do fluxo agêntico de questões

Data: 06/11/2026. Estado: especificação proposta; implementação e aceite pendentes.

Complementa [a especificação anterior](../2026-11-06-langgraph-questoes/spec.md). As regras abaixo prevalecem sobre o desenho anterior nos pontos explicitamente corrigidos. [Guia das etapas e diagramas](../../docs/processamentopdf/fluxo-agentico-questoes.md).

## Objetivo e limites

Processar PDFs QUESTIONS de diferentes instituições, matérias e layouts, preservando enunciado, fórmulas, figuras e posições, completando cinco opções A–E e gabarito para revisão humana. Nenhuma regra de produção pode depender de nome de arquivo, instituição, página fixa ou número de questão de uma fixture. O IFF é uma regressão, não o desenho do produto.

Manter o schema de Question, o formato alternatives [{label,text}] e a saída pública existente. Toda questão publicada para revisão permanece PENDING_REVIEW/needsReview=true. Metadados internos e checkpoints podem evoluir sem adicionar campos públicos obrigatórios. Não enviar PDF ao modelo: enviar texto recuperado e imagens necessárias. Embeddings servem à busca; os vetores não substituem o texto no prompt. KNOWLEDGE_BASE mantém seu comportamento.

Não se promete correção pedagógica universal de conteúdo gerado. Uma proposta de resposta pode existir com pendências; campos preenchidos não significam evidência comprovada. Fragmentos inválidos não devem receber alternativas para aparentar questões completas.

## Diagnóstico e correção requerida

| Problema confirmado | Mudança requerida |
|---|---|
| Worker não invoca o grafo; extração salva diretamente | Separar extração de persistência; invocar grafo no caminho QUESTIONS e persistir somente seu resultado consolidado. |
| Prompt do gabarito omite número e identidade da prova | Enviar identificação estável, número original, segmento/caderno, páginas e versão das alternativas. |
| foundInSource é aceito apenas com evidence não vazia | Exigir vínculo verificável entre prova, questão, entrada de gabarito e trecho/asset. Guardar evidência, confiança e conflitos. |
| Busca por contains('gabarito'), limitada a 12 chunks | Disponibilizar ferramenta de busca híbrida em todo o documento, com paginação, texto, tabelas e assets visuais. |
| Revisor confere principalmente formato | Incluir validade do candidato, cobertura de contexto, duplicidade, evidência, conflitos e integridade visual. |
| URL isolada recebeu alternativas; Q4 duplicada | Classificar fragmentos, recuperar contexto e deduplicar conservadoramente antes de completar opções. |
| Agente de alternativas não pode restaurar afirmações ao enunciado | Permitir patch interno de enunciado com evidência; preservar afirmações I/II/III e verdadeiro/falso em sua posição. |
| Toda alteração de opções pode ser marcada AI_GENERATED | Distinguir recuperação/correção da fonte de criação; origem geral IA somente se houve conteúdo novo gerado. |
| ready mesmo com alertas de gabarito | Separar encerramento da execução, completude estrutural e pendências de conteúdo. |
| Uma tentativa de roteamento, estado só em memória | Acrescentar checkpoints duráveis, retomada idempotente e política explícita de repetição por falha. |
| Teste local usa provider distinto e não inclui imagens/persistência | Testar pelo upload real local, provider real, armazenamento e interface. |

## Contratos internos propostos

### Estado e identidade

- Execução: executionId, documentId, documentVersion/hash, pipelineVersion, promptVersion, model, provider, status e métricas por etapa.
- Documento: referências duráveis a texto integral, chunks/embeddings, páginas, tabelas, fórmulas e assets. Nunca colocar PDF/base64 no checkpoint.
- Segmento: segmentId estável, intervalo de páginas e evidências de instituição, ano, modalidade, versão/cor. Campos desconhecidos permanecem desconhecidos; não inventar um caderno.
- Candidato: candidateId estável independente da ordem do array, segmentId, número original, sourceRefs, originalSnapshot, versão de conteúdo, alternativas e âncoras visuais.
- Resultado por nó: inputVersion, outputVersion, alterações, origem por alteração, evidenceRefs, confidence, unresolvedReasons, tentativas e métricas. Preservar a origem geral no contrato público.
- Qualidade: candidateValidity = valid/fragment/ambiguous; structuralCompleteness = complete/partial; contentReview = no_detected_issue/needs_review. Execução = running/completed/completed_with_issues/failed. Nenhum desses estados aprova a questão pelo professor.

### Ferramenta search_document_evidence

Ferramenta acessível ao agente de gabarito, restrita no servidor ao documento e à versão autorizados da execução. Entrada: query, intent (answer_key/question_context), candidateId, segmentId opcional, cursor. Identidade do documento é derivada do estado, não confiada a um ID arbitrário gerado pela LLM.

Saída: hits com evidenceId, tipo (text/table/image), páginas, bounding box quando disponível, chunk/assetId, texto/OCR, sinais de associação ao segmento, score e cursor; coverage indica se a busca foi completa, parcial ou falhou. Score de similaridade não prova a resposta. Usar busca lexical + semântica + catálogo de tabelas/imagens. Recuperar páginas vizinhas quando cabeçalho e linhas da tabela estiverem separados. Não truncar silenciosamente a busca nos primeiros resultados.

A ferramenta devolve texto e referências de imagem; um carregador controlado obtém os bytes para chamada multimodal. Imagens distantes, gabarito sem texto e tabelas não rotuladas FIGURE devem poder ser localizadas. Falha de download gera pendência observável. Validar capacidade de visão e saída estruturada do modelo/provider configurado; não substituir por chamada só textual silenciosamente.

### Associação e evidência de gabarito

Retorno interno: candidateId, alternativesVersion, answerLabel, origin (SOURCE_DOCUMENT/AI_GENERATED), evidenceRefs, matchedSegmentId, confidence, conflicts e unresolvedReason. Registrar trecho ou leitura visual, localização e associação ao número/caderno.

Para SOURCE_DOCUMENT, texto deve corresponder à evidência recuperada, e o mapeamento questão → resposta deve pertencer ao segmento correto. Imagem exige asset/página/região e leitura da linha, com ambiguidade explícita. Evidência visual não é validada por substring do OCR. Não usar só número, proximidade de página ou autodeclaração foundInSource.

Se não houver gabarito associado com segurança, resolver a questão e marcar AI_GENERATED, preservando alternativas finais. Havendo contexto insuficiente, propor a melhor letra com pendência, conforme decisão do produto; nunca apresentá-la como verificada. Se nem a estrutura da questão puder ser recuperada, manter candidato parcial e impedir geração sobre fragmento inválido. Gabarito oficial não resolve automaticamente letras de alternativas reordenadas: preservar rótulos originais ou registrar remapeamento comprovado.

### Revisor e coordenação

O revisor combina verificações determinísticas com análise contextual quando houver suspeita de fragmento, opções erradas ou associação ambígua. Validade JSON é apenas uma das verificações. Questões já com letra também passam por validação de origem quando não houver evidência comprovada.

Para a mesma questão: validar/restaurar enunciado → completar alternativas → determinar gabarito sobre a versão final. Esta proposta substitui o paralelismo irrestrito dos dois agentes na spec anterior. Busca de evidência pode ocorrer antes; questões independentes podem ser concorrentes com limite configurável e junção por candidateId. Resultado sobre versão antiga não pode sobrescrever versão atual.

Uma rodada corretiva de schema por agente; para conteúdo, repetir somente quando houver nova evidência ou mudança de versão, com teto configurável inicialmente de duas rodadas por candidato. Esgotamento encerra com pendências, sem loop infinito. Não impor teto local de tokens de saída ou timer local aos nós de IA deste fluxo; registrar limites do provedor, falhas, cancelamento explícito e progresso. Limites de tentativas e contexto não equivalem a timeout.

### Persistência e retomada

Usar checkpoint durável compatível com a versão instalada do LangGraph; escolher implementação no pacote de integração. Checkpoint registra referências e resultados, não credenciais. Idempotência por documento/versão/candidato; não depender do índice do array. Reinício não duplica questões nem sobrescreve edição humana. Uma chamada LLM em andamento pode ser repetida após falha; não prometer exatamente uma chamada externa.

A gravação via repositório existente deve manter origem, figuras/âncoras e pendências. Histórico detalhado usa armazenamento existente quando suficiente; se falhar, não declarar rastreabilidade concluída. Migração auxiliar de checkpoint, se necessária, deve ser especificada antes da execução e não altera Question.

## Critérios de aceite verificáveis

| ID | Resultado exigido |
|---|---|
| AC-001 | Upload QUESTIONS no ambiente local percorre parser, chunks/embeddings, extração, grafo e persistência; IDs/logs demonstram a sequência; não existe salvamento paralelo que ignore o revisor. |
| AC-002 | Dois cadernos com números repetidos e gabaritos diferentes são distinguidos sem regras específicas de fixture; trocar páginas/nomes não muda a associação correta. |
| AC-003 | Prompt do gabarito inclui número, segmento, candidateId e versão das alternativas; resposta de versão antiga é rejeitada. |
| AC-004 | Busca encontra gabarito no início, meio, fim, tabela repartida e imagem sem camada textual; busca parcial/falha fica explícita; nenhum resultado de outro documento é acessível. |
| AC-005 | Evidência inventada, de outro caderno ou incompatível não produz SOURCE_DOCUMENT; evidência validada e seus metadados permanecem auditáveis. |
| AC-006 | URL/legenda isolada não recebe alternativas nem é persistida como questão completa; duplicatas de uma mesma questão são unidas somente com evidência, preservando duas questões distintas com mesmo número em provas diferentes. |
| AC-007 | Questão válida produz A–E únicas e não vazias; afirmações permanecem no enunciado; discursiva recebe cinco opções; correção da fonte não é rotulada como geração. |
| AC-008 | Sem gabarito verificável, questão estruturalmente válida recebe proposta A–E AI_GENERATED; baixa confiança/conflito permanece visível. Nenhuma aprovação automática pelo professor. |
| AC-009 | Enunciado, alternativas, fórmulas e figuras preservam posição/associação na persistência e interface. Figura indisponível ou fórmula ambígua gera pendência, não perda silenciosa. |
| AC-010 | Encerramento com alertas retorna completed_with_issues; conteúdo parcial não é anunciado como completo. Todo registro persistido para revisão continua PENDING_REVIEW. |
| AC-011 | Reinício depois de checkpoint e repetição após gravação não duplicam registros nem alteram revisão humana; chamada falha é retomada dentro da política de tentativas. |
| AC-012 | Tokens, tempo, chamadas, falhas, origem, cobertura e custo disponível são medidos por nó/documento; custo ausente é desconhecido, não zero. Nenhum segredo em logs. |
| AC-013 | Corpus inclui IFF, Pedro Lucas, Quimica-3 e fixtures sintéticas variadas; todas passam pelos critérios relevantes. No IFF, 40 questões únicas da prova alvo e 40/40 associações com o gabarito correto, com opções e figuras conferidas; nenhuma regra fixa de página/nome em produção. |
| AC-014 | Alterações do fluxo QUESTIONS não mudam KNOWLEDGE_BASE nem o contrato público de Question. |

## Decisões e alternativas

Somente ajustar prompts não cobre persistência, rastreabilidade, fragmentos e retomada. Busca vetorial isolada não comprova correspondência de tabelas. Recomenda-se busca híbrida com evidência rastreável, validação de identidade e integração gradual do grafo. A proposta de duas rodadas e execução sequencial dos agentes na mesma questão é decisão técnica desta especificação, não comportamento já implantado.

Documentos longos: usar particionamento por seções e orçamento de contexto com cobertura registrada; não enviar chunks soltos sem contexto nem supor que todos cabem na janela. A busca de gabarito permanece global ao documento, com associação ao segmento. A estratégia de lotes deve preservar identidade e deduplicação.
