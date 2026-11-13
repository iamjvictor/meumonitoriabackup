# Consistência de acesso por webhook

## Objetivo e critérios

- AC-001: confirmação de pagamento concorrente com estorno ou chargeback não reabre o acesso revogado nem substitui estado terminal.
- AC-002: eventos financeiros e de checkout da mesma compra anual preservam um único período consistente, inclusive quando concorrentes.
- AC-003: depois de mudança de acesso, invalidar o snapshot Redis do aluno direto; falhas de cache têm comportamento explícito e não comprometem o processamento financeiro.
- AC-004: manter correlação, repetição, split, duração e regras existentes; sem pagamentos reais, migrations ou deploy.

## Plano e pacotes

O repositório de eventos coordena as atualizações financeiras e devolve o `studentId` de acesso direto afetado. O caso de uso de webhook invalida o cache depois da persistência. Um implementador é responsável pelo repositório; outro, pelo worker e caso de uso. QA escreve novos testes independentes e revisa o resultado. A base local tem alterações preexistentes e não deve ser descartada.

## Validação

| Critério | Evidência |
|---|---|
| AC-001 | QA independente: estorno/chargeback concorrentes e replay após revogação no PostgreSQL descartável; incluídos em 7/7 cenários de concorrência e retry aprovados. |
| AC-002 | QA independente: checkout e confirmação financeira anuais concorrentes, replay e preservação do período; incluídos em 7/7 aprovados. Teste mensal de duplicidade 2/2. |
| AC-003 | Testes de caso de uso 5/5 e infraestrutura Redis 1/1; duas regressões no PostgreSQL verificam falha de invalidação seguida de retry para confirmação e estorno. |
| AC-004 | Testes existentes de eventos com banco 28/28 e typecheck do backend aprovados. A suíte geral de pagamentos teve 291/296 na primeira execução; duas falhas esperam a regra antiga de bloquear compra sem split, uma era teste mensal dependente da ordem e foi corrigida, duas eram decorrentes de tabela ausente na cópia temporária do esquema. Os dois testes de e-mail passaram após atualizar o banco descartável e usar ASAAS_ENV=sandbox. Os dois testes legados de bloqueio permanecem incompatíveis com a regra atual autorizada pelo usuário. |

O banco foi criado isoladamente em `127.0.0.1:55441` apenas para testes. A cópia temporária do esquema substituiu os campos de vetor por texto porque a extensão pgvector não estava disponível; os cenários financeiros não usam esses campos. Nenhum evento real, pagamento ou deploy foi executado. A configuração em produção e o webhook remoto precisam de verificação posterior no ambiente público.
