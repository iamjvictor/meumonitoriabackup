# Plano independente de QA — integridade do vínculo patrocinado

Escopo: corrigir o resgate de convite patrocinado que falha na constraint manual de `student_enrollments` (uma referência a item de assinatura/pagamento é obrigatória). Qualquer teste com banco deve executar somente em banco temporário dedicado e confirmar que `DATABASE_URL === PAYMENTS_TEST_DATABASE_URL`; nunca usar banco compartilhado, sandbox de aplicação ou produção.

Critérios de aceite:
- AC-DB-001: uma inscrição patrocinada tem referência relacional explícita à vaga patrocinada; não satisfaz a constraint por dados fictícios de assinatura/item pago.
- AC-DB-002: com a constraint real instalada no banco temporário, resgatar o convite cria o vínculo da vaga, a projeção de acesso necessária e o serviço real autoriza acesso ao monitor até a data de término.
- AC-DB-003: repetição/concorrrência do mesmo resgate produz no máximo um vínculo e não duplica assinatura, inscrição ou vaga reivindicada; corrida perdedora recebe resultado seguro/idempotente.
- AC-DB-004: falha depois da criação externa da conta não invalida/destrói o convite; login de conta existente pode completar o resgate em retry sem duplicidade.
- AC-DB-005: as operações continuam dentro da transação e a constraint de integridade permanece habilitada; atualizar apenas o teste para remover/ignorar constraint não é aceitável.
- AC-DB-006: os fluxos de acesso que dependem diretamente de `StudentEnrollment`, incluindo seleção de monitores do desafio diário, reconhecem inscrição originada de vaga patrocinada vigente.
- AC-DB-007: registros legados de `StudentSubscription`, que não possuem coluna de ambiente, permanecem válidos em produção sem abrirem acesso a SANDBOX; registros sem vínculo de pagamento não podem ser classificados com confiança como sandbox.
- AC-DB-008: operações de revogação/cancelamento também respeitam a fronteira de ambiente e não alteram registros legados de produção quando executadas em SANDBOX.

| ID | Cenário | Nível | Critérios | Resultado esperado |
|---|---|---|---|---|
| QA-DB-001 | Preparar DB temporário, aplicar schema/migrations e instalar constraint manual real | Infra DB | AC-DB-001, AC-DB-005 | Consulta `pg_constraint` confirma constraint habilitada; o teste aborta se a URL não for explicitamente a DB temporária autorizada. |
| QA-DB-002 | Resgatar vaga paga com constraint aplicada | Integração DB | AC-DB-001, AC-DB-002, AC-DB-005 | Resgate completa sem erro de check; `sponsored_seats`, `student_subscriptions`, `student_enrollments` apontam para as entidades corretas e o repositório real de acesso retorna acesso ativo. Nenhum payment item fake. |
| QA-DB-003 | Dois resgates concorrentes usando o mesmo token | Integração DB/concorrência | AC-DB-003, AC-DB-005 | Um único resgate vence; uma inscrição e uma assinatura ficam persistidas; a vaga não pode ser reivindicada duas vezes. |
| QA-DB-004 | Conta/Auth criada, primeira transação de resgate falha; conta existente tenta novamente | Integração DB/recuperação | AC-DB-004, AC-DB-005 | Convite continua resgatável; retry autentica a mesma conta e vincula uma vez; sem registros parciais nem duplicados. |
| QA-DB-005 | Acesso fora da vigência, vaga de outro e-mail ou token reutilizado | Integração DB | AC-DB-002, AC-DB-003 | Nenhum novo vínculo/acesso; estado persistido não é alterado indevidamente. |
| QA-DB-006 | Consultar autorização/lista de monitores, chat e desafios diários para aluno com vaga patrocinada vigente | Integração DB | AC-DB-002, AC-DB-006 | Monitor patrocinado é reconhecido pelo serviço de acesso, chat e desafio diário; o vínculo não depende de item de pagamento fictício. |
| QA-DB-007 | StudentSubscription legado sem ambiente (sem ponte de pagamento) consultado em Production e Sandbox; filtros com ponte são verificados nos testes unitários | Integração DB + unitário | AC-DB-007 | Produção preserva acesso histórico; Sandbox falha fechado para linha sem ambiente/ponte. Registrar limitação de classificação dos dados antigos. |
| QA-DB-008 | Processo SANDBOX cancela acesso de aluno com StudentSubscription legado de produção | Integração DB | AC-DB-008 | A linha legada permanece ativa; operação sandbox não pode alterar estado de acesso de produção. |

Dados e isolamento: fixtures devem usar identificadores/e-mails aleatórios e cleanup em `finally`. Após a execução, comprovar remoção de fixtures e conexão somente ao banco temporário. Se banco temporário/credenciais locais não estiverem disponíveis, reportar lacuna em vez de apontar para outro banco.
