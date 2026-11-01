# Fluxo de desenvolvimento com agentes

Este fluxo usa subagentes nativos do Codex e os conceitos de especificação, plano e tarefas do Spec Kit. O toolkit não é necessário para usar os artefatos. As instruções de `AGENTS.md` continuam aplicáveis.

## Papéis

- **Arquiteto (sessão principal):** investiga o comportamento atual; escreve `spec.md`, `plan.md` e `tasks.md`; define contratos e critérios de aceite identificados; distribui pacotes e responsabilidade por arquivos; acompanha retornos; encaminha correções; consolida `validation.md`.
- **Implementador (`implementador`):** executa apenas seu pacote, verifica o próprio trabalho e comunica impedimentos ou mudanças de contrato propostas ao arquiteto. Pode haver no máximo dois implementadores ativos ao mesmo tempo.
- **Revisor/QA (`revisor_qa`):** cria `test-plan.md` a partir da especificação, escreve e executa testes independentes e revisa o diff. Não altera código de produção nem enfraquece testes.

O limite de três subagentes permite dois implementadores e um revisor/QA. A quantidade de implementadores é uma regra deste fluxo, não uma configuração separada do Codex.

## Artefatos por feature nova

Use `specs/<id-da-feature>/`:

1. `spec.md`: objetivo, contexto, requisitos, limites, contratos e critérios de aceite `AC-001`, `AC-002` etc.
2. `plan.md`: abordagem, decisões, interfaces, dependências, arquivos afetados e estratégia de verificação.
3. `tasks.md`: pacotes pequenos, cada um ligado a critérios de aceite, arquivos de responsabilidade exclusiva, dependências e comandos de verificação.
4. `test-plan.md`: cenários independentes de QA ligados aos mesmos critérios, nível de teste, dados e resultados esperados.
5. `validation.md`: matriz de critério → tarefa → cenário → resultado, comandos e evidências, achados, correções e lacunas.

Documentos existentes em `docs/superpowers/` e acompanhamento em `.superpowers/sdd/` permanecem válidos. Para alterações em módulos documentados, mantenha também os documentos específicos indicados em `docs/README.md`.

## Execução e revisão

1. O arquiteto conversa com o usuário para esclarecer objetivo, comportamento esperado e decisões em aberto quando o pedido não os definir; investiga o código e registra critérios verificáveis na spec. Contratos compartilhados são definidos antes da divisão do trabalho.
2. O arquiteto prepara o plano e divide as tarefas em pacotes sem sobreposição de arquivos. Cada delegação informa escopo, arquivos permitidos, critérios `AC-*`, dependências e verificações esperadas.
3. O revisor/QA prepara o plano de testes a partir da spec. O arquiteto reserva os arquivos de teste para QA quando a independência do teste for necessária; testes locais do implementador devem ter arquivos distintos.
4. Implementadores executam seus pacotes e enviam evidências. Dúvidas sobre contratos ou escopo voltam ao arquiteto antes de uma mudança compartilhada.
5. QA executa os cenários e revisa o diff. O arquiteto atribui correções aos implementadores, solicita nova verificação e registra o resultado final em `validation.md`.

Nenhum critério é marcado como aceito apenas por conclusão de uma tarefa; é preciso registrar a evidência de QA ou a lacuna explícita.

## Escrita paralela e isolamento

Subagentes na mesma sessão compartilham o sistema de arquivos. Antes de executar pacotes em paralelo, o arquiteto verifica `git status`, `git worktree list`, dependências e sobreposição de arquivos. Evite escrita simultânea no mesmo arquivo, inclusive documentação, snapshots e arquivos gerados. Se pacotes exigirem o mesmo arquivo, execute-os em sequência ou redefina as fronteiras.

Para dois terminais trabalhando no mesmo projeto, use worktrees separados após aprovação do usuário. Um worktree novo não carrega automaticamente alterações não commitadas do worktree atual; o arquiteto deve identificar a base e planejar a transferência necessária sem descartar trabalho. Worktrees reduzem conflitos de escrita, mas ainda exigem integração e verificação dos diffs.

As instruções de papel não criam sandbox independente: permissões e aprovações são herdadas da sessão principal. Não faça commit, merge, push, deploy ou migrations sem autorização explícita do usuário.
