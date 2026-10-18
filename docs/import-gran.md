# Importar questões do Gran

Na raiz do projeto, execute:

```bash
./scripts/import-gran.sh
```

O script solicita o `Authorization` completo e o `x-client-id` da requisição do navegador. Cole os valores diretamente: o token não aparece no terminal e não é salvo em arquivos. O conteúdo e o vencimento declarado do JWT são conferidos antes da chamada; a API valida sua assinatura.

A configuração atual busca CESGRANRIO e as quatro categorias selecionadas, com 100 questões por página e cinco minutos entre chamadas. O total esperado é 3.196: 32 páginas, cerca de 2h35 de intervalos, além do tempo de download e gravação. As questões são gravadas no acervo `question_bank_items` com matéria Matemática. Estatística, Matemática Financeira e Raciocínio Lógico são tópicos; assuntos específicos são subtópicos. Matemática sem assunto específico pode ter tópico nulo.

O HTML do enunciado e das alternativas, URLs das imagens e JSON original são preservados. A importação não baixa os arquivos de imagem nem muda os renderizadores da aplicação.

O terminal mostra cada chamada, status HTTP, espera e página gravada. `backend/.cache/gran-100/` guarda páginas, relatório e falhas, sem credenciais e fora do Git. Se interromper, rode o mesmo comando: páginas baixadas são reutilizadas e os registros são atualizados por provedor + ID, sem duplicação. Não execute duas cópias simultâneas; o lançador impede isso.

O relatório só marca `complete: true` depois de conferir os 3.196 IDs distintos, ausência de falhas de normalização e presença desses IDs no banco. Falha no banco interrompe a execução; o cache permite retomada. Se a API informar um total diferente, o script para e solicita revisão. Depois de conferir os filtros, use `--expected-total NOVO_TOTAL` e outro `GRAN_CACHE_DIR`.

Para uma execução limitada que grava somente a primeira página:

```bash
./scripts/import-gran.sh --max-pages 1
```

Para apenas validar, sem gravar, forneça as duas variáveis no ambiente e execute no diretório `backend`:

```bash
npm run import:gran -- --dry-run --max-pages 1
```

O script não anuncia uma importação completa quando há itens inválidos ou IDs faltantes. Confira `report.json` e `failures.json`. O cache contém o JSON integral para corrigir a conversão e repetir sem baixar as páginas novamente.

## Prévia da reclassificação

Após a coleta, execute no diretório `backend`:

```bash
npm run preview:gran-taxonomy
```

O comando lê `rawPayload` dos itens `GRAN` e as páginas locais em `.cache/gran-100`. Não usa token, não chama a API e não altera o banco. É possível indicar outro cache com `--cache-dir CAMINHO` e outra pasta de saída com `--output-dir CAMINHO`.

Os arquivos em `.cache/gran-100/reclassification-preview/` são:

- `summary.json`: totais, contagens atuais e projetadas por tópico e IDs de pais ausentes.
- `topic-counts.csv`: comparação por tópico.
- `projected-subtopic-counts.csv`: contagem projetada por tópico e subtópico.
- `changes.json`: classificação atual e proposta de cada item que mudaria.
- `pending.json`: itens que exigem revisão por ancestral ausente ou ramos de tópicos diferentes.

Se uma questão possuir vários ramos do mesmo tópico, a prévia conserva apenas o prefixo comum comprovado. Para questões pendentes, o script pode corrigir a hierarquia do ramo que o importador já havia escolhido, desde que o próprio assunto e todos os seus ancestrais estejam no cache. A questão continua em `pending.json` para revisão da escolha entre ramos; `anchoredProposal` mostra a correção de hierarquia. Há também uma regra local restrita aos descendentes dos pais ausentes `408601` e `408638`: os assuntos de conjuntos ficam sob o topic `Conjuntos`, preservando os níveis conhecidos entre o assunto e esse pai. `curatedConjuntosProposal` identifica esses casos; os pais ausentes continuam sinalizados.

Para aplicar somente as mudanças validadas, execute `npm run apply:gran-taxonomy`. Esse modo salva um snapshot dos campos anteriores antes de gravar, usa `updatedAt` e `contentHash` para detectar alterações concorrentes e confere cada registro alterado ao final. O resultado fica em `apply-report.json`. Em 2026-10-14, as aplicações alteraram 1.894 registros por caminhos completos, 51 pela hierarquia comprovada do ramo já escolhido e 12 pela regra local de `Conjuntos`. As 183 questões com dados de origem incompletos ou ramos diferentes continuam listadas para revisão, inclusive as que tiveram apenas a hierarquia corrigida.

Na coleta de 2026-10-14, o cache tem 3.200 IDs distintos embora a API indique `total=3196`. O banco recebeu 2.790 questões; 291 objetos foram rejeitados por enunciado vazio e 119 por alternativa sem rótulo ou texto. A prévia de classificação abrange somente as 2.790 questões salvas.
