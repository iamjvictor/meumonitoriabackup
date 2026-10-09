# Materialização do acervo de questões por monitor

## Objetivo

Ao criar um monitor, o backend deve receber as matérias e tópicos próprios do professor e, opcionalmente, os caminhos taxonômicos selecionados no acervo. Quando houver seleção do acervo, deve criar cópias locais das questões correspondentes em `questions`. A tabela `questions` continua sendo a fonte oficial usada por prática, tentativas, desafios, simulados, chat e relatórios.

As cópias devem conservar a rastreabilidade do item global de `question_bank_items`, incluindo os metadados necessários para consultar `subtopic` e `subsubtopic`, sem fazer os consumidores existentes dependerem diretamente do banco global.

O professor pode criar um monitor somente com conteúdo próprio, somente com conteúdo do acervo ou com os dois. A utilização do acervo nunca é obrigatória.

A seleção do acervo durante a criação tem uma responsabilidade específica: importar questões de `question_bank_items` para `questions`. Ela não substitui nem altera o fluxo posterior de upload de documentos, materiais e bases de conhecimento do professor. Depois que o monitor for criado, o professor continua usando o workspace normalmente para subir suas bases de conhecimento e questões próprias.

## Limites desta fase

Esta fase cobre o contrato de seleção, a persistência das seleções durante a criação do monitor e o serviço idempotente de cópia. O modal ainda poderá ser conectado em uma fase seguinte, mas o backend já terá o contrato definitivo.

Não serão alteradas as relações de tentativas, desafios, simulados ou relatórios. Não haverá atualização automática de cópias quando o item global mudar.

O upload posterior de documentos permanece separado da materialização do acervo. Documentos de conhecimento continuam sendo persistidos e processados pelo pipeline existente; questões extraídas desses documentos continuam sendo questões próprias, com `questionBankItemId = NULL`.

## Modelo de dados

`Question` receberá `questionBankItemId` nullable, com FK para `QuestionBankItem` e `ON DELETE RESTRICT`. Questões extraídas de documentos ou criadas manualmente permanecerão com esse campo nulo.

`MonitorQuestionBankSelection` representará o caminho selecionado para cada `MonitorTopic`:

- `examType` obrigatório;
- `board` opcional;
- `subtopic` opcional;
- `subsubtopic` opcional;
- `selectionKey` determinística e única por tópico local.

Uma seleção com `subtopic` e `subsubtopic` nulos representa o tópico inteiro; com apenas `subtopic` preenchido representa o subtópico inteiro; com ambos preenchidos representa o subsubtópico.

## Contrato do backend

O payload de criação do monitor continuará contendo `subjects` e `topics`, acrescido opcionalmente de seleções vinculadas ao caminho taxonômico do catálogo. A entrada deve usar valores estáveis do acervo, não IDs visuais gerados pelo frontend:

```ts
type QuestionBankSelectionInput = {
  subject: string;
  topic: string;
  examType: string;
  board?: string | null;
  subtopic?: string | null;
  subsubtopic?: string | null;
};
```

O backend normalizará caixa e espaços, validará que cada seleção do acervo pertence à matéria/tópico local correspondente e persistirá a seleção apontando para o `MonitorTopic` criado na mesma transação. Um payload sem seleções do acervo é válido e não cria linhas em `monitor_question_bank_selections`.

## Serviço de materialização

Após a criação do monitor e, quando existirem, das seleções do acervo, um serviço de backend localizará os itens válidos de `question_bank_items` pelo perfil e caminho selecionados. Para cada item, fará `upsert` em `questions` usando uma chave determinística por monitor e item global:

```text
question-bank:{monitorId}:{questionBankItemId}
```

O mapeamento será:

- `teacherId`, `monitorId`, `subjectId` e `topicId`: contexto local;
- `questionBankItemId`: item global original;
- `statementText`: `text`;
- `alternatives`, `correctAnswer`, `difficulty` e `explanation`: cópia local;
- `kind`: `MULTIPLE_CHOICE`;
- origens de conteúdo/resposta/explicação: `EXTERNAL_SOURCE`;
- `status`: `APPROVED` somente para itens válidos e publicados pelo acervo;
- `completenessStatus`: completo somente com alternativas válidas e gabarito compatível;
- `textHash`: hash determinístico do conteúdo copiado;
- `metadata`: snapshot de HTML, imagens, provedor, prova, banca, ano, subtópico, subsubtópico, URL e demais metadados necessários à auditoria.

O serviço deve deduplicar um item selecionado por mais de um caminho no mesmo monitor. O mesmo item poderá ser copiado para monitores diferentes, gerando IDs locais diferentes.

## Transação e idempotência

A criação do monitor, matérias, tópicos e seleções será transacional. A materialização será idempotente: retries devem reutilizar a mesma `sourceKey` e nunca criar duas cópias do mesmo item no mesmo monitor. Quando não houver seleções do acervo, a etapa de materialização é ignorada e o monitor próprio continua válido.

Nesta primeira fase, o serviço poderá ser chamado de forma síncrona após a criação transacional, desde que o monitor permaneça `DRAFT` em caso de erro. A execução assíncrona com progresso, retry parcial e estados de job fica prevista para a fase seguinte, caso o volume do acervo exija isso.

Falhas de validação de seleção ou item inválido não devem criar uma questão `APPROVED`. O erro deve ser retornado de forma explícita para impedir uma publicação inconsistente.

## Compatibilidade

- `Question.id` continua sendo a identidade usada pelos fluxos atuais.
- Questões manuais e documentais não sofrem alteração comportamental.
- O fluxo posterior de upload de bases de conhecimento continua independente da importação do acervo.
- Monitores antigos continuam funcionando sem seleções.
- A exclusão física de um item global referenciado por uma cópia deve ser impedida pela FK; o acervo deve ser arquivado.

## Critérios de aceite da fase

1. O backend aceita o novo payload sem perder o contrato atual de matérias e tópicos.
2. Uma seleção válida gera uma seleção persistida para o tópico local correto.
3. Cada item correspondente gera uma única cópia em `questions` com `questionBankItemId` preenchido.
4. A cópia preserva subtópico e subsubtópico no vínculo e no snapshot.
5. Reexecutar o serviço não duplica questões.
6. O mesmo item pode ser materializado em dois monitores distintos.
7. Uma questão manual/documental continua com `questionBankItemId = NULL`.
8. Erros não deixam questões parcialmente aprovadas nem permitem publicar o monitor.
9. Um monitor somente com matérias/tópicos próprios é criado com sucesso sem nenhuma seleção do acervo.
10. Um monitor misto preserva conteúdo próprio e conteúdo do acervo no mesmo monitor.
