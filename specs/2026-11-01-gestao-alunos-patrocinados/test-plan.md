# Plano de testes — ajuste visual da tabela

- VT-001 (AC-004, escopo atualizado): expansão do monitor não oferece ação de cancelamento de turma ou aluno.
- VT-002 (AC-003): botão “Renovar acesso” aparece somente quando `endsAt` está no passado; acesso vigente ou sem data não oferece renovação. Clique abre modal de compra novamente.
- VT-003 (AC-001/002): expansão e filtro permanecem operáveis por teclado, com `aria-expanded`, nome acessível e foco visível; estilos das linhas aplicam tons marrom/verde sem reduzir legibilidade.
- VT-004: tabela continua responsiva, mantendo conteúdo acessível por rolagem horizontal em viewport estreito.

Método: inspeção do diff; testes de unidade da tabela; typecheck. Lacuna: contraste visual precisa de inspeção renderizada caso não haja ferramenta visual disponível.
