# Pacotes e responsabilidade

Todos pendentes. Implementadores não estão sozinhos no repositório: preservar alterações alheias e trabalhar somente nos arquivos atribuídos. Máximo de dois implementadores ativos.

| Pacote | Responsável | AC | Dependência | Escopo |
|---|---|---|---|---|
| P1 | implementador A | 001,010 | nenhuma | Perfil/benchmark Python e documentação do parser |
| P2 | implementador A | 002,004,006,008 | P1 | Processo, manifest, rota; sem backend |
| P3 | implementador B | 003,005,009 | contratos da spec | Prisma, ledger, cliente TS e config |
| P4 | implementador B | 002–006,009 | P2,P3 | Orquestração/worker/progresso |
| P5 | A: montagem Python; B: publicação TS | 007–009,011 | P4 | Execução sequencial para schema e repositórios compartilhados |
| P6 | revisor_qa + arquiteto | todos | P1–P5 | QA independente, evidência e rollout proposto |

P1/P3 podem avançar em paralelo após congelar contratos. P2 altera conversor somente após P1. P5 só altera schema depois de P3 finalizado. Testes independentes sob propriedade do QA; testes de unidade do implementador em arquivos distintos. Nenhum agente executa ações em produção.

Antes de iniciar: conferir instruções por subdiretório e inventariar diff preexistente. Como há alterações extensas, definir checkout/base de execução antes de qualquer edição de código; criação de worktree segue autorização prevista no acordo do usuário.

## Estado após implementação local

P1–P4 implementados e verificados localmente. P5 implementado com publicação por geração e proteção de fronteiras ambíguas; continuidade semântica em documento real continua pendente. P6 parcialmente executado: QA, benchmark e pilotagem de duas páginas em banco isolado; faltam piloto completo de livro, Storage de homologação e chat ponta a ponta. Nenhuma migration foi aplicada em produção e a flag permanece desativada.
