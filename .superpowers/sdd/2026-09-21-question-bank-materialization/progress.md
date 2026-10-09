# SDD ledger — plan: docs/superpowers/plans/2026-09-21-question-bank-materialization.md

Pre-flight: Fase 1 produz `NormalizedQuestionBankSelection`/`buildSelectionWhere`; Fases 2–6 consumirão esse contrato para persistir seleções e enviar o payload do modal. O catálogo ainda precisa expor `examType` e `board` separadamente antes da integração final do backend.

Task 1: complete (Fase 1, tests: backend selection service, frontend selection contract, frontend/backend typecheck, frontend full contract suite → PASS)

Ruling: o modal mantém `subjects` como árvore operacional e envia `questionBankSelections` como coleção opcional separada — isso permite monitor próprio, do acervo ou misto sem acoplar uploads posteriores ao acervo.

Ruling: a Fase 1 usa `ExamProfile.examType`/`board` quando presentes e mantém fallback no nome atual do perfil — o catálogo existente ainda conflui banca e tipo de prova; a separação canônica será corrigida antes da materialização efetiva.

Task 2: complete (Fase 2, tests: Prisma validate/generate, backend schema contract, backend selection contract, backend typecheck, frontend typecheck e frontend suite → PASS)

Ruling: o banco remoto tinha zero linhas em `monitor_question_bank_selections`, então a migration pode tornar `exam_type` e `selection_key` obrigatórios; ela falha explicitamente se um ambiente futuro possuir linhas legadas sem esses campos.

Ruling: não foi criada migration Prisma paralela porque o histórico deste projeto mantém `question_bank_items` e `monitor_question_bank_selections` em `backend/supabase/migrations`; o Prisma foi atualizado e regenerado para refletir o schema.

Remote verification: migration `20260921192256` aplicada via `psql`, registrada com `supabase migration repair`, e confirmada no histórico remoto. PostgreSQL confirmou `exam_type`/`selection_key` NOT NULL, `board` nullable, `question_bank_item_id` nullable, FK `ON DELETE RESTRICT`, constraints e índices.

Task 3: complete (Fase 3, testes: schema de criação do monitor, catálogo com `examType`/`board` separados, seleção e backend typecheck → PASS)

Ruling: `questionBankSelections` é opcional no payload de criação; o monitor próprio continua válido sem nenhuma seleção do acervo.

Ruling: a criação do monitor persiste subjects, topics e seleções na mesma transação. Cada seleção é normalizada, deduplicada e associada ao tópico local pelo caminho `topic > subtopic > subsubtopic`; se o tópico não existir, toda a criação falha e sofre rollback.

Ruling: o catálogo agora identifica perfis por `examType + board`, mantendo esses campos separados no retorno para impedir mistura de provas e bancas na futura materialização.

Task 4: complete (Fase 4, testes: materialização unitária com item válido, dados inválidos, item arquivado, deduplicação, retry, monitores distintos e falha isolada → PASS; backend typecheck → PASS)

Ruling: a materialização usa `sourceKey = question-bank:{monitorId}:{questionBankItemId}`, deduplica itens por ID e grava cópia aprovada com `questionBankItemId`, tópico/matéria locais e metadata completa da origem/taxonomia.

Ruling: o serviço não cria questão para alternativas inválidas, gabarito incompatível ou status não ativo; falhas de persistência ficam no resumo e não interrompem os demais itens do lote.

Task 5: complete (Fase 5, testes: criação própria sem materialização, criação com seleção usando IDs locais, falhas parciais mantendo `DRAFT` e materialização unitária → PASS; backend typecheck → PASS)

Ruling: a criação do monitor agora executa materialização síncrona somente quando existem seleções persistidas. O retorno mantém `data` como o monitor operacional e adiciona `materialization` com o resumo; sem acervo, o campo é `null` e o fluxo anterior permanece inalterado.

Ruling: falhas de itens não mudam o monitor para outro status nem invalidam as cópias válidas; a validação de publicação continuará sendo responsabilidade da Fase 7.

Ruling: indisponibilidade da consulta ao acervo também retorna em `materialization.failures`, preservando o monitor `DRAFT` e evitando erro genérico após a criação da árvore local.

Task 6: complete (Fase 6, frontend typecheck → PASS, frontend suite 30/30 → PASS, backend typecheck → PASS, testes focados backend 6/6 → PASS)

Ruling: o modal envia `subjects` e `questionBankSelections` no mesmo payload, mantendo a árvore operacional separada da seleção do acervo. O retorno de materialização é registrado no frontend e devolvido pelo backend sem alterar `data`.

Ruling: foram adicionados logs estruturados para payload recebido, árvore/seleções persistidas, filtros e itens encontrados, associação local, criação/atualização/skip/falha por item e resumo final. O enunciado das questões não é registrado.

Ruling: o ID do perfil `ENEM` voltou a ser estável (`enem`), enquanto perfis com banca usam `examType-board` (por exemplo, `concurso-fgv`), mantendo compatibilidade com o estado inicial do modal.

Diagnostic patch: o frontend agora registra o rascunho final antes do envio e bloqueia matérias sem tópicos; o backend registra `receivedBody` e `validationIssues` quando o Zod rejeita o payload, permitindo identificar exatamente a forma inválida recebida.

Diagnostic fix: o limite legado de 30 tópicos por matéria foi ampliado para 500, o limite de matérias para 20 e o de seleções do acervo para 5000, permitindo importar uma matéria inteira com dezenas de folhas taxonômicas.

Task 6.1: complete (normalização da hierarquia local)

Ruling: `MonitorTopic` agora guarda somente o tópico raiz; `MonitorSubtopic` e `MonitorSubsubtopic` guardam os níveis inferiores. O payload legado com nomes `A > B > C` é convertido no backend durante a criação, agrupando raízes repetidas.

Ruling: questões mantêm `topicId` como referência raiz e passam a receber `subtopicId`/`subsubtopicId`; seleções também guardam os IDs locais correspondentes, além da taxonomia original do acervo.

Remote verification: migration `20260921203238_normalize-monitor-topic-hierarchy` aplicada e registrada. Banco remoto confirmou 13 tópicos raiz, 32 subtópicos, 53 subsubtópicos, 73 seleções com subtópico local e 602 questões do acervo com subtópico local.
