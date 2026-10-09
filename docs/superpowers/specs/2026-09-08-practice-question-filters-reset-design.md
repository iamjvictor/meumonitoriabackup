# Prática de Questões: indicadores de filtro e reset sem perda de histórico

## Objetivo

Permitir que o aluno continue praticando depois de responder todo o banco de questões, sem apagar o histórico de respostas, acertos ou erros.

A tela de prática também deve apresentar um resumo do desempenho correspondente ao recorte selecionado pelos filtros.

## Escopo funcional

### Indicadores do filtro selecionado

Na área de filtros da prática, exibir indicadores do recorte atual de monitor, matéria e tópico:

- total de questões;
- questões respondidas;
- questões pendentes;
- acertos;
- precisão.

Os indicadores devem atualizar quando o aluno alterar monitor, matéria, tópico ou status. O status selecionado continua controlando a lista exibida, enquanto os indicadores representam o recorte completo de conteúdo selecionado.

Quando não houver questões no recorte, os indicadores devem exibir zero sem apresentar valores fictícios.

### Filtros de questões

Manter os filtros:

- Todos os monitores;
- Todas as matérias;
- Todos os tópicos;
- Não respondidas;
- Todas;
- Respondidas.

O filtro “Respondidas” deve continuar permitindo revisão do gabarito e da resolução comentada.

### Reset ilimitado

O aluno poderá resetar quantas vezes quiser o recorte selecionado. O reset deve ser apresentado como uma nova oportunidade de prática, sem excluir dados.

O botão pode ser chamado de “Resetar questões” ou “Começar nova rodada”, desde que a confirmação explique que o histórico será preservado.

Ao resetar:

1. as tentativas atuais do recorte passam para `ARCHIVED`;
2. as questões deixam de aparecer como respondidas na lista padrão;
3. as questões voltam para o filtro “Não respondidas”;
4. a próxima resposta cria um novo registro de tentativa com status `ACTIVE`;
5. nenhuma linha de `student_question_attempts` é excluída;
6. o reset pode ser repetido indefinidamente.

O reset deve respeitar o escopo informado: monitor, matéria e tópico. Um reset de um tópico não pode arquivar tentativas de outros tópicos.

## Modelo de dados

Adicionar um status às tentativas de prática:

```text
StudentQuestionAttempt.status
- ACTIVE
- ARCHIVED
```

As tentativas existentes devem ser migradas para `ACTIVE`.

Uma mesma questão poderá possuir várias tentativas:

```text
Questão 10
- tentativa 1: resposta B, isCorrect=false, ARCHIVED
- tentativa 2: resposta A, isCorrect=true, ACTIVE
```

O campo `isCorrect` deve ser calculado no momento do envio comparando a resposta selecionada com o gabarito vigente e persistido na tentativa. O histórico não deve ser recalculado ou perdido quando uma nova tentativa for criada.

## API

### Questões

`GET /api/v1/student/questions` deve retornar, por questão, somente a tentativa `ACTIVE` mais recente para o uso da lista de prática.

As tentativas arquivadas continuam disponíveis para agregações de desempenho, mas não devem marcar a questão como respondida no filtro padrão.

### Resposta

`POST /api/v1/student/questions/attempts` continua criando uma nova tentativa. O endpoint deve:

- validar acesso do aluno à questão;
- calcular `isCorrect`;
- criar a tentativa como `ACTIVE`;
- preservar todas as tentativas anteriores;
- manter a idempotência por `idempotencyKey`.

### Reset

Adicionar:

```http
POST /api/v1/student/questions/reset
```

Payload:

```json
{
  "monitorId": "uuid-opcional",
  "subjectId": "uuid-opcional",
  "topicId": "uuid-opcional"
}
```

O endpoint deve arquivar somente tentativas `ACTIVE` pertencentes ao aluno e ao escopo informado. A operação deve ser segura para repetição e retornar a quantidade de tentativas arquivadas.

O backend deve validar novamente o acesso do aluno aos filtros recebidos; não deve confiar apenas nos identificadores enviados pelo frontend.

## Desempenho e histórico

Por enquanto, utilizar uma única visão de desempenho histórico:

- respondidas: total de tentativas persistidas;
- acertos: total de tentativas com `isCorrect=true`;
- erros: total de tentativas com `isCorrect=false`;
- precisão: acertos divididos pelo total de tentativas.

O reset não altera nenhuma dessas métricas, pois apenas muda o status da tentativa de `ACTIVE` para `ARCHIVED`.

Não implementar, nesta etapa, métricas separadas de “precisão atual” e “precisão histórica”.

As respostas do desafio diário e seu ranking permanecem independentes do reset da prática.

## Estados da interface

- carregando: indicadores e lista exibem skeleton/loading;
- carregado: indicadores mostram os valores reais do recorte;
- sem pendentes: exibir mensagem de conclusão e ação “Começar nova rodada”;
- confirmando reset: explicar que o histórico será mantido;
- reset concluído: atualizar filtros, contadores e lista sem recarregar a página inteira;
- erro: informar que o reset não foi concluído e manter a lista atual.

## Critérios de aceite

1. O aluno vê total, respondidas, pendentes, acertos e precisão do recorte selecionado.
2. Ao responder uma questão, uma tentativa `ACTIVE` é criada com `isCorrect` persistido.
3. Ao resetar, nenhuma tentativa é excluída.
4. Depois do reset, as questões aparecem novamente como pendentes.
5. Uma segunda resposta à mesma questão cria uma segunda tentativa.
6. O desempenho histórico inclui as tentativas antigas e novas.
7. O aluno pode resetar o mesmo recorte várias vezes.
8. O filtro “Respondidas” continua exibindo o gabarito das tentativas ativas.
9. O reset de um escopo não afeta outros monitores, matérias ou tópicos.
10. Respostas e ranking do desafio diário não são alterados.

## Testes necessários

- serviço calcula e persiste `isCorrect` em tentativas distintas;
- reset arquiva somente tentativas ativas do escopo autorizado;
- reset repetido não exclui nem duplica tentativas;
- listagem ignora tentativas arquivadas para o filtro de respondidas;
- desempenho histórico soma tentativas ativas e arquivadas;
- frontend exibe os cinco indicadores e atualiza após reset;
- frontend retorna a questão para “Não respondidas” após reset;
- falha no reset preserva o estado anterior da tela.
