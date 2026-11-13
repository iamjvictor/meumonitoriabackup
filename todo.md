# TODO do projeto

Este arquivo reúne atalhos para a documentação e as pendências de validação dos fluxos Asaas e de processamento de PDFs.

## Processamento de PDFs e questões

- [Índice do processamento de PDFs](docs/processamentopdf/README.md)
- [Problemas medidos e correções propostas](docs/processamentopdf/MELHORIAS-PDF.md)
- [Auditoria do PDF de química](tests/document-parser/results/questionsQuimica.quality-audit-2026-10-27.md)

## Índice de pagamentos Asaas

- [Índice geral do fluxo](docs/asaas/README.md)
- [Comportamento atual de pagamentos, planos, splits e webhooks](docs/asaas/reference/PAGAMENTOS-E-ASSINATURAS.md)
- [Variáveis de ambiente e configuração operacional](docs/asaas/reference/CONFIGURACAO-E-VARIAVEIS.md)
- [Criação e sincronização da conta de recebimento](docs/asaas/reference/asaas-account-status-sync.md)
- [Estado dos testes, evidências e lacunas](docs/asaas/MELHORIAS-ASAAS.md)
- [Spec de vagas patrocinadas e plano anual](docs/superpowers/specs/2026-10-27-sponsored-student-seats-and-annual-plan-design.md)
- [Plano de implementação e revisão](docs/superpowers/plans/2026-10-27-sponsored-student-seats-and-annual-plan.md)

## Pendências principais

- [ ] Retomar e concluir a comparação E2E dos quatro pipelines de modelos para processamento de PDFs, questões e chat. Os testes e dry-runs estão preparados em `tests/model-comparison/` e `backend/test/e2e/`, mas nenhuma execução real completou o pipeline: Econômica e Qualidade Kimi pararam na descrição visual por resposta `HTTP 200` não interpretável como JSON do DeepInfra; Só Qwen 235B parou por `HTTP 429` do Parasail, inclusive com intervalo de 10 s; Revisão cruzada ainda não foi executado. Na retomada, estabilizar/selecionar provedores para visão e embeddings, rodar primeiro uma chamada de diagnóstico isolada e então continuar as rodadas completas, mantendo o banco local descartável, sem usar produção/sandbox e sem alterar comportamento de produção. Registrar tokens, custos, latência, resultados de questões e chat, comparar com baseline Gemini e atualizar o relatório. Evidências e artefatos: `reports/e2e_*/run-*/` e `tests/model-comparison/README.md`.
- [ ] Corrigir e validar as vulnerabilidades de dependências identificadas em 02/11/2026 na imagem `asevedocompany/meumonitor-api-worker:documentos-20261102` antes de publicá-la em produção. O `npm audit --omit=dev` apontou 8 pacotes com severidade alta e 1 moderada: `fastify`, `sharp`, `zod`, `fast-uri`, `prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2` e `@fastify/busboy`. Avaliar exposição real, atualizar dependências e lockfile, executar testes relevantes, reconstruir a imagem e repetir a auditoria; registrar versões e riscos restantes.
- [ ] Rodar os testes de integração de pagamentos em PostgreSQL descartável, incluindo checkout, webhook, split e acesso do aluno.
- [ ] Validar no Asaas Sandbox: aluno no mensal e anual; professor patrocinando vaga no mensal e anual. Conferir valor, split, eventos e acesso liberado.
- [ ] Validar criação e aprovação de subconta no Sandbox e conferir os eventos `ACCOUNT_STATUS_*` no painel.
- [ ] Antes do deploy, conferir migrations, variáveis, Redis, worker e eventos registrados nos webhooks remotos de cada ambiente.
- [ ] Planejar e registrar um teste controlado em produção com compra real autorizada; conferir split, webhook e acesso. Nenhum dos novos fluxos foi testado em produção até 29/10/2026.

As evidências e critérios de conclusão de pagamentos ficam em [MELHORIAS-ASAAS.md](docs/asaas/MELHORIAS-ASAAS.md); os de documentos ficam em [MELHORIAS-PDF.md](docs/processamentopdf/MELHORIAS-PDF.md). Atualize o registro correspondente quando cada pendência for validada.
