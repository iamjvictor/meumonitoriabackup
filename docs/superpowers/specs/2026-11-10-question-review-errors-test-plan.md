# Plano de QA — erros na revisão de questões

| Cenário | AC | Nível | Resultado esperado |
|---|---|---|---|
| Campo com tipo/forma inválida no payload da revisão | AC-001 | Controller unit | 422 com nome do campo e orientação; nenhum valor recebido ecoado |
| Aprovar sem tópico, gabarito, cinco alternativas estruturadas ou explicação | AC-002 | Controller/repository unit | 422 específico por requisito |
| Topic/subject inexistente ou pertencente a outro monitor | AC-002 | Repository/controller unit | 422 específico e nenhuma atualização |
| Repositório falha inesperadamente durante atualização | AC-003 | Controller unit | 500 público genérico e log técnico com IDs do request, sem body/enunciado |
| Questão inexistente ou fora do monitor do professor | AC-004 | Controller/repository unit | 404 |
| Atualização válida | AC-004 | Controller unit | Resposta 200 no formato `{ data }` |

Dados: IDs UUID sintéticos, usuário sintético, payload sem dados reais. Execução isolada pelo node:test com módulos Prisma/repositório mockados; invocar com `--experimental-test-module-mocks`.
