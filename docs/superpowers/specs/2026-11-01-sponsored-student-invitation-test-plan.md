# Plano de QA — convite de aluno patrocinado

| ID | Cenário | Nível | Critério | Resultado esperado |
|---|---|---|---|---|
| QA-001 | Professor dono emite link para vaga paga mensal vigente | Integração | AC-001, AC-006 | Retorna URL com token aleatório, validade de 30 dias e persiste somente hash |
| QA-002 | Professor tenta emitir convite para lote alheio | API | AC-006 | 403/404 sem revelar dados do lote |
| QA-003 | Vaga pendente, revogada, expirada ou lote não ativo | API/DB | AC-005, AC-006 | Link não é emitido nem resolvido |
| QA-004 | Resolve convite mensal e anual válido | API/UI | AC-001 | Exibe professor, monitor, e-mail fixo, duração e datas corretas |
| QA-005 | Token adulterado, desconhecido, expirado ou substituído por reemissão | API/UI | AC-005, AC-006 | Resposta segura de convite inválido/expirado; nenhum dado privado; token não aparece em path/query/log |
| QA-006 | Cadastro com nome e senha válidos | Integração | AC-003, AC-004 | Conta estudante criada com e-mail da vaga e vaga vinculada uma vez |
| QA-007 | Request tenta enviar/alterar e-mail ou role | API | AC-002, AC-006 | Campos extras rejeitados; e-mail/role vêm do servidor |
| QA-008 | E-mail já possui conta | API/UI | AC-005 | Não cria usuário duplicado; oferece login com retorno ao aluno |
| QA-009 | Duplo clique, repetição da ativação ou duas ativações concorrentes | Integração | AC-004, AC-006 | No máximo uma conta e uma associação; nenhuma duplicação de efeito |
| QA-010 | Erro de rede, senha inválida e termos não aceitos | UI | AC-005 | Mensagem junto ao formulário; botão recupera estado; navegação por teclado funciona |
| QA-011 | Layout em viewport móvel e desktop | Browser | AC-001, AC-003 | Conteúdo e CTA acessíveis sem overflow |
| QA-012 | Criação e resgate não disparam e-mail | Integração | AC-007 | Nenhuma chamada a serviço de e-mail; link disponível pelo endpoint de emissão |

## Comandos previstos

- Backend: `npm run typecheck` e `node --import tsx --test src/modules/payments/__tests__/sponsored-seat-invitation.use-case.test.ts src/modules/payments/__tests__/sponsored-seat-invitation.database.test.ts`.
- Frontend: `npx vitest run tests/unit/SponsoredSeatInvitationPage.test.tsx`, `npm run typecheck` e teste browser mobile/desktop pelo Playwright quando o ambiente estiver disponível.
- Testes dependentes de banco devem usar o banco de integração configurado pelo repositório, nunca produção.
