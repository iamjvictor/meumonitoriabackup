# Plano independente de QA — autenticação login → resgate do convite

Escopo definido pelo arquiteto: validar a rota real do frontend no caminho login seguido de resgate, inclusive quando o login não deixou cookies visíveis ao navegador. Todas as dependências de rede serão substituídas por mocks; nenhum serviço, banco ou conta real será acessado.

Critérios de aceite:
- AC-AUTH-001: resgate após login usa o access token retornado pelo login como `Authorization: Bearer <token>` quando disponível, além do cookie de sessão.
- AC-AUTH-002: se o token local não estiver disponível, a requisição ainda usa credenciais/cookie (`credentials: include`) como fallback.
- AC-AUTH-003: token de convite e token de acesso não aparecem em URL, texto visível, logs ou navegação; token de convite segue no header próprio.
- AC-AUTH-004: cenário cobre a rota/página real de convite, CTA de login e execução do handoff para o endpoint de resgate, com mocks apenas nas chamadas externas.

| ID | Cenário | Nível | Critério | Resultado esperado |
|---|---|---|---|---|
| QA-AUTH-001 | Abrir convite válido, navegar ao login e autenticar; login sem cookies disponibilizados no mock | Integração frontend/rota | AC-AUTH-001, AC-AUTH-004 | POST de resgate usa bearer do login mais `credentials: include`; header de convite carrega token de convite; volta para `/convite/aluno`. |
| QA-AUTH-002 | Login response não contém access token, com cookie de sessão disponível | Integração frontend/rota | AC-AUTH-002, AC-AUTH-004 | POST de resgate inclui credenciais e token de convite; não gera `Authorization: Bearer undefined`/vazio. |
| QA-AUTH-005 | Login não retorna bearer, mas existe token residual de sessão anterior no localStorage | Integração frontend/rota | AC-AUTH-002 | Requisição usa cookies e não envia o bearer antigo. |
| QA-AUTH-003 | Inspecionar URL, DOM, navegação e logger durante sucesso e falha de resgate | Segurança frontend | AC-AUTH-003 | Segredos não aparecem em URL/query/path, links, mensagens ou logs; apenas nos headers autenticadores necessários. |
| QA-AUTH-004 | Resgate falha após autenticação | Integração frontend/rota | AC-AUTH-001, AC-AUTH-002 | Token de convite permanece para retry; nova tentativa reutiliza a credencial válida; nenhum redirect contém token. |

Comando planejado: `cd frontend && npx vitest run tests/unit/SponsoredInvitationLoginRedeem.qa.test.tsx tests/unit/LoginModalSponsoredInvitationHandoff.qa.test.tsx tests/unit/SponsoredSeatInvitationPage.test.tsx tests/unit/SponsoredSeatInvitationService.test.tsx` e `npm run typecheck`. O teste deverá usar Next route/page real e mockar somente API, AuthService/network e providers externos indispensáveis.
