# Desafio diário por monitor — Spec e TDD

**Data:** 2026-09-03  
**Status:** Proposta para implementação  
**Escopo:** geração diária, resposta do aluno, desempenho e ranking mensal

## 1. Objetivo

Criar um desafio diário para cada monitor publicado, usando uma única questão aprovada e ainda não utilizada anteriormente como desafio naquele monitor.

O desafio será o mesmo para todos os alunos com acesso ao monitor. Cada aluno terá sua própria resposta, que também será registrada como uma tentativa normal de questão para alimentar o desempenho individual.

O ranking será específico por monitor e considerará exclusivamente respostas registradas em desafios diários.

## 2. Decisões de produto

- Existe no máximo um desafio por monitor em cada dia.
- A geração ocorre todos os dias às `00:00`, no fuso `America/Sao_Paulo`.
- O desafio permanece disponível até `23:59:59` da mesma data local.
- A questão é escolhida aleatoriamente.
- A questão pode pertencer a qualquer categoria ou tópico do monitor.
- Somente questões com `status = APPROVED` podem ser selecionadas.
- Uma questão não pode ser usada novamente como desafio naquele monitor.
- A questão é compartilhada entre todos os alunos do monitor.
- Cada aluno pode responder uma única vez ao desafio.
- A resposta do aluno também cria uma tentativa em `student_question_attempts`.
- O ranking usa somente `daily_challenge_attempts` com resposta correta.
- Respostas de prática normal, simulados e flashcards não geram pontos no ranking.
- Se não houver questões elegíveis, o sistema não repetirá uma questão e registrará a ausência de desafio.

## 3. Estado atual e integração

O banco já possui as entidades de conteúdo e acesso necessárias:

- `questions`: banco de questões do professor, monitor, assunto e tópico.
- `students`: identidade do aluno.
- `student_enrollments`: autorização do aluno para acessar um monitor.
- `billing_subscriptions` e `billing_subscription_items`: assinatura agregada e seus monitores.
- `student_subscriptions`: projeção legada de compatibilidade.

A tela de prática em `frontend/src/app/(student-app)/areadoaluno/pratica/page.tsx` ainda contém dados mockados. Esta feature deverá substituir os mocks por chamadas ao backend, mas a camada de persistência e as regras de negócio devem ser implementadas primeiro.

## 4. Modelo de dados

### 4.1 `daily_challenges`

Representa a questão diária escolhida para um monitor.

Campos sugeridos:

| Campo | Regra |
|---|---|
| `id` | UUID primário |
| `monitor_id` | Monitor do desafio |
| `question_id` | Questão aprovada selecionada |
| `challenge_date` | Data local em `America/Sao_Paulo` |
| `available_from` | Início do dia local |
| `available_until` | Fim do dia local |
| `selection_strategy` | Deve registrar `RANDOM_UNUSED_APPROVED` |
| `created_at` | Auditoria |
| `updated_at` | Auditoria |

Restrições obrigatórias:

```text
UNIQUE (monitor_id, challenge_date)
UNIQUE (monitor_id, question_id)
```

A primeira garante idempotência diária. A segunda impede que a mesma questão volte a ser desafio no mesmo monitor.

Índices:

```text
(monitor_id, challenge_date)
(monitor_id, question_id)
(challenge_date)
```

Relacionamentos:

- `daily_challenges.monitor_id -> monitors.id` com remoção em cascata conforme a política atual de monitores.
- `daily_challenges.question_id -> questions.id` com `RESTRICT`, preservando a referência histórica do desafio.

### 4.2 `student_question_attempts`

Registro imutável de cada resposta do aluno. Deve ser a fonte de desempenho.

Campos mínimos:

| Campo | Regra |
|---|---|
| `id` | UUID primário |
| `student_id` | Aluno autenticado |
| `question_id` | Questão respondida |
| `monitor_id` | Monitor no contexto da resposta |
| `daily_challenge_id` | Preenchido quando `mode = DAILY_CHALLENGE` |
| `mode` | `PRACTICE`, `DAILY_CHALLENGE` ou `SIMULATED` |
| `selected_answer` | Alternativa ou resposta enviada |
| `is_correct` | Resultado calculado pelo backend |
| `response_time_ms` | Opcional, não confiado do cliente |
| `answered_at` | Horário do servidor |
| `metadata` | Dados auxiliares sem informação sensível desnecessária |

O backend deve copiar categoria e tópico da questão no momento da resposta, se a arquitetura de desempenho exigir consultas históricas estáveis. O cliente nunca poderá informar `is_correct`, `monitor_id` ou o aluno para alterar o resultado.

### 4.3 `daily_challenge_attempts`

Registro específico da participação do aluno no desafio e fonte do ranking.

Campos mínimos:

| Campo | Regra |
|---|---|
| `id` | UUID primário |
| `daily_challenge_id` | Desafio respondido |
| `student_id` | Aluno autenticado |
| `question_attempt_id` | Tentativa correspondente em `student_question_attempts` |
| `is_correct` | Mesmo resultado da tentativa |
| `answered_at` | Horário do servidor |
| `created_at` | Auditoria |

Restrição obrigatória:

```text
UNIQUE (daily_challenge_id, student_id)
```

O campo `question_attempt_id` deve ser único para evitar que duas participações apontem para a mesma tentativa.

Índices:

```text
(daily_challenge_id, student_id)
(student_id, answered_at)
(monitor_id, answered_at) -- diretamente ou via daily_challenges
```

## 5. Geração do desafio

### 5.1 Job agendado

O worker deverá executar a geração na virada de cada dia:

```text
00:00 America/Sao_Paulo
```

O agendamento deve usar uma chave lógica por data local, por exemplo:

```text
daily-challenge-generation:2026-09-04
```

O job pode ser reexecutado com segurança. A criação deve usar transação e tratar a restrição única como resultado idempotente, não como falha funcional.

### 5.2 Monitores elegíveis

Selecionar somente monitores que:

- estejam publicados/ativos;
- tenham questões aprovadas;
- estejam dentro do escopo atual da plataforma.

Não gerar desafio para monitores desabilitados ou sem questões elegíveis.

### 5.3 Seleção aleatória

Para cada monitor:

1. buscar questões vinculadas ao monitor;
2. filtrar `status = APPROVED`;
3. excluir questões presentes em `daily_challenges` daquele monitor;
4. escolher uma questão aleatoriamente;
5. persistir o desafio com a data local;
6. registrar o resultado nos logs.

Não haverá prioridade por categoria, tópico, frequência, acerto anterior ou dificuldade. A aleatoriedade será uniforme dentro do conjunto elegível.

### 5.4 Banco esgotado

Se todas as questões aprovadas do monitor já tiverem sido usadas como desafio:

- não repetir questão;
- não criar um desafio falso;
- registrar `NO_ELIGIBLE_QUESTION`;
- emitir métrica/log de monitoramento;
- permitir que o próximo ciclo tente novamente caso novas questões sejam aprovadas.

## 6. Acesso e resposta

### 6.1 Consulta do desafio atual

Endpoint sugerido:

```http
GET /api/v1/student/monitors/:monitorId/daily-challenge
```

Validações:

- sessão autenticada;
- aluno resolvido no backend;
- enrollment ativo para o monitor;
- desafio existente para a data local;
- desafio ainda dentro de `available_from` e `available_until`.

O endpoint não deve retornar a resposta correta antes da submissão.

Resposta deve incluir:

- id do desafio;
- questão e alternativas;
- monitor;
- data do desafio;
- horário de expiração;
- estado do aluno: `NOT_ANSWERED` ou `ANSWERED`;
- resultado somente quando já respondido.

### 6.2 Resposta do desafio

Endpoint sugerido:

```http
POST /api/v1/student/daily-challenges/:challengeId/answer
```

Payload mínimo:

```json
{
  "selectedAnswer": "B",
  "responseTimeMs": 42000
}
```

O backend deve:

1. validar a sessão;
2. validar enrollment ativo;
3. buscar o desafio e a questão relacionada;
4. validar que o desafio pertence ao dia atual;
5. verificar se o aluno já respondeu;
6. calcular o acerto usando a questão persistida;
7. criar `student_question_attempts` com `mode = DAILY_CHALLENGE`;
8. criar `daily_challenge_attempts` na mesma transação;
9. atualizar a projeção de desempenho, se existir;
10. retornar resultado, explicação e estado final.

Uma segunda submissão deve retornar estado idempotente ou conflito de domínio, sem criar outra tentativa nem alterar a primeira resposta. A implementação deve escolher um único contrato HTTP e documentá-lo nos testes; a recomendação é retornar a resposta já registrada com `200` e indicar `alreadyAnswered: true`.

## 7. Desempenho e ranking

### 7.1 Desempenho

Toda resposta do desafio entra no histórico geral como uma questão respondida. Portanto, ela participa de:

- total de questões respondidas;
- percentual de acerto;
- desempenho por monitor;
- desempenho por categoria;
- desempenho por tópico;
- seleção de questões para prática e simulados.

O modo da tentativa deve permanecer disponível para filtros e análises.

### 7.2 Ranking mensal

O ranking deve consultar exclusivamente `daily_challenge_attempts` e juntar `daily_challenges` para obter o monitor e a data:

```text
WHERE is_correct = true
  AND monitor_id = :monitorId
  AND answered_at >= :monthStart
  AND answered_at < :nextMonthStart
```

Pontuação inicial:

```text
1 resposta correta = 1 ponto
```

Respostas erradas contam para participação e desempenho, mas não para pontuação.

O ranking deve ser isolado por monitor. Uma pontuação obtida em um monitor nunca pode aparecer no ranking de outro.

## 8. Logs e observabilidade

Os eventos devem deixar clara a sequência e os identificadores envolvidos.

### Geração

```text
monitor.daily_challenge_generation_started
monitor.daily_challenge_monitors_loaded
monitor.daily_challenge_selection_started
monitor.daily_challenge_created
monitor.daily_challenge_already_exists
monitor.daily_challenge_no_eligible_question
monitor.daily_challenge_generation_completed
monitor.daily_challenge_generation_failed
```

Campos recomendados:

- `challengeDate`;
- `timezone`;
- `monitorId`;
- `questionId`, quando houver;
- `selectionStrategy`;
- `eligibleQuestionCount`;
- `jobKey`;
- `durationMs`;
- `errorCode`.

### Consulta e resposta

```text
monitor.daily_challenge_http_get_started
monitor.daily_challenge_access_validated
monitor.daily_challenge_loaded
monitor.daily_challenge_already_answered
monitor.daily_challenge_http_answer_started
monitor.daily_challenge_answer_validated
monitor.daily_challenge_question_attempt_created
monitor.daily_challenge_attempt_created
monitor.daily_challenge_performance_updated
monitor.daily_challenge_http_answer_completed
monitor.daily_challenge_http_failed
```

Nunca registrar alternativa, resposta correta, token ou payload sensível em texto aberto nos logs de produção.

## 9. TDD e critérios de aceite

### 9.1 Testes de domínio/seleção

1. Seleciona somente questões `APPROVED`.
2. Exclui questões já usadas em `daily_challenges` para o monitor.
3. Permite questões de qualquer categoria e tópico do monitor.
4. Escolhe aleatoriamente dentro do conjunto elegível.
5. Retorna ausência quando não existem questões elegíveis.
6. Não seleciona questão de outro monitor.
7. Reexecução do job não cria segundo desafio para o mesmo monitor/data.
8. Reexecução não permite reutilizar a mesma questão no monitor.
9. Usa a data local de São Paulo, inclusive na virada do UTC.

### 9.2 Testes de repositório

1. Persiste desafio e suas restrições únicas.
2. Recupera desafio por monitor e data.
3. Recupera conjunto de questões já usadas por monitor.
4. Persiste tentativa e participação na mesma transação.
5. Rejeita segunda participação do mesmo aluno no mesmo desafio.
6. Mantém a questão histórica quando uma questão é arquivada.

### 9.3 Testes de serviço

1. Bloqueia aluno sem enrollment ativo.
2. Não revela `correctAnswer` na consulta inicial.
3. Calcula o resultado a partir da questão do banco.
4. Cria exatamente uma tentativa geral com `mode = DAILY_CHALLENGE`.
5. Cria exatamente uma participação no desafio.
6. Segunda resposta retorna o resultado já persistido sem duplicar registros.
7. Resposta após `available_until` é rejeitada.
8. Resposta de aluno de outro monitor é rejeitada.
9. Falha intermediária faz rollback das duas gravações.

### 9.4 Testes de ranking

1. Conta apenas `is_correct = true`.
2. Filtra pelo monitor correto.
3. Filtra pelo mês correto em horário de São Paulo.
4. Ignora tentativas `PRACTICE` e `SIMULATED`.
5. Inclui aluno que respondeu e errou com pontuação zero.
6. Não mistura alunos ou desafios de monitores diferentes.

### 9.5 Testes de integração HTTP

1. `GET` sem sessão retorna `401`.
2. `GET` sem enrollment retorna `403` ou o código de acesso adotado pelo backend.
3. `GET` retorna o desafio ativo sem gabarito.
4. `POST` válido persiste as duas entidades.
5. `POST` repetido é idempotente.
6. `POST` expirado retorna erro de domínio.
7. `POST` com questão inexistente ou desafio inconsistente não altera o banco.

## 10. Critérios de aceite funcional

- À meia-noite de São Paulo, cada monitor publicado com questões elegíveis recebe uma questão diária.
- Todos os alunos do monitor veem a mesma questão naquele dia.
- Nenhuma questão aprovada é reutilizada como desafio naquele monitor.
- O aluno consegue responder somente uma vez.
- A resposta aparece no histórico normal de questões respondidas.
- O desempenho por categoria e tópico recebe a resposta do desafio.
- O ranking mensal conta somente acertos de desafios daquele monitor.
- Uma falha ou reexecução do job não cria duplicidade.
- A ausência de questões elegíveis é observável e não causa repetição silenciosa.

## 11. Fora do escopo desta implementação

- Streak e cálculo de constância.
- Pontuação por tempo de resposta.
- Desempate avançado do ranking.
- XP, níveis ou recompensas.
- Seleção personalizada por aluno.
- Repetição de questões após esgotamento do banco.
- Geração de questões por IA.
- Revisão espaçada de flashcards.
- Notificações por e-mail ou push.

Esses recursos poderão consumir os eventos e tentativas criados nesta implementação, mas não devem alterar a regra do desafio diário.

## 12. Ordem recomendada de implementação

1. Migration e modelos Prisma.
2. Repositórios para desafios e tentativas.
3. Serviço de seleção idempotente.
4. Scheduler do worker em `America/Sao_Paulo`.
5. Serviço de consulta e resposta.
6. Rotas e autenticação/enrollment.
7. Endpoint de ranking mensal.
8. Substituição dos mocks da prática no frontend.
9. Testes unitários, de repositório e integração.
10. Logs estruturados e validação manual do fluxo completo.
