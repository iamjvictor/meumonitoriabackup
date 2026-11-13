# Validação

Estado: documentação preparada; nenhum critério de implementação aceito.

| Critérios | Pacotes | Cenários | Resultado |
|---|---|---|---|
| AC-001,014 | P5,P6 | T01 | Pendente |
| AC-002,003 | P1,P3,P4,P6 | T02,T08,T14 | Pendente |
| AC-004,005 | P3,P4,P6 | T03,T04,T05 | Pendente |
| AC-006,007 | P2,P4,P6 | T06,T07 | Pendente |
| AC-008,010 | P4,P6 | T09,T12 | Pendente |
| AC-009 | P2,P5,P6 | T03,T10 | Pendente |
| AC-011 | P5,P6 | T11,T14 | Pendente |
| AC-012 | P4,P6 | T12,T14 | Pendente |
| AC-013 | P6 | T13 | Pendente |

Baseline investigado: dbtemp/artifacts/iff-full-current/relatorio.md e dbtemp/artifacts/question-reviewer-full-pdfs/iff-full-current.backend-output.json. 41 registros para 40 números, Q4 duplicada, 28/40 letras coincidentes, sete alertas de contexto e stage ready. Execução local sem imagens, embeddings ou persistência; não é evidência de aceite ponta a ponta.

Na implementação, adicionar comando, data, versões, saída, artefatos e lacunas a cada cenário. Não converter status em aprovado somente porque tarefas foram concluídas.

## Revisão documental

Revisor independente apontou necessidade de explicitar a separação entre gabarito manual do avaliador e gabarito existente no PDF, além do encerramento por tentativas no diagrama. Ambos foram esclarecidos. Links relativos dos seis documentos novos verificados sem destinos ausentes. Esta revisão não executou testes nem aprova implementação.

## Implementação parcial — execução atual

Pacotes em progresso no branch `codex/correcao-fluxo-agentico-questoes`. Contratos, busca híbrida, detecção de fragmentos/duplicatas, agentes e integração por flag foram alterados localmente. O gate permanece desligado por padrão e falha fechado sem checkpoint durável. Os testes mockados usam MemorySaver apenas para verificar o contrato; isso não comprova AC-011. Ainda faltam backend durável concreto, indexação/associação visual abrangente, testes ponta a ponta reais via upload, gravação e interface e as três execuções do corpus real do AC-013. Nenhum critério está marcado como aceito sem QA ponta a ponta; acompanhar resultados finais relatados na sessão.

### Verificação local consolidada

- `NODE_ENV=development PAYMENTS_PROVIDER=SIMULATED node --import tsx --test src/worker/services/question-graph/__tests__/*.test.ts src/worker/services/__tests__/structured-question-extraction.graph*.test.ts`: **97/97**, backend, com mocks e MemorySaver de teste.
- `npm run typecheck -- --pretty false`: passou.
- QA independente: provider visual 2/2, afirmações 4/4, checkpoint 9/9, integração P5 9/9 e conjunto fórmula/visual + integração 29/29. Nenhum demonstra chamadas reais ao provider, Storage real ou interface.
- A flag `QUESTION_EXTRACTION_LANGGRAPH_ENABLED` está desligada por padrão e falha fechado sem saver durável reconhecido. O adapter não fornece backend persistente concreto. Sem Postgres/SQLite saver e schema aplicável já existente, AC-011 e a ativação do fluxo novo permanecem pendentes. Não houve migration.
- Busca híbrida relata cobertura parcial quando não existe índice visual; busca em imagens sem descrição e associação completa de gabaritos visuais continuam sem comprovação. Falhas de download são reportadas como pendência.
- Não foram executados os três testes completos reais do IFF/Pedro Lucas/Quimica-3 nem upload → banco → interface após as alterações. AC-001, AC-004, AC-009, AC-011 e AC-013 não estão aceitos. Os demais critérios também dependem de evidência de QA no ambiente de integração para aceite final.

### Ativação autorizada no ambiente do usuário — 07/11

Após autorização explícita do usuário para o Supabase remoto atual, aplicado o SQL proposto de checkpoint no schema `question_graph_checkpoints`; conferidas as quatro tabelas e ausência de USAGE para os papéis anon e authenticated. O schema é isolado das tabelas Question. Configuração `QUESTION_EXTRACTION_LANGGRAPH_ENABLED=true` e schema dedicado foi adicionada ao backend/.env, sem registrar credenciais. Foi iniciado worker local dedicado à fila `monitor-documents`, com heartbeat, sem iniciar processos de pagamentos. O ambiente usa Supabase remoto e Redis local 6379; a fila de documentos estava vazia ao iniciar. O teste Química-3 segue separado no Supabase dbtemp e Redis 56379.

### Ativação e Química-3 — 07/11

Ativação do schema remoto e da flag autorizada explicitamente pelo usuário. Worker local dedicado à fila de documentos conectado ao Redis do ambiente, com LangGraph habilitado; não iniciar testes de outros PDFs por instrução do usuário.

Upload real isolado de Química-3: `tests/document-parser/local-agentic/artifacts/2026-11-07T14-12-46-019Z-d61f3599/report.json`. Resultado `PARTIAL_SUCCESS`; 10 questões PENDING_REVIEW, 10 com cinco alternativas, seis com resposta gerada e quatro sem resposta; 13/13 chunks com embeddings; 20 assets classificados como figure, com quatro vínculos em três questões. Isso não comprova correção semântica, fórmulas, posições ou interface. Pendências: ANSWER_AGENT_FAILED em uma, três sem gabarito por opções assinaladas inutilizáveis, numeração ausente em uma, e avisos QUESTIONS_TEXT_COVERAGE_UNVERIFIED / QUESTIONS_PAGES_WITHOUT_TEXT / QUESTIONS_PAGE_TEXT_UNCLASSIFIED. Execução levou aproximadamente 36m29s. Logs indicam 633.744 tokens em respostas estruturadas (entrada 192.571, saída 441.173, raciocínio 422.956 incluído na saída) e 9.867 tokens em embeddings; valor cobrado não disponível. Uma chamada de gabarito consumiu 131.072 tokens de raciocínio e terminou truncada; tentativa corretiva foi executada. O extrator desta execução iniciou com timeout de 180s, antes da mudança que o removeu. Replay terminal não repetiu chamadas LLM nem duplicou registros; nenhum outro PDF foi testado nesta etapa.
