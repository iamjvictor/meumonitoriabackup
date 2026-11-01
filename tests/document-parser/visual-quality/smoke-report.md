# Avaliação de compreensão visual do chat

Gerado em: 2026-10-27T19:56:04.045Z

Casos: 1; revisão humana pendente: 1.
Modelos: não informado; versões de prompt: não informadas.
Latência média: n/a ms; custo total: não informado USD.

## Métricas determinísticas e revisão humana

| Etapa | Passou / total | Taxa |
|---|---:|---:|
| Extração (casos) | 1/1 | 100% |
| Associação sem asset alheio | 0/1 | 0% |
| Contexto entregue (casos críticos) | 0/1 | 0% |
| Recuperação dos assets anotados | 0/0 | n/a |
| Respostas aprovadas por revisão humana | 0/0 | n/a |

### Baseline textual vs multimodal

Comparação pareada revisada: 0/0 → 0/0.

A resposta não é aprovada automaticamente pelo texto ou pela alternativa correta. Cada caso precisa de revisão humana com fatos visuais identificados.

## Resultado por categoria

| Categoria | Respostas aprovadas / revisadas | Casos |
|---|---:|---:|
| visual-required-direct | 0/0 | 1 |

## Falhas para triagem

- **questions-quimica-q01-periodic-table** (visual-required-direct): extração=OK, associação=FALHA, contexto=FALHA, resposta=PENDENTE/FALHA; falha upstream=worker/chat.not_run; assets ausentes=1, assets indevidos=0, fatos não confirmados=bromine-group-17, bromine-period-4, bromine-symbol-Br, oxidizer-is-Cl2.

## Gate inicial

Contexto crítico entregue sem asset indevido: NÃO PASSOU.
Compreensão visual revisada >= 90%: NÃO PASSOU.
Este relatório não autoriza rollout se houver revisão humana pendente ou se algum gate falhar.
