# Gran Questões

O importador usa somente o endpoint JSON `/v1/elastic/questao`, com os filtros CESGRANRIO de Matemática, Matemática Financeira, Estatística e Raciocínio Lógico. A resposta completa de cada linha é preservada em `rawPayload`.

O script não carrega nem grava credenciais em arquivos do backend. Passe `GRAN_API_TOKEN` e `GRAN_CLIENT_ID` no ambiente do processo ao executá-lo. Não coloque o bearer token no código nem nos logs; use um token renovado se o anterior foi compartilhado nesta conversa.

Execute sempre a prévia primeiro:

```bash
GRAN_API_TOKEN="$GRAN_API_TOKEN" GRAN_CLIENT_ID="$GRAN_CLIENT_ID" npm run import:gran -- --dry-run --max-pages=1
```

Ela não grava no banco. A execução completa também é somente prévia por padrão:

```bash
GRAN_API_TOKEN="$GRAN_API_TOKEN" GRAN_CLIENT_ID="$GRAN_CLIENT_ID" npm run import:gran
```

Para gravar, a migração `202610140001_allow_optional_question_bank_topic` precisa estar aplicada e a opção explícita é obrigatória:

```bash
GRAN_API_TOKEN="$GRAN_API_TOKEN" GRAN_CLIENT_ID="$GRAN_CLIENT_ID" npm run import:gran -- --persist
```

O importador usa páginas de 20 por padrão e aceita `--page-size`, `--start-page`, `--max-pages` e `--timeout-ms`. No resumo, `expectedTotal` vem da API; `uniqueRowsRead` permite conferir os 3.196 resultados; `rootOnlyQuestions` não têm assunto mais específico e ficam com `topic: null`; `classifiedTopics` conta os tópicos associados. Questões com alternativas ilustradas, gabarito ambíguo ou conteúdo inválido são reportadas e ignoradas.

Matéria local: `Matemática`. Os IDs `403794`, `43` e `404257` identificam Matemática Financeira, Estatística e Raciocínio Lógico como tópicos. Os assuntos descendentes informados no JSON viram subtópicos, seguindo `pai`; quando só a matéria aparece, o tópico fica nulo. A questão mantém todas as classificações Gran no `rawPayload` integral.
