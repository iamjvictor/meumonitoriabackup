# Painel de Inteligência do Professor — proposta de especificação

**Estado:** proposta para discussão; regras marcadas como propostas precisam de confirmação antes da implementação.

## Objetivo

Permitir que a professora acompanhe o desempenho e a frequência de prática dos alunos de seus monitores, passando de uma visão consolidada para um monitor e, depois, para um aluno. O painel deve usar dados reais, explicar os indicadores e destacar tanto pontos fortes quanto dificuldades.

## Estrutura da experiência

### 1. Visão geral

- A aba existente abre o Painel de Inteligência. Título, período selecionado e explicação curta acompanham a navegação.
- Exibir alunos vinculados distintos, alunos que praticaram no período, acurácia média dos alunos com respostas, questões respondidas e média de dias de prática por aluno. Os denominadores aparecem junto dos indicadores ou em ajuda acessível.
- Exibir um resumo da frequência no período e a quantidade de alunos sem atividade. Abaixo, apresentar cards dos monitores da professora, incluindo monitores sem alunos ou sem prática.
- Cada card apresenta nome, identidade visual quando disponível, quantidade de alunos distintos, acurácia média, alunos ativos e frequência média, com indicação clara de dados insuficientes. O card inteiro é acionável por mouse e teclado, tem estado de foco e abre a visão do monitor. Em telas pequenas, os cards empilham sem cortar informações.

### 2. Visão do monitor

- Identificar o monitor e permitir voltar à visão geral, preservando o período.
- Apresentar os mesmos indicadores calculados somente para os alunos e a atividade daquele monitor.
- Mostrar **três tópicos com melhores resultados** e **três que mais precisam de atenção**, com acurácia, número de respostas e de alunos participantes. Ordenar por acurácia; desempatar por maior amostra e depois nome. Não inventar posições: se houver menos de três tópicos elegíveis, mostrar apenas os disponíveis.
- Exibir lista paginada de alunos vinculados, com nome, acurácia, respostas, dias de prática e última atividade no monitor. Permitir procurar por nome e ordenar por nome, acurácia ou última atividade. Alunos sem prática aparecem como “Sem dados”. Selecionar um aluno abre seu detalhe.

### 3. Visão do aluno no monitor

- Identificar aluno e monitor e permitir retorno à lista preservando período, busca, ordenação e página.
- Mostrar acurácia, respostas, acertos, dias de prática, última atividade, evolução da prática no período e desempenho por matéria e tópico. Apresentar os três melhores e os três tópicos que precisam de atenção quando houver amostra suficiente.
- Mostrar revisões de flashcards separadamente das respostas de questões; não apresentar avaliação de flashcard como acerto de questão. Não mostrar histórico de conversas ou conteúdo privado de outros monitores.

## Definições propostas para os indicadores

As escolhas abaixo são propostas de produto, não decisões já aprovadas.

1. **Período:** últimos 30 dias por padrão; opções 7, 30 e 90 dias e todo o histórico. Datas exibidas em horário de Brasília; limites calculados como intervalo semiaberto em UTC. O fim inclui o dia atual.
2. **População:** alunos com acesso vigente ao monitor no momento da consulta, usando as regras existentes de acesso, inclusive modalidades patrocinadas. Deduplicar por aluno e monitor; na visão geral, contar cada aluno uma única vez. A definição de incluir alunos cujo acesso expirou é uma decisão pendente.
3. **Tentativas:** contar registros `StudentQuestionAttempt` com `status = ACTIVE` e `answeredAt` no período. Uma nova tentativa da mesma questão conta novamente. Incluir os modos persistidos, identificando-os no contrato; o desafio diário que referencia a tentativa não gera uma segunda contagem.
4. **Acurácia individual:** tentativas corretas divididas por tentativas respondidas × 100. Sem tentativas, apresentar “Sem dados”, não 0%.
5. **Acurácia média do monitor:** média aritmética das acurácias individuais dos alunos com pelo menos uma tentativa naquele monitor e período. Na visão geral, calcular primeiro uma acurácia por aluno sobre suas tentativas nos monitores da professora e depois a média entre alunos; isso evita duplicar alunos vinculados a vários monitores. Exibir também a contagem de alunos que compõem a média.
6. **Prática:** dia com ao menos uma tentativa válida ou revisão de flashcard no monitor, considerando a data local de Brasília. Unir eventos e deduplicar dias por aluno; na visão geral deduplicar o mesmo dia entre monitores. Frequência média = soma de dias distintos de prática dos alunos da população ÷ total de alunos da população, incluindo quem não praticou. Destacar a parcela de alunos ativos.
7. **Tópicos:** atribuir cada tentativa ao `Question.topicId` principal, quando presente; tentativas sem tópico entram nos totais gerais, mas não no ranking de tópicos. Acurácia por tópico = acertos ÷ respostas; proposta de elegibilidade: ao menos 5 respostas e 2 alunos no monitor. No detalhe individual, mínimo de 5 respostas. Informar a amostra e evitar sobreposição entre listas: melhores primeiro, piores entre os tópicos restantes. Se não houver amostra, explicar que ainda não há dados suficientes.
8. **Última atividade:** maior data de tentativa válida ou revisão no escopo selecionado. A visão geral pode mostrar dados de atividade fora do período apenas se identificados como tal; por padrão, todos os indicadores obedecem ao filtro.

## Análise do schema e limites

- `Monitor.teacherId` define o proprietário; `MonitorSubject` e `MonitorTopic` estruturam matérias e tópicos. A autorização deve ser validada no backend em cada consulta.
- `StudentQuestionAttempt` registra aluno, monitor, questão, modo, status, correção, horário e tempo de resposta opcional. Os índices existentes incluem monitor/data e aluno/data; avaliar planos de consulta e índices adicionais conforme volume real.
- `Question.topicId` é opcional e `QuestionTopic` permite vínculos adicionais. A regra proposta usa apenas o tópico principal para não multiplicar uma resposta em vários tópicos; mudanças posteriores na classificação podem alterar relatórios históricos.
- `DailyChallengeAttempt.questionAttemptId` referencia uma tentativa de questão: somar as duas tabelas duplicaria a atividade.
- `StudentFlashcardReviewLog` registra revisões por aluno e horário; associar ao monitor pelo flashcard. `StudentFlashcardProgress` representa estado atual e não substitui o histórico de revisões.
- `Student`, `StudentEnrollment`, `StudentSubscription` e fontes de acesso patrocinado precisam ser consolidados pelas regras de acesso já existentes, considerando ambiente, status e vigência. Não presumir que uma única tabela representa todos os vínculos.
- `responseTimeMs` é opcional por resposta: não permite afirmar tempo total de estudo. Não há evidência suficiente no schema analisado para medir logins, leitura de material ou tempo total de sessão; esses indicadores ficam fora da primeira versão.

## Segurança, estados e desempenho

- O backend deriva a professora da sessão e restringe os dados aos monitores próprios e aos alunos elegíveis. IDs de outro professor devem receber resposta de acesso negado ou não encontrado, sem revelar dados.
- Enviar ao cliente apenas dados necessários à tela; não expor respostas individuais, credenciais, conversas ou dados de outro monitor.
- Tratar carregamento, erro com opção de tentar novamente, ausência de monitores, ausência de alunos e ausência de atividade. Não confundir erro de consulta com zero.
- Usar agregações no banco e paginação da lista; não transferir todo o histórico ao navegador. Avaliar consultas e índices com volume representativo antes de adicionar materializações ou cache.
- A interface deve preservar navegação por teclado, rótulos acessíveis, contraste e adaptação a celular.

## Critérios de aceite

- **AC-001:** a visão geral apresenta indicadores e cards de todos os monitores da professora, com filtros e estados vazios.
- **AC-002:** as médias, população, frequência e tentativas seguem as definições aprovadas, sem duplicar alunos, dias ou desafio diário; ausência de respostas não vira 0%.
- **AC-003:** selecionar um card abre os indicadores e os rankings de tópicos daquele monitor, com amostras visíveis e tratamento de dados insuficientes.
- **AC-004:** a lista contém alunos elegíveis, pesquisa, ordenação, paginação e alunos sem atividade; selecionar aluno abre seu desempenho naquele monitor.
- **AC-005:** o detalhe exibe desempenho por matéria e tópico, evolução e revisões de flashcards separadas das questões, com retorno preservando o contexto.
- **AC-006:** nenhum professor consegue acessar dados de monitores ou alunos fora do seu escopo por manipulação de IDs.
- **AC-007:** carregamento, falhas, dispositivos móveis e navegação por teclado são tratados; dados indisponíveis nunca são exibidos como valores reais.

## Decisões para revisão

1. Incluir apenas alunos com acesso vigente ou também alunos cujo acesso expirou? A proposta inicial usa acesso vigente.
2. Acurácia geral deve dar o mesmo peso a cada aluno, como proposto, ou a cada resposta? Os dois resultados podem diferir bastante.
3. Contar revisões de flashcards como dias de prática, além de questões? A proposta inclui ambos, exibindo volumes separados.
4. Confirmar período padrão de 30 dias e amostra mínima de 5 respostas e 2 alunos para ranking do monitor.
5. Confirmar se repetição de questão deve contar em toda tentativa ou apenas na primeira tentativa por questão.

## Entrega e validação propostas

Implementar em etapas: contrato de métricas e autorização; agregações e endpoints; visão geral e cards; detalhe do monitor e lista; detalhe do aluno; revisão de acessibilidade e desempenho. Antes de codificar, transformar as decisões aprovadas em plano e tarefas com responsabilidade por arquivos. QA deve cobrir múltiplos vínculos, acessos patrocinados, isolamento entre professores, fuso horário, respostas repetidas, tópicos sem classificação, amostras pequenas, paginação, estados vazios e falhas. Nenhum critério está validado nesta fase de planejamento.
