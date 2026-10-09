# Simulados Semanais Personalizados — Especificação

**Data:** 2026-09-09  
**Status:** Design aprovado em brainstorm; aguardando revisão escrita antes do plano de implementação  
**Escopo:** um simulado personalizado por aluno e monitor a cada ciclo semanal iniciado na sexta-feira às 00:00, no fuso `America/Sao_Paulo`.

## 1. Objetivo

Permitir que cada aluno gere, de forma assíncrona, um simulado personalizado de até 30 questões para cada monitor ao qual tem acesso. A personalização será baseada no cruzamento do desempenho do aluno em questões e flashcards no ciclo atual, incluindo o último simulado quando aplicável.

A IA não criará questões, alternativas, respostas ou explicações novas. O simulado será composto exclusivamente por questões existentes e aprovadas no banco do monitor.

## 2. Decisões de produto

- O ciclo semanal começa toda sexta-feira às `00:00:00` em `America/Sao_Paulo`.
- A análise considera o período desde a última sexta-feira até o momento em que a geração é solicitada.
- A análise inclui tentativas de questões normais, desafios, simulados e revisões de flashcards.
- O último simulado realizado será considerado pela mesma trilha de desempenho, sem duplicar respostas já persistidas.
- Existe no máximo um simulado por aluno, monitor e ciclo semanal.
- O aluno pode solicitar a geração uma vez por monitor no ciclo.
- O processamento é assíncrono e tem estados `PENDING`, `PROCESSING`, `READY`, `IN_PROGRESS`, `COMPLETED` e `FAILED`.
- O simulado pronto é imutável: suas questões, ordem, diagnóstico e distribuição não mudam depois da geração.
- Ao chegar a próxima sexta-feira, um simulado incompleto bloqueia a geração do novo simulado. O aluno deve continuar e concluir o anterior.
- Respostas parciais permanecem registradas e entram no histórico de desempenho.
- Um novo simulado só pode ser gerado depois que o anterior for concluído.
- O sistema tenta gerar 30 questões. Se houver menos de 30 questões aprovadas elegíveis, usa todas as disponíveis e informa a quantidade.
- Não há repetição de questão dentro do mesmo simulado.
- Se um tópico não tiver questões suficientes, as vagas são redistribuídas para os próximos tópicos prioritários.
- Cada tópico elegível recebe pelo menos uma questão quando houver questão disponível.
- Sem dados suficientes, a distribuição é equilibrada entre os tópicos disponíveis.

## 3. Diagnóstico de dificuldade

### 3.1 Janela

Para uma geração no ciclo `C`:

```text
[startOfCycle, generationRequestedAt]
```

`startOfCycle` é a última sexta-feira às 00:00 em `America/Sao_Paulo`. Horários persistidos continuam em UTC; a conversão para a data do ciclo acontece no domínio da aplicação.

O diagnóstico registra `cycleStartDate`, `analysisStartedAt`, `analysisEndedAt` e o fuso.

### 3.2 Questões

Entram as tentativas nos modos `PRACTICE`, `SIMULATED` e `DAILY_CHALLENGE`.

Para cada tópico, a dificuldade de questões é a proporção de respostas incorretas. Acerto equivale a dificuldade 0 e erro a dificuldade 1.

O último simulado não será contado como métrica separada quando suas respostas já estiverem em `student_question_attempts`; suas tentativas individuais são a fonte de verdade.

### 3.3 Flashcards

Entram as revisões de `student_flashcard_review_logs` do monitor, matéria e tópico no período.

| Rating | Peso |
|---|---:|
| `AGAIN` | 1,0 |
| `HARD` | 0,6 |
| `GOOD` | 0,2 |
| `EASY` | 0,0 |

A dificuldade de flashcards é a média ponderada das revisões. Cards sem revisão não constituem evidência. O número de revisões é guardado no snapshot.

### 3.4 Cruzamento

```text
topicDifficulty = 0.60 * questionDifficulty
                + 0.40 * flashcardDifficulty
```

Os pesos ficam configuráveis em constante versionada do backend e são copiados para o snapshot.

Quando somente uma fonte possui evidência, ela é usada normalizada. Quando nenhuma possui evidência, o tópico recebe dificuldade neutra e entra na distribuição equilibrada.

Poucas observações não devem permitir que um único evento domine o simulado. O algoritmo aplica suavização configurável antes da distribuição e guarda contagens de evidência.

## 4. Distribuição

1. Buscar tópicos e questões aprovadas do monitor.
2. Excluir questões que não estejam disponíveis para o aluno ou não pertençam ao monitor.
3. Agrupar questões por tópico.
4. Calcular dificuldade por tópico.
5. Reservar uma vaga para cada tópico com questão disponível.
6. Distribuir vagas restantes proporcionalmente à dificuldade.
7. Resolver casas decimais pelo método das maiores sobras; em empate, priorizar maior dificuldade.
8. Redistribuir vagas quando um tópico esgotar seu estoque.
9. Selecionar por tópico nesta ordem: questões nunca respondidas; questões respondidas e erradas; questões respondidas e acertadas apenas para completar vagas.
10. Embaralhar de forma controlável em testes e persistir a posição final.

Se houver menos de 30 questões elegíveis, o tamanho final será a quantidade disponível. Se não houver nenhuma, a geração falhará com erro funcional explicável e o direito permanecerá disponível para reprocessamento.

## 5. Snapshot e auditoria

O simulado pronto preserva:

- ciclo e janela de análise;
- pesos das fontes;
- versão do algoritmo;
- pontuação, contagens e confiança por tópico;
- distribuição planejada e distribuição final;
- quantidade de questões disponíveis;
- motivo de seleção de cada questão;
- timestamps e identificadores do job.

O snapshot é a explicação técnica do simulado e não é recalculado ao consultar o resultado.

# Frente 1 — Dados

## Fase D1 — Modelagem

### `weekly_simulations`

Campos mínimos:

- `id` UUID;
- `student_id`, `monitor_id` UUID;
- `cycle_start_date` date;
- `status` enum;
- `requested_at`, `started_at`, `completed_at`, `failed_at`;
- `generation_job_id`;
- `question_count`, `answered_count`, `correct_count`;
- `score_percent` opcional;
- `diagnostic_snapshot` JSONB;
- `failure_code`, `failure_message` opcionais;
- `created_at`, `updated_at`.

Restrição:

```text
UNIQUE (student_id, monitor_id, cycle_start_date)
```

### `weekly_simulation_items`

Campos mínimos:

- `id` UUID;
- `simulation_id`, `question_id` UUID;
- `position` int;
- `subject_id`, `topic_id` opcional;
- `difficulty_score`;
- `selection_priority`, `selection_reason`;
- `question_attempt_id` opcional;
- `selected_answer`, `is_correct`, `answered_at` opcionais.

Restrições:

```text
UNIQUE (simulation_id, question_id)
UNIQUE (simulation_id, position)
```

Referenciar questões com `RESTRICT`. Guardar snapshot mínimo de matéria/tópico no item.

## Fase D2 — Integração

- Reutilizar `student_question_attempts` com `mode = SIMULATED`.
- Adicionar referência opcional ao item do simulado para rastrear resposta.
- Manter correção no backend.
- Não criar segunda fonte de verdade para acertos.
- Atualizar desempenho pelas tentativas persistidas.
- Consultar logs de flashcards existentes; não duplicar reviews.

## Fase D3 — Migração e integridade

Criar migration para enums, tabelas, relações, índices por aluno/monitor/ciclo, índices por simulado/posição e simulado/questão, índices para consultas por janela temporal e constraints de unicidade.

### Aceite de Dados

- Dois simulados para o mesmo aluno, monitor e ciclo são impossíveis.
- Um simulado pronto conserva suas questões após alterações no banco.
- Uma questão não aparece duas vezes.
- Respostas alimentam a trilha geral de desempenho.
- A migration não apaga histórico existente.

# Frente 2 — Backend

## Fase B1 — Domínio

Criar módulo isolado seguindo os módulos existentes:

```text
backend/src/modules/weekly-simulations/
  models/
  repositories/
  services/
  controllers/
  routes/
  weekly-simulations.module.ts
```

Componentes:

- `weekly-simulation-cycle.service`: ciclo e bloqueios;
- `weekly-simulation-diagnostic.service`: consulta e normalização;
- `weekly-simulation-distribution.service`: vagas e redistribuição;
- `weekly-simulation-question-selection.service`: prioridade de questões;
- `weekly-simulation-generation.service`: orquestração;
- `weekly-simulation-answer.service`: respostas e resultado;
- repositórios Prisma para leitura, escrita e transações.

O algoritmo puro recebe dados agregados e é testável sem banco.

## Fase B2 — Solicitação assíncrona

Ao chamar a geração:

1. autenticar usuário;
2. resolver aluno;
3. validar acesso ao monitor;
4. resolver `cycleStartDate`;
5. verificar simulado incompleto de ciclo anterior;
6. verificar simulado existente no ciclo atual;
7. criar ou recuperar registro idempotente em `PENDING`;
8. publicar job com chave `weekly-simulation:{studentId}:{monitorId}:{cycleStartDate}`;
9. retornar estado e id.

Registros `READY`, `IN_PROGRESS` e `COMPLETED` são retornados sem criar outro. `PENDING` e `PROCESSING` informam processamento em andamento. `FAILED` pode ser reprocessado.

## Fase B3 — Worker

1. Adquirir job idempotente.
2. Atualizar para `PROCESSING`.
3. Capturar janela e snapshot de desempenho.
4. Calcular dificuldades.
5. Distribuir vagas.
6. Selecionar questões aprovadas.
7. Persistir itens e snapshot em transação.
8. Atualizar para `READY`.
9. Registrar duração, quantidade, tópicos, redistribuições e erro.

Falhas transitórias são reprocessáveis. Ausência total de questões é falha funcional e não consome o direito.

## Fase B4 — APIs

```http
GET  /api/v1/student/monitors/:monitorId/weekly-simulation
POST /api/v1/student/monitors/:monitorId/weekly-simulation/generate
GET  /api/v1/student/weekly-simulations/:simulationId
POST /api/v1/student/weekly-simulations/:simulationId/items/:itemId/answer
GET  /api/v1/student/weekly-simulations/:simulationId/result
```

A visão por monitor retorna:

- `AVAILABLE_TO_GENERATE`;
- `PENDING`;
- `PROCESSING`;
- `READY`;
- `IN_PROGRESS`;
- `COMPLETED`;
- `BLOCKED_BY_PREVIOUS`;
- `FAILED`.

Antes da resposta, nunca retornar `correctAnswer`.

A resposta valida acesso, pertencimento do item, calcula acerto com a questão persistida, cria tentativa `SIMULATED`, impede duas respostas, suporta retry idempotente, atualiza contadores e marca `COMPLETED` ao finalizar.

## Fase B5 — Segurança e observabilidade

- Autorizar sempre no backend.
- Nunca confiar em `studentId`, `monitorId`, `isCorrect` ou `correctAnswer` do cliente.
- Proteger o limite por constraint e regra de domínio.
- Não registrar enunciados, respostas corretas, tokens ou dados sensíveis.
- Registrar `requestId`, `jobId`, aluno, monitor, ciclo, status e duração.
- A IA não é dependência do caminho crítico do MVP.

### Aceite de Backend

- Cliques simultâneos produzem um único simulado.
- Simulado anterior incompleto bloqueia novo simulado.
- Falha pode ser reprocessada.
- Geração retorna rápido e roda no worker.
- Snapshot permite auditoria.
- Resposta correta não vaza antes da submissão.
- Concorrência não duplica resposta.

# Frente 3 — Frontend

## Fase F1 — Estado por monitor

| Estado | Ação visual |
|---|---|
| `AVAILABLE_TO_GENERATE` | Gerar simulado |
| `PENDING`/`PROCESSING` | Preparando simulado… |
| `READY` | Começar simulado |
| `IN_PROGRESS` | Continuar simulado |
| `COMPLETED` | Ver resultado |
| `BLOCKED_BY_PREVIOUS` | Continuar simulado anterior |
| `FAILED` | Tentar gerar novamente |

O estado vem da API, não de cálculo local isolado.

## Fase F2 — Geração

1. Desabilitar a ação imediatamente.
2. Chamar geração.
3. Exibir feedback de processamento.
4. Consultar status por polling controlado ou revalidação.
5. Navegar quando estiver `READY`.
6. Mostrar erro recuperável em `FAILED`.

Evitar múltiplas chamadas por re-renderização e respeitar o id retornado.

## Fase F3 — Resolução

A tela:

- mostra `respondidas / total`;
- mostra posição e total;
- permite avançar e voltar;
- persiste cada resposta;
- trata retry sem duplicar;
- indica bloqueio pelo simulado anterior;
- não muda item respondido;
- não exibe correção antes do envio.

Falha de resposta mantém o item pendente e oferece nova tentativa.

## Fase F4 — Resultado

Exibir:

- total, acertos, erros e nota;
- desempenho por matéria e tópico;
- tópicos prioritários;
- aviso de uso no próximo ciclo;
- aviso quando o simulado tiver menos de 30 questões.

## Fase F5 — Responsividade

- Botão compreensível em desktop e mobile.
- Carregamento com texto, não apenas spinner.
- Erros acessíveis.
- Resolução navegável por teclado.
- Layout não presume exatamente 30 itens.

### Aceite de Frontend

- Cada monitor exibe a ação permitida pelo backend.
- O aluno gera, acompanha, inicia, pausa, retoma e conclui.
- Simulado anterior incompleto mostra continuação.
- Resposta correta não aparece antes do envio.
- Fluxo funciona com 30, menos de 30 e nenhum item elegível.
- Reload não perde progresso persistido.

# 6. Estratégia de testes

## Dados

Constraints, migration, relações, preservação de histórico e consultas da janela.

## Backend

Timezone, ciclo, pesos, ausência de dados, distribuição, maiores sobras, redistribuição, prioridade de questões, idempotência, concorrência, retry, autorização e não exposição da resposta.

## Frontend

Estados, botão por monitor, polling, bloqueio, respostas, reload, resultado variável, responsividade e acessibilidade.

# 7. Fora do escopo do MVP

- Questões inéditas por IA.
- Repetição para completar 30.
- Ranking entre simulados.
- Simulados pré-gerados.
- Edição de simulado pronto.
- Simulado mensal separado.
- Plano de estudo avançado por IA.
- Alteração automática da dificuldade sem revisão do professor.

# 8. Dependências e riscos

- Questões aprovadas devem estar associadas a monitor, matéria e tópico.
- Questões sem tópico entram em `Sem tópico`.
- A personalização depende da qualidade da classificação.
- Poucos dados levam à distribuição equilibrada.
- Worker e Redis precisam estar disponíveis; indisponibilidade não pode consumir o ciclo.
