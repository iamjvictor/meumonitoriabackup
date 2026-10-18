# Reclassificação local da taxonomia Gran

**Status:** especificação para implementação
**Base examinada:** 2.790 questões `GRAN` salvas em 2026-10-14

## Objetivo

Recalcular `topic`, `subtopic`, `subsubtopic` e `taxonomyPath` a partir de `rawPayload.assuntos`, preservando o significado da árvore de assuntos do Gran. A execução usa os JSONs já salvos no banco e no cache da coleta, sem nova chamada à API nem reimportação de páginas.

## Diagnóstico confirmado

O adaptador atual cria um mapa de assuntos **por questão**. Ao encontrar `pai` que não esteja no `assuntos` da própria questão, `pathFor` interrompe a subida e promove o assunto restante a tópico. O mesmo ID pode, assim, aparecer em níveis diferentes entre questões.

Na amostra completa salva:

- 2.790/2.790 registros têm `subject = Matemática`.
- Existem 549 nós de assunto distintos por ID, sem conflito observado de `pai` ou `assunto_raiz` para o mesmo ID.
- 2.054 questões omitem ao menos um pai em seu próprio `rawPayload.assuntos`; em 1.976 delas, ao menos um pai omitido aparece em outro registro. Isso **não** significa que todo o caminho dessas 1.976 esteja completo.
- 107 questões têm ao menos um pai que não aparece em nenhum dos registros salvos.
- 655 questões exibem como tópico um assunto cujo `pai` não é uma das quatro raízes selecionadas. Dessas, 629 têm caminho completo reconstruível com o catálogo global; 26 ainda encontram um pai ausente.
- Há 170 tópicos nomeados e 38 registros sem tópico na classificação atual. Esses números são linha de base, não meta final.

### Auditoria integral das inserções e do cache

Uma segunda leitura examinou todos os 2.790 registros do banco e os 3.200 objetos das 32 páginas brutas. O cache acrescenta nós de questões rejeitadas: o catálogo local passa de 549 para **574 IDs**, sem conflitos observados de nome, pai ou raiz. Ainda faltam **42 IDs de pais** nesse catálogo. A API informou `total=3196`, embora as 32 páginas tenham retornado 100 objetos cada, todos com IDs distintos; a divergência de quatro deve constar no relatório de coleta, separada da classificação.

No banco há 2.790 IDs únicos, todos com `rawPayload`, `taxonomyPath` e status `IMPORTED`. Nenhum item `GRAN` foi materializado na tabela `questions` de monitores. As 410 rejeições do importador são **291 por enunciado vazio** e **119 por alternativa sem rótulo ou texto**; os objetos brutos continuam no cache, mas não são alvo do recálculo do acervo.

Entre as questões salvas, **105** apresentam ao menos um ramo cujo pai continua ausente no catálogo completo. Há **395** questões com dois ou mais ramos finais incomparáveis; em **79** esses ramos pertencem a tópicos locais diferentes e em **14** alcançam raízes Gran diferentes. Cinco questões contêm ao menos um assunto de raiz fora das quatro selecionadas. Uma escolha pela maior profundidade ou pela ordem do array pode mudar a matéria específica da questão sem prova de que seja o assunto principal.

Uma simulação conservadora, que exige todos os pais disponíveis e usa apenas o prefixo comum quando há vários ramos do mesmo tópico, separou **2.607 questões classificáveis automaticamente** e **183 pendentes**: 104 por ancestral ausente, 78 por tópicos diferentes e uma pelos dois motivos. Nas 2.607, a proposta mudaria o tópico de 578 e algum campo de classificação de 1.894. Esses números são uma prévia de desenho; o comando final precisa reproduzi-los antes de qualquer gravação.

Exemplos de correção a partir dos IDs e vínculos observados:

| Tópico atual | Caminho coerente |
| --- | --- |
| Cilindro | Matemática > Geometria > Geometria Espacial > Cilindro |
| Poliedros Regulares | Matemática > Geometria > Geometria Espacial > Poliedros Regulares |
| Geometria Analítica | Matemática > Geometria > Geometria Analítica |
| Sistemas Lineares | Matemática > Álgebra Linear > Sistemas Lineares |
| Progressão Geométrica - PG | Matemática > Sequência, progressão aritmética e geométrica > Progressão Geométrica - PG |

Assim, no esquema local de três níveis abaixo da matéria, `Cilindro` fica em `subsubtopic`: `topic=Geometria`, `subtopic=Geometria Espacial`, `subsubtopic=Cilindro`.

## Regras da classificação

1. `subject` permanece `Matemática` em todos os registros deste perfil de importação.
2. As raízes Gran `403794` (Matemática Financeira), `43` (Estatística) e `404257` (Raciocínio Lógico) correspondem a tópicos locais. Seus descendentes ocupam os níveis seguintes segundo a cadeia real de IDs `pai`.
3. Para a raiz Gran `403825` (Matemática), o primeiro filho comprovado é o tópico local; os filhos seguintes tornam-se `subtopic` e `subsubtopic`. Se houver mais níveis, concatenar somente o restante em `subsubtopic` com ` > `, mantendo a cadeia integral em `taxonomyPath`.
4. A ramificação matemática de ID `425054`, também denominada Matemática Financeira, exige uma regra explícita de equivalência com o tópico local Matemática Financeira. Essa equivalência deve ser aplicada por **ID validado**, não por comparação aproximada de nomes; registrar o caminho original para auditoria.
5. Questão que apresenta somente a raiz Matemática pode manter `topic=null`. Isso deve ser distinguido de caminho incompleto por um estado de classificação ou relatório específico.
6. Um nó cujo ancestral ainda não é conhecido não pode ser promovido silenciosamente a tópico. Guardar o último assunto conhecido e os IDs ausentes no relatório; deixar a classificação pendente de revisão ou manter o caminho atual sinalizado, conforme a política de exibição definida na implementação. Nunca apresentar o caminho truncado como completo.
7. Quando o JSON contiver ramos finais diferentes sob o mesmo tópico, usar o **prefixo comum comprovado** para a classificação singular e preservar todos os ramos originais para auditoria. Se os ramos apontarem para tópicos diferentes, enviar a questão para revisão; não escolher pela profundidade, pela ordem do array nem pela prioridade fixa entre raízes. Um assunto estranho ao conjunto selecionado, como o registro de sucessões observado em uma questão de Estatística, não participa da classificação local.
8. Nomes repetidos em ramos distintos são resolvidos por ID e cadeia de pais, nunca pelo nome isolado. `palavrasChave`, cargo, área e texto do enunciado não substituem a taxonomia oficial.

## Catálogo global e resolução

Construir um catálogo local `provider + assunto.id -> nome, pai, assunto_raiz, materia, origem`. Percorrer os `rawPayload.assuntos` de todas as questões salvas e, opcionalmente, os JSONs brutos das 32 páginas já presentes em `backend/.cache/gran-100`. O cache pode conter assuntos de questões rejeitadas, úteis para preencher pais, mas não deve criar questões no banco.

Antes de classificar, identificar e registrar: IDs com nome ou pai conflitante, referências a pais ausentes, ciclos, troca de raiz durante a subida e ramos sem raiz comprovada. Usar apenas relações `pai` que formem uma cadeia válida. O catálogo gerado deve ter versão ou impressão digital para que a classificação possa ser reproduzida.

Os pais ausentes do conjunto local ficam em um relatório de pendências por ID e número de questões afetadas. Sua identificação futura pode usar mapeamento manual documentado e comprovado; a etapa principal não depende de chamar a API.

## Recálculo dos registros

Criar um comando separado, por exemplo `src/scripts/reclassify-gran-taxonomy.ts`, que não exija token Gran. Seu modo padrão é **prévia**: lê os 2.790 registros `GRAN` e as páginas já salvas em `.cache/gran-100`, reconstrói os caminhos e gera relatório antes/depois por questão, totais por tópico, tópicos promovidos corrigidos, caminhos completos, pendências e alterações de nível. A prévia não escreve no banco. Um comando proposto para a implementação é `node --import tsx src/scripts/reclassify-gran-taxonomy.ts --dry-run --cache-dir .cache/gran-100`; ele ainda não existe nesta etapa.

A aplicação deve receber o relatório e a impressão digital do catálogo gerados na prévia, recusando execução se os dados de entrada ou os registros do banco tiverem mudado. As 183 pendências estimadas ficam em arquivo de revisão por `providerQuestionId`, com os IDs dos ramos e pais faltantes. Eventuais decisões manuais devem apontar o ID do assunto principal e o caminho comprovado; não usar apenas um nome livre.

O modo de aplicação deve:

1. Salvar um snapshot local dos campos de classificação e `contentHash` por ID para reversão.
2. Atualizar apenas `topic`, `subtopic`, `subsubtopic`, `taxonomyPath` e `contentHash` dos registros `GRAN` cujo caminho novo foi validado e mudou.
3. Recalcular `contentHash` com a função atual, que inclui `topic`; não modificar enunciado, alternativas, gabarito, dificuldade ou `rawPayload`.
4. Ser retomável e idempotente, registrando versão do catálogo e resultado por registro.
5. Não sobrescrever classificação manual ou cópias já materializadas em monitores sem uma política explícita para esses registros. Levantar quantas cópias existem e como se relacionam ao acervo antes de propagá-las.

Atualmente há **zero cópias materializadas** de itens `GRAN`, portanto a primeira aplicação pode limitar-se a `question_bank_items`. Antes de aplicá-la, repetir essa contagem para detectar mudanças posteriores.

Como o importador já encerrou, o recálculo pode ocorrer sem concorrência com ele. Se houver nova importação no futuro, o adaptador deverá usar o mesmo resolvedor global ou enfileirar reclassificação ao fim; caso contrário, um upsert repetirá o erro antigo.

## Critérios de aceite

- A matéria das questões `GRAN` deste perfil permanece Matemática.
- Os cinco exemplos da tabela acima seguem exatamente as cadeias de IDs observadas; o mesmo assunto não muda de nível conforme os demais nós presentes em uma questão.
- Nenhum assunto com `pai` ausente é tratado como filho direto da matéria ou dos três tópicos equivalentes sem prova dessa relação.
- As três raízes equivalentes permanecem tópicos locais; matemática apenas com raiz continua podendo ficar sem tópico.
- A prévia mostra as 655 promoções identificadas na linha de base e discrimina caminhos reconstruídos, pendentes e casos com múltiplos ramos.
- A prévia confirma ou explica a diferença frente à simulação conservadora: 2.607 classificáveis e 183 pendentes com o cache atual; classifica ramos múltiplos do mesmo tópico apenas até o prefixo comum.
- Após aplicação, um levantamento do banco reproduz contagens por matéria, tópico e subtopic e identifica todos os registros cuja classificação segue pendente.
- O relatório informa separadamente as 410 questões rejeitadas na importação por falta de enunciado; elas não entram no denominador do recálculo até serem recuperadas.
