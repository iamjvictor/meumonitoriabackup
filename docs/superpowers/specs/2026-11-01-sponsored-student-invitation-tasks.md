# Tarefas — convite de aluno patrocinado

## Pacote 1 — backend

- Objetivo: gerar, validar e resgatar convites seguros para vagas patrocinadas pagas.
- Critérios: AC-001 a AC-007.
- Arquivos: schema/migration; caso de uso, repositório e controller de convite; registro de rotas e env; testes unitários e integração de banco.
- Dependência: contrato documentado em `docs/superpowers/plans/2026-11-01-sponsored-student-invitation.md`.
- Limites: não implementar envio de e-mail; não alterar regras de pagamento, arquivo de eventos, ou rotas atuais de compra/checkout.
- Verificações: teste unitário focado, teste de integração se houver DB isolado, `npm run typecheck`.

## Pacote 2 — frontend

- Objetivo: criar a página responsiva para aluno abrir o convite, entender o acesso e criar sua conta.
- Critérios: AC-001 a AC-005 e AC-007.
- Arquivos: `frontend/src/app/convite/aluno/page.tsx`, novo componente e service da página, teste Vitest dedicado.
- Dependência: endpoints da Task 1, exatamente como definidos no plano.
- Limites: não coletar e-mail editável, CPF ou telefone; não implementar envio de e-mail.
- Verificações: teste Vitest focado, typecheck, lint nos arquivos alterados e browser QA.

## Pacote 3 — QA e correções

- Objetivo: revisão independente de segurança, requisitos, acessibilidade e cenários de erro; registrar evidências.
- Critérios: AC-001 a AC-007.
- Arquivos: testes QA adicionais em diretórios de teste e `test-plan.md` / `validation.md`.
- Dependência: conclusão dos pacotes 1 e 2.
- Limites: não alterar código de produção; enviar achados ao arquiteto para correção.
- Verificações: matriz completa de cenários e revisão final do diff.
