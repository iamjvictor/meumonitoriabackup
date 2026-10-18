# Importação de questões do Gran Questões

**Status:** implementação solicitada pelo usuário em 2026-10-14; classificação atualizada com os exemplos completos de assuntos
**Data:** 2026-10-14

## Objetivo

Adicionar o Gran Questões como provedor do banco de questões e importar questões por meio do endpoint JSON autorizado, sem extrair conteúdo da página HTML. O primeiro perfil de coleta abrange as 3.196 questões CESGRANRIO filtradas pelos assuntos indicados. O script deverá aceitar outros filtros depois, sem exigir mudança no adaptador ou na persistência.

A questão continuará entrando primeiro em `question_bank_items`. Sua cópia para um monitor seguirá o serviço existente de materialização do acervo.

## Evidência do endpoint

Endpoint usado:

```text
GET https://rota-api.grancursosonline.com.br/v1/elastic/questao
```

Parâmetros observados no navegador:

```text
perPage=20
page=1
marcarResolvidas=1
assunto[]=403825&assunto[]=403794&assunto[]=43&assunto[]=404257
banca[]=26
resolucao=TODAS
anulada=0
desatualizada=0
sort=[{"anos":"desc"},{"_score":"desc"}]
```

A autenticação da chamada validada usou `Authorization: Bearer ...` e `x-client-id`, junto aos cabeçalhos `Accept`, `Origin` e `Referer`. Segredos serão lidos somente de variáveis de ambiente locais; não entram no repositório, nos logs ou na saída do script. Não é necessário persistir cookies de sessão.

Uma chamada real com `perPage=1` retornou `message.slug=OK`, `total=3196`, `page=1` e uma questão com `id=4373725`, `dificuldade=1`. `resposta=17946848` corresponde ao `id` da alternativa rotulada `E`. Outra resposta completa fornecida para validação tem a questão `4373850`, dificuldade `4`, resposta correspondente à alternativa `C` e três imagens no HTML do enunciado.

## Componentes

1. **Cliente Gran:** faz GET com timeout, autenticação por bearer e `x-client-id`, filtros configuráveis e cabeçalhos compatíveis com o navegador. Trata respostas não-2xx, JSON inválido, `message.slug` diferente de `OK` e respostas sem paginação válida como erros explícitos.
2. **Adaptador Gran:** converte uma página em `NormalizedProviderPage`, mantendo cada objeto original em `rawPayload`.
3. **Script de importação:** conecta o cliente/adaptador ao `importQuestionBankPages` e à persistência existente. Oferece `--dry-run`, tamanho de página, limite de páginas e retomada por filtro de assunto e página. O padrão é dry-run; gravar requer opção explícita.
4. **Prática de questões:** disponibiliza o HTML sanitizado do enunciado originado do banco e mantém as imagens nos pontos originais do texto. O campo `imageUrls` continua preenchido para proveniência e compatibilidade com consumidores existentes.

## Filtros e classificação

Os filtros da primeira execução são configuração, não valores embutidos no cliente:

| ID Gran | Classificação local |
| --- | --- |
| `403825` | matéria `Matemática`; sem tópico quando a resposta trouxer somente a matéria |
| `403794` | tópico `Matemática Financeira` |
| `43` | tópico `Estatística` |
| `404257` | tópico `Raciocínio Lógico` |

As quatro categorias pertencem à matéria local `Matemática`. Matemática Financeira, Estatística e Raciocínio Lógico são tópicos; assuntos mais específicos retornados em `assuntos` tornam-se subtópicos, seguindo as relações `pai` presentes na resposta. As linhas que contêm somente o assunto raiz Matemática podem ser importadas com `topic=null`; o contrato e a coluna `question_bank_items.topic` precisam aceitar nulo. O filtro combinado informado pelo usuário retorna `total=3196`; o importador deve preservar o registro completo de `assuntos` em `rawPayload`, contabilizar itens sem tópico e comparar IDs únicos lidos com esse total. Quando uma linha vier com mais de um ramo de tópicos, o adaptador seleciona um caminho principal de forma determinística, e todos os assuntos Gran continuam preservados em `rawPayload`.

Os campos adicionais disponíveis em `bancas`, `provas`, `orgaos`, `cargos`, `anos` e `areas` fornecem banca, nome da prova, instituição, cargo, ano e área. A área consultada informa `subject=Matemática`; `taxonomyPath` representa o tópico e o subtópico Gran disponíveis, sem inventar uma classificação ausente.

`dificuldade` será preservada no `rawPayload` e normalizada com a escala Gran de 1 a 5, usando o mapeamento do produto: `1–2 → EASY`, `3–4 → MEDIUM`, `5 → HARD`. Valores ausentes ou fora dessa faixa ficam sem dificuldade normalizada e aparecem no relatório de rejeições/anomalias. A implementação deve confirmar a faixa completa observando valores da coleta antes de gravar em lote.

## Mapeamento do registro

- `provider`: `GRAN` (adicionar ao enum Zod; a coluna Prisma `provider` já é string, portanto não requer migração por si só).
- `providerQuestionId`: `String(row.id)`, chave de upsert composta com `GRAN`.
- `externalId`: `hashId`, quando presente; guardar `hash` também em `rawPayload`.
- `examType`: `CONCURSO`.
- `examName`, `board`, `institution`, `examYear`: prova mais relevante em `provas[0]`, com fallback nos arrays de banca/órgão/ano.
- `subject`, `topic`, `subtopic`, `taxonomyPath`: matéria e assunto conforme a tabela de classificação acima e `assuntos` do registro; `topic` é nulo se o JSON trouxer somente o assunto raiz.
- `statementHtml`: `enunciado` sanitizado, preservando imagens HTTPS embutidas.
- `statementText`: texto simples derivado do HTML sanitizado.
- `alternatives`: cada `itens[]` vira alternativa; o rótulo é `rotulo.trim()`, o texto é texto simples derivado de `corpo`, e `providerId` recebe `String(item.id)`.
- `correctAnswer`: localizar a alternativa cujo `String(item.id) === String(row.resposta)` e usar seu rótulo normalizado. Se nenhuma ou mais de uma alternativa corresponder, rejeitar o registro sem importá-lo.
- `imageUrls`: URLs HTTP(S) extraídas do HTML sanitizado do enunciado, sem duplicatas.
- `sourceUrl`: `https://questoes.grancursosonline.com.br/questoes-de-concursos/${slug}` quando `slug` for válido; caso contrário, `null`.
- `rawPayload`: objeto integral do Gran sem alterações.
- `sourceFetchedAt`: momento de coleta.
- `explanation`: preencher somente se a resposta JSON realmente trouxer explicação; comentários de aluno/professor e indicadores de disponibilidade não são resoluções.

Questões com `hasImageItens=true` precisam manter as imagens associadas às alternativas. Se o contrato existente não conseguir representá-las fielmente, o adaptador registra e pula essas questões até que o suporte a imagem por alternativa esteja incluído; não deve deslocar imagem de alternativa para o enunciado.

## Paginação, retomada e deduplicação

O cliente usa `data.page`, `data.perPage`, `data.total` e `data.pages`; termina quando chegar à última página ou não houver linhas. Cada assunto filho é coletado com seu filtro próprio para manter a origem da classificação. Resultados de vários filtros são deduplicados por `providerQuestionId`; contagens dos filtros não são somadas como se fossem distintas. A contagem final deve ser comparada com o total combinado mostrado pelo endpoint (3.196 na busca observada).

O script aceita filtro de banca, lista de assuntos, anuladas, desatualizadas, resolução, ordenação, `perPage`, `startPage`, `maxPages` e seleção de filtro para retomar. Cada página imprime progresso sem cabeçalhos, tokens ou dados de sessão. Reexecutar a mesma página é seguro por causa do upsert `(provider, providerQuestionId)`.

Respostas HTTP 401/403 interrompem a execução com erro de autenticação; HTTP 429 respeita `Retry-After` ou aplica backoff limitado. Erros transitórios de rede recebem tentativas limitadas. Respostas rejeitadas por validação são contadas com ID e motivo, sem registrar credenciais nem despejar enunciados em logs.

## Exibição de enunciado e imagens

As imagens do exemplo estão nos elementos `<img src="...">` dentro de `enunciado`; `hasImage` serve somente como sinalizador. A imagem deve ficar inline na posição original do HTML. O importador sanitiza tags e atributos, aceita somente URLs HTTPS de imagem e gera `imageUrls` sem duplicatas. A tela de prática só renderiza HTML armazenado já sanitizado e continua usando texto simples como fallback para questões antigas ou sem HTML. Alternativas com imagem seguem a regra de suporte descrita acima.

## Escopo

Inclui o provedor Gran, cliente autenticado, adaptador, script retomável, configuração dos filtros iniciais, mapeamento de gabarito/dificuldade/taxonomia, preservação de `rawPayload`, tópico opcional no contrato do acervo e suporte a imagem inline no enunciado.

Não inclui executar a carga integral de 3.196 questões como parte da implementação inicial, materializar a questão em monitor, importar comentários, baixar/espelhar arquivos de imagem, inferir resoluções que não venham no JSON ou alterar filtros da interface de prática. O script resultante permitirá executar a carga integral explicitamente.

## Critérios de aceite

1. A chamada de uma página autenticada retorna e valida a estrutura `data.rows` sem persistência por padrão.
2. O dry-run da questão `4373725` identifica a alternativa E pelo vínculo entre `resposta` e `itens[].id`.
3. O fixture da questão `4373850` identifica a alternativa C, extrai três URLs de imagem do enunciado e mantém as imagens inline no HTML sanitizado.
4. `GRAN` é aceito pelo schema e por `QuestionBankRepository`; nenhum segredo está no código, nos logs ou no Git.
5. Matemática Financeira, Estatística e Raciocínio Lógico são tópicos de Matemática; assuntos mais específicos viram subtópicos. Registros que contenham somente Matemática podem ter `topic=null`.
6. O mapeamento numérico de dificuldade segue 1–2 Fácil, 3–4 Média, 5 Difícil; valores fora da faixa são sinalizados.
7. Uma página pode ser retomada e reexecutada sem duplicar `QuestionBankItem`.
8. A importação compara total único deduplicado com o total combinado da consulta e relata divergências.
9. Uma resposta inválida ou uma associação ambígua de gabarito/subtópico é rejeitada ou sinalizada, nunca gravada silenciosamente com dados inferidos.
10. A imagem não é exibida fora de contexto nem deslocada de uma alternativa para o enunciado.
