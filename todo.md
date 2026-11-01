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

- [ ] Rodar os testes de integração de pagamentos em PostgreSQL descartável, incluindo checkout, webhook, split e acesso do aluno.
- [ ] Validar no Asaas Sandbox: aluno no mensal e anual; professor patrocinando vaga no mensal e anual. Conferir valor, split, eventos e acesso liberado.
- [ ] Validar criação e aprovação de subconta no Sandbox e conferir os eventos `ACCOUNT_STATUS_*` no painel.
- [ ] Antes do deploy, conferir migrations, variáveis, Redis, worker e eventos registrados nos webhooks remotos de cada ambiente.
- [ ] Planejar e registrar um teste controlado em produção com compra real autorizada; conferir split, webhook e acesso. Nenhum dos novos fluxos foi testado em produção até 29/10/2026.

As evidências e critérios de conclusão de pagamentos ficam em [MELHORIAS-ASAAS.md](docs/asaas/MELHORIAS-ASAAS.md); os de documentos ficam em [MELHORIAS-PDF.md](docs/processamentopdf/MELHORIAS-PDF.md). Atualize o registro correspondente quando cada pendência for validada.
