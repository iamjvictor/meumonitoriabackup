# Plano de execução

**Objetivo:** entregar auditoria comprovável e correções de responsividade, com regressão sustentável.
**Arquitetura:** inventário dirigido pelas rotas e fluxos, inspeção visual sistemática, correções por área e QA independente. O Playwright existente em `frontend/tests/e2e` é o ponto de partida; seus projetos atuais usam Chrome desktop e viewport 375×640. Não confundir emulação com cobertura de navegadores reais.
**Stack:** Next.js 16, React, Tailwind, Playwright e Vitest. Especificação: `spec.md`.

1. Registrar `git status --short`, instruções adicionais e documentação Next relevante em `frontend/node_modules/next/dist/docs/` antes de editar código. Identificar arquivos em alteração e coordenar conflitos; preservar integralmente o trabalho existente.
2. Mapear `frontend/src/app/**/page.tsx`, layouts e navegação, incluindo `/`, `/alunos`, `/login`, `/redefinir-senha`, `/convite/aluno`, `/p/[teacherSlug]`, `/areadoaluno` e suas subrotas, `/checkout/retorno` e `/professor` e suas subrotas. Confirmar rotas e estados reais, inclusive modais. Registrar acesso, dados de teste e bloqueios.
3. Preparar ambiente local e dados de teste seguros, reutilizando fixtures e autenticação existentes. Registrar comandos, versões e dependências; não contornar segurança nem criar dados externos sem autorização.
4. Capturar linha de base por rota/estado/largura; usar screenshots e inspeção interativa, testar mudanças entre larguras e anotar ocorrências antes de corrigir. Priorizar bloqueios de fluxo e componentes compartilhados, depois problemas visuais.
5. Corrigir por pacotes de responsabilidade exclusiva, sequencialmente quando houver arquivos compartilhados. Não usar `overflow-x: hidden` como forma de ocultar defeitos. Validar o fluxo e comparar evidências antes/depois.
6. QA independente deriva testes da spec, executa cenários e revisa diff; repetir após correções. Registrar resultados, falhas preexistentes e limitações em `validation.md`. Rodar em `frontend`: `npm run lint`, `npm run typecheck`, testes unitários pertinentes e `npm run test:e2e`; registrar falhas ambientais separadamente.

**Decisões:** inspeção visual integral combinada com automação dos caminhos críticos oferece cobertura mais confiável que apenas screenshots ou apenas testes de overflow. Não atualizar snapshots automaticamente para encobrir regressões. Screenshots são evidência, não critério de aprovação isolado.
