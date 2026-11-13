# Pacotes para delegação

Todos pendentes. Até dois implementadores simultâneos. Os caminhos novos abaixo são propostas, não arquivos já existentes. QA escreve testes independentes; implementação não modifica os testes do QA para obter aprovação.

| Pacote | Responsabilidade exclusiva | AC | Dependência | Verificação |
|---|---|---|---|---|
| P1 Contratos | question-graph/state.ts e novos tipos de evidência/segmento | 002,003,005,010 | Nenhuma | Revisão de contrato e typecheck |
| P2 Candidatos | Novo módulo candidate-validation em question-graph; lógica de patch do extrator | 006,007,009 | P1 | T06,T07,T10 |
| P3 Busca | context.provider.ts, prisma-context.provider.ts e novo módulo search-document-evidence | 002,004,005 | P1 | T02–T05 |
| P4 Agentes | alternatives.agent.ts, answer.agent.ts, reviewer.ts | 003,005,007,008,010,012 | P2,P3 | T05,T07–T09,T12 |
| P5 Integração | structured-question-extraction.service.ts, document-worker.service.ts, adaptador de checkpoint e repositórios necessários | 001,009,011,014 | P4 | T01,T10,T11 |
| P6 QA | Testes independentes em tests/document-parser e backend/src/worker/services/question-graph/__tests__; relatórios e validation.md | Todos | Cenários podem ser preparados desde P1 | T01–T14 |

P2 e P5 não editam o extrator ao mesmo tempo. P1 e P4 não editam estado/revisor ao mesmo tempo. Antes da delegação, delimitar nomes concretos de arquivos novos e comandos existentes. Mudanças de contrato retornam ao arquiteto. Nenhum pacote inclui deploy ou alterações de dados de produção.
