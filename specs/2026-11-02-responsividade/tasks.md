# Pacotes para o agente executor

- [ ] **T1 — Inventário e ambiente** (AC-001, AC-002): arquiteto; produzir `inventory.md` nesta pasta com rota, arquivo, perfil, estados, fixture e acesso. Registrar Git e comandos. Nenhum código de produto.
- [ ] **T2 — Linha de base e plano de QA** (AC-002–006): `revisor_qa`, após T1; preencher `test-plan.md`, matriz e achados; reservar testes de QA em arquivos próprios. Evidências sem dados sensíveis.
- [ ] **T3 — Layout público e autenticação** (AC-003–005): `implementador`; arquivos de frontend identificados no inventário para marketing, auth e layouts respectivos; corrigir achados de T2 e executar testes pertinentes. Não alterar arquivos atribuídos a outro pacote.
- [ ] **T4 — Área do aluno e checkout** (AC-003–005): `implementador`; componentes e rotas identificados para aluno/checkout; depende de T2 e de T3 se houver componentes compartilhados. Preservar alterações existentes, especialmente convite e login.
- [ ] **T5 — Professor e página pública** (AC-003–005): `implementador`; componentes e rotas de professor identificados no inventário; depende de T2 e de resolução de arquivos compartilhados. Preservar alterações em andamento em turmas patrocinadas.
- [ ] **T6 — Regressão e revisão** (AC-006–008): `revisor_qa` escreve e executa testes independentes em `frontend/tests/e2e` e revisa diff; devolve achados para correção e repete cenários afetados.
- [ ] **T7 — Consolidação** (AC-001–008): arquiteto registra evidências, comandos, resultados e bloqueios em `validation.md`, revisa cobertura e apresenta pendências.

Antes de delegar T3–T5, o arquiteto deve preencher uma lista concreta de arquivos exclusivos por pacote com base no inventário e no Git. No máximo dois implementadores ativos; QA não edita produção. Não executar pacotes simultâneos que escrevam no mesmo arquivo. Para terminais independentes, seguir regra do projeto de aprovação prévia de worktrees.
