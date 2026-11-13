# Correção do processamento de questões e contexto visual no chat — plano de implementação

> Para execução: seguir o fluxo de `AGENTS.md` e `docs/agent-workflow.md`, com pacotes para implementador e revisão independente de QA. Nenhum commit ou migração sem autorização explícita.

**Objetivo:** processar as dez questões do PDF, preservar suas origens e imagens, gerar alternativas quando necessário e comprovar, até a chamada ao modelo do chat, que uma imagem da questão é enviada como contexto.

**Arquitetura:** manter o documento e suas evidências como origem rastreável; tornar substituição de chunks e persistência das questões seguras em repetição; resolver vínculos visuais com evidência suficiente e manter ambiguidades revisáveis. No chat, partir de uma questão autorizada e aprovada, carregar seus assets privados e encaminhar imagem e texto ao modelo, com observabilidade sem expor bytes ou credenciais.

**Tecnologias:** TypeScript, Node, Prisma/Postgres com pgvector, Supabase Storage local, Docling/OCR, OpenRouter e testes existentes do backend.

**Especificação:** os requisitos e critérios abaixo constituem a especificação deste plano; resultados anteriores em `dbtemp/artifacts/` são evidências, não gabarito de correção.

## Contexto e limites

- `Quimica-3.pdf`: documento de questões, 10 blocos identificados; a questão 01 na página 3 possui uma imagem candidata. O vínculo efetivo deve ser confirmado contra a página original, sem presumir que toda imagem na página pertença à questão.
- `Estequiometria.pdf` e `pH e pOH.pdf`: material de conhecimento e anotações, não importar como questões. Preservar as imagens e testar recuperação como conhecimento.
- Usar exclusivamente o Supabase descartável `dbtemp`, porta 56322, e seus buckets locais para dados e arquivos; chamadas de IA reais usam a chave configurada. Não imprimir credenciais nem URLs assinadas.
- Antes de alterar, preservar alterações existentes do usuário e os relatórios de execução; registrar versão, modelos, parâmetros, contagem de chamadas e custos disponíveis. Não repetir o worker sobre dados existentes até proteger suas relações.
- Os resultados da IA são não determinísticos: validar estrutura e evidência com testes automáticos e qualidade química por revisão humana. Não substituir a imagem por uma descrição textual ao afirmar que ela foi enviada ao modelo.

## Critérios de aceite

- **AC-001:** as 10 questões são identificadas uma única vez, com número, página e texto de origem verificáveis. Questão incompleta ou ambígua permanece como candidata rastreável, com motivo explícito, sem ser contabilizada como questão pronta.
- **AC-002:** para questão discursiva convertível, a IA produz cinco alternativas distintas, uma resposta referindo-se a elas e origem `AI_GENERATED`; falha parcial continua revisável com campos faltantes explícitos. Alternativas já existentes são preservadas com sua origem.
- **AC-003:** repetir processamento do mesmo PDF, inclusive após falha parcial e execução concorrente, não duplica questões, não perde vínculos de origem ou visuais e não provoca conflito `P2002`; mudanças reais no documento são tratadas transacionalmente sem apagar evidências ainda referenciadas.
- **AC-004:** imagem relevante é armazenada e vinculada à questão quando há evidência suficiente; vínculo ambíguo permite revisão e resolução explícita, preservando candidatos e rastreabilidade. Nenhuma imagem é associada apenas por compartilhar página sem prova suficiente.
- **AC-005:** o chat aceita contexto de questão aprovada e autorizada, carrega seu asset privado e envia ao modelo multimodal o texto e a imagem correta. O teste comprova a presença e a integridade dos bytes na requisição e uma resposta sobre um fato presente na imagem.
- **AC-006:** isolamentos de professor/monitor e status de aprovação são respeitados; asset ausente, corrompido ou de outro tenant não vaza nem produz alegação falsa de leitura visual.
- **AC-007:** os dois documentos de conhecimento continuam pesquisáveis, incluindo uma figura e anotações da página 3 de Estequiometria; classificação e ingestão não criam questões a partir deles.
- **AC-008:** relatório reproduzível contém contagens de blocos, candidatas por estado, questões, origens, alternativas, respostas, imagens, vínculos e resultados do chat; estados parciais e limitações são visíveis mesmo quando o documento geral está `READY`.

## Pontos de atenção para revisão

1. PDF com múltiplas figuras ou múltiplas questões na mesma página: a resolução exige evidência e conserva a ambiguidade (pacote 2).
2. Repetição simultânea ou interrupção durante substituição: transação preserva relações existentes (pacote 1).
3. Imagem ausente/corrompida ou não autorizada: chat não transmite o asset nem diz tê-lo visto (pacote 3).
4. Alternativas geradas com resposta inválida ou JSON truncado: candidata fica incompleta e revisável (pacote 2).
5. Questão pendente ou de outro monitor: rota impede acesso mesmo com ID conhecido (pacote 3).

## Pacote 1 — Reprocessamento e rastreabilidade (AC-001, AC-003, AC-008)

**Responsabilidade:** `backend/src/repositories/document-worker.repository.ts`, `backend/src/repositories/question.repository.ts`, pontos necessários em `backend/src/worker/services/question-extraction.service.ts` e testes correspondentes. Executar antes dos demais pacotes que dependem de persistência.

- [ ] Criar reprodução de integração em banco local: primeira ingestão, mesma ingestão novamente, falha após substituir fonte e duas execuções concorrentes. Conferir IDs lógicos, fontes por questão, vínculos visuais e contagens antes/depois; registrar falha inicial `P2002` e perda de vínculos.
- [ ] Definir identidade estável de documento, questão e fonte a partir de dados de origem estáveis; distinguir reprocessamento da mesma origem de uma questão duplicada proveniente de outra origem. Não usar ID transitório de bloco como única identidade.
- [ ] Alterar persistência para reaproveitar chunks imutáveis quando possível. Quando conteúdo mudar, preservar/remapear referências numa transação com lock por documento; em caso de mapeamento inseguro abortar sem excluir dados antigos e registrar motivo.
- [ ] Resolver atomicamente concorrência entre `sourceKey` e unicidade `(topic_id, text_hash)`: reutilizar questão existente apropriada e acrescentar a origem, sem sobrescrever revisão do professor. Se a duplicidade for incerta, manter candidata revisável.
- [ ] Verificar que contagens e vínculos são iguais após repetição, que rollback restaura o estado anterior e que inserções simultâneas não duplicam. Exercitar questão aprovada e questão pendente.
- [ ] QA independente revisa diff e executa os cenários no Postgres local; registrar comandos e evidências em `specs/questions-chat-visual/validation.md`.

## Pacote 2 — Associação visual e conclusão de questões (AC-001, AC-002, AC-004, AC-008)

**Responsabilidade:** `backend/src/worker/services/document-visual-linking.service.ts`, `backend/src/worker/services/question-extraction.service.ts`, serviços em `backend/src/worker/services/completeQuestion/`, repositórios visuais e testes associados. Depende do contrato estável do pacote 1.

- [ ] Renderizar a página 3 original e inspecionar o asset armazenado, a caixa delimitadora e o bloco da questão 01. Registrar a decisão sobre seu vínculo com evidência visual; se insuficiente, deixar explícita a intervenção de revisão necessária.
- [ ] Adicionar testes para sobreposição espacial inequívoca, imagem fora da questão, vários candidatos, caixa ausente e vínculo confirmado por revisão. Persistir candidatos e motivo; nunca escolher automaticamente apenas pela página.
- [ ] Implementar resolução revisável que ligue o asset correto ao `QuestionSpan` e à `Question` promovida, com página, método e confiança. O asset original continua no Storage privado e acessível ao contexto autorizado.
- [ ] Testar questão discursiva sem alternativas, questão com alternativas originais, saída truncada, alternativa duplicada e resposta fora das opções. Confirmar cinco alternativas e origem IA apenas quando válidas; persistir falha parcial com campos ausentes e motivo.
- [ ] Encaminhar ao worker os modelos e limites efetivos da configuração; testar explicitamente o limite de alternativas e fallback. Registrar modelo, parâmetros e resultados sem chave. Investigar textos acima dos limites do schema e assegurar retry ou estado revisável explícito.
- [ ] Rodar as 10 candidatas em ambiente local limpo; comparar cada número e página com o PDF. Para itens dependentes de imagem, não aceitar resposta de IA como correta sem evidência visual e revisão de conteúdo.

## Pacote 3 — Chat multimodal e autorização (AC-004, AC-005, AC-006)

**Responsabilidade:** `backend/src/modules/chat/chat.routes.ts`, `backend/src/modules/chat/rag/repositories/prisma-chat-visual-context.repository.ts`, `backend/src/modules/chat/rag/services/chat-visual-context.service.ts`, `chat-visual-image-loader.service.ts`, `backend/src/modules/chat/providers/openrouter-chat.gateway.ts` e testes dos respectivos módulos. Confirmar os contratos reais antes de mudar interfaces.

- [ ] Mapear e testar a cadeia `questionContext.questionId` → questão aprovada e autorizada → `question_visual_assets` → Storage privado → conteúdo multimodal do gateway. A rota existente exige `status = APPROVED`: aprovar apenas uma questão de fixture no tenant local após conferir o vínculo visual.
- [ ] Em teste de integração, interceptar a chamada ao gateway: verificar mensagem de texto e parte `image_url` ou equivalente efetivamente transmitida, MIME válido e SHA-256 dos bytes igual ao asset da questão. Uma descrição textual ou ID no prompt não satisfaz este critério.
- [ ] Testar outro tenant, questão não aprovada, asset de outra questão, URL expirada e arquivo ausente/corrompido. Exigir bloqueio ou resposta explícita de contexto visual indisponível, sem vazamento e sem afirmação de que a imagem foi vista.
- [ ] Testar resolução visual com mais de uma imagem e definir limite/ordem explícitos; assegurar que a figura necessária não seja descartada silenciosamente. Registrar IDs e páginas, sem registrar conteúdo privado.
- [ ] Fazer chamada real ao chat com a questão aprovada e pergunta sobre um detalhe que só aparece na figura. Comparar resposta com a página original e registrar transcrição e evidência da requisição; se o modelo não for multimodal ou não enxergar a imagem, registrar falha em vez de aceitar uma resposta plausível pelo texto.

## Pacote 4 — E2E dos três PDFs e relatório (AC-001 a AC-008)

**Responsabilidade:** `dbtemp/` e novos testes/fixtures de integração em `tests/document-parser/` ou padrão existente; QA independente mantém seu plano e evidências em `specs/questions-chat-visual/`. Depende dos pacotes 1–3.

- [ ] Criar execução limpa e reproduzível usando IDs de teste e buckets locais, sem apagar dados de outros projetos. Registrar schema, configuração efetiva, tempo, modelo, falhas e custos disponíveis; preservar execuções anteriores.
- [ ] Ingerir `Quimica-3.pdf` como `QUESTIONS`; comparar as dez questões com páginas 3–12, verificando texto, fontes, estado da candidata, alternativas, resposta e visual. Não inferir completude apenas de `READY`.
- [ ] Repetir a ingestão duas vezes e simular interrupção após chunks; comparar quantidade de questões e hashes/associações de origens e imagens. Verificar retomada, ausência de duplicatas e integridade das referências.
- [ ] Ingerir `Estequiometria.pdf` e `pH e pOH.pdf` como `KNOWLEDGE_BASE`; verificar OCR, embeddings, busca por conteúdo e recuperação da imagem/anotações da página 3, sem criar questões.
- [ ] Aprovar no tenant local uma questão cujo vínculo de imagem foi validado, autenticar aluno autorizado e chamar a rota real de chat. Capturar evidência no gateway e resposta real sobre a figura; conferir SHA, escopo e fato visual com o PDF. Repetir com aluno não autorizado e imagem indisponível.
- [ ] Gerar JSON e relatório legível: por questão, número, página, estado, origem, alternativas, resposta, asset e vínculo; por documento, chunks, embeddings e assets; no chat, questão, asset, hash, envio comprovado e avaliação da resposta. Diferenciar respostas reais, mocks e revisão humana.
- [ ] QA independente executa testes focados de repositório, worker, visual e chat, teste de integração no Postgres/Storage local e E2E real. Registrar em `validation.md` cada AC, comando, resultado, artefato e lacuna; nenhum AC depende apenas de resposta plausível da IA.

## Ordem e resultado esperado

1. Pacote 1 protege dados e corrige repetição; pacote 2 corrige evidência visual e conclusão; pacote 3 comprova o caminho do chat; pacote 4 executa os três documentos e integra as evidências.
2. Os pacotes 2 e 3 podem avançar em paralelo apenas após definir o contrato do vínculo visual e verificar que não compartilham arquivos; caso contrário, executar sequencialmente. No máximo dois implementadores ativos, mais QA independente, conforme o repositório.
3. Entrega concluída somente com os dez blocos reconciliados, pendências justificadas e verificadas, reprocessamento seguro e prova de bytes da imagem na chamada ao chat. Questão ambígua permanece em revisão até resolução verificável.
