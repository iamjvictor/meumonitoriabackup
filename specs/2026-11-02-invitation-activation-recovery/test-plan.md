# Plano independente de QA — recuperação de ativação do convite

Escopo: validar recuperação quando a ativação do convite falha depois que o backend pode ter criado a conta. Os testes usam mocks locais; não chamam API externa, banco compartilhado nem serviço de e-mail.

Critérios aplicáveis da especificação `docs/superpowers/specs/2026-11-01-sponsored-student-invitation-design.md`: AC-004 (resgatar a vaga e continuar para a área do aluno), AC-005 (caminhos compreensíveis para conta existente/falha), AC-006 (token não exposto em logs/URL e retries seguros).

| ID | Cenário | Nível | Critérios | Resultado esperado |
|---|---|---|---|---|
| QA-REC-001 | Convite resolve; ativação responde HTTP 500 após possível criação de usuário | Componente/UI | AC-005 | Mostrar falha recuperável, preservar dados do convite e e-mail, oferecer login; não rotular convite válido como inválido. |
| QA-REC-002 | Aluno usa CTA de login após falha de ativação | Componente/UI | AC-004, AC-006 | Guardar o token somente em `sessionStorage`; navegar para login sem token em query/path/href. |
| QA-REC-003 | Login de conta existente com convite pendente | Componente + serviço mockado | AC-004, AC-006 | Enviar token ao endpoint de resgate no header, retornar à página do convite e limpar o token somente após sucesso. |
| QA-REC-004 | Resgate após login falha temporariamente | Componente + serviço mockado | AC-005, AC-006 | Preservar token de sessão e estado de retry; nunca incluir token em URL. |
| QA-REC-005 | Convite inválido/expirado/utilizado no carregamento | Componente/UI | AC-005 | Continuar exibindo estado terminal específico; o fallback para erro 500 da ativação não deve mascarar estes estados. |
| QA-REC-006 | Verificação de segredo na saída da UI | Componente/UI | AC-006 | Token bruto ausente de links, texto visível e destino de navegação; uso limitado ao estado/sessionStorage e header da API. |

Comandos: `cd frontend && npx vitest run tests/unit/SponsoredSeatInvitationRecovery.qa.test.tsx tests/unit/LoginModalSponsoredInvitationHandoff.qa.test.tsx tests/unit/SponsoredSeatInvitationPage.test.tsx`.
