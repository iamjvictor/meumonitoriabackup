# Plano independente de QA — Task 1 backend de convites patrocinados

Escopo: emissão, resolução e ativação de convite no backend. Baseado nos ACs da spec `2026-11-01-sponsored-student-invitation-design.md`, contratos descritos em `2026-11-01-sponsored-student-invitation-tasks.md` e escopo do brief Task 1.

| ID | Cenário | Nível | AC | Resultado esperado |
|---|---|---|---|---|
| BQA-001 | Emissão por professor proprietário para vaga elegível | unitário/API/DB | AC-001, AC-006, AC-007 | URL fragmentada; token aleatório de 32 bytes, TTL de 30 dias; persistência apenas do hash; sem envio de email |
| BQA-002 | Professor não proprietário, lote/vaga não relacionados | unitário/API | AC-006 | Emissão negada sem revelar dados ou emitir token |
| BQA-003 | Vaga pendente, resgatada, revogada, lote inativo ou período encerrado | unitário/DB | AC-005, AC-006 | Não emite nem resolve convite |
| BQA-004 | Resolução de token válido mensal/anual | unitário/API | AC-001, AC-002 | Dados e email derivam da vaga/banco; nenhum campo sensível é inferido do request |
| BQA-005 | Token ausente, malformado, desconhecido, expirado ou revogado por reemissão | unitário/API | AC-005, AC-006 | Resposta segura sem dados da vaga; bearer não aparece em path/query/body/log |
| BQA-006 | Ativação com corpo estrito e token válido | unitário/API/DB | AC-002, AC-003, AC-004 | Cria role estudante para email da vaga, resgata a vaga correspondente uma vez; não requer CPF/telefone |
| BQA-007 | Email/role/seat IDs extras ou adulterados no corpo | API | AC-002, AC-006 | Rejeita extras ou ignora de forma segura; nenhuma alteração de identidade/vínculo |
| BQA-008 | Email já cadastrado | API/Auth | AC-005, AC-006 | Sem conta duplicada e convite/vaga não consumidos; resposta orienta caminho de login |
| BQA-009 | Retry/double activation e concorrência | DB/Auth | AC-004, AC-006 | Efeito de resgate idempotente, sem associações duplicadas ou vaga dupla |
| BQA-010 | Rate limiting e CORS para header de token | configuração/API | AC-006 | Endpoints públicos limitados contra abuso; CORS permite o header dedicado sem ampliar indevidamente a exposição |
| BQA-011 | Compatibilidade com contrato de login/cookies existente | API/integration | AC-003, AC-004 | Sessão/cookies/shape compatíveis com login atual; redirecionamento pode continuar no frontend |
| BQA-012 | Falha entre criação de conta externa e resgate DB | análise de falha | AC-004, AC-006 | Retry recuperável sem criar acesso duplicado; limitação residual documentada se não houver operação compensatória |

## Restrições e execução

- Executar os testes unitários focados existentes e qualquer teste independente criado apenas no arquivo QA autorizado.
- Testes de banco somente com `PAYMENTS_TEST_DATABASE_URL` explicitamente isolada; nunca reutilizar `DATABASE_URL` compartilhada/produção.
- Typecheck é evidência complementar, não substitui testes de rota/Auth/DB.
- Revisar diff de schema/migration/use case/repository/controller/rotas/module/server/env, incluindo logging, segurança, enum de estado, retries e compatibilidade com login.
