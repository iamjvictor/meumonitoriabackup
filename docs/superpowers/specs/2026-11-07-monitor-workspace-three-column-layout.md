# Layout do workspace do monitor

## Objetivo e causa

Manter as abas de conteúdo visíveis durante a rolagem e reorganizar o workspace em três áreas: estrutura do monitor à esquerda, conteúdo no centro e contexto do monitor à direita. A barra desaparecia porque `handleWorkspaceScroll` ocultava tanto o cabeçalho quanto as abas quando a rolagem avançava.

## Critérios de aceite

- **AC-001:** As abas Base de Conhecimento, Banco de Questões e Flashcards continuam visíveis enquanto o conteúdo central rola.
- **AC-002:** Escopo ativo, status/publicação, configurações e resumo do monitor aparecem na sidebar direita.
- **AC-003:** O botão de voltar fica junto ao título “Estrutura do Monitor”.
- **AC-004:** No desktop, estrutura, conteúdo e contexto ocupam colunas independentes; em telas menores, o layout se reorganiza sem cortar conteúdo.

## Abordagem

Separar a rolagem do conteúdo das abas persistentes, remover a lógica que escondia os cabeçalhos e extrair o resumo/ações para `MonitorContextSidebar`. Usar as colunas já existentes para a estrutura à esquerda e o conteúdo principal. Em telas menores, empilhar a sidebar de contexto.

Tese visual: um workspace de operação compacto, com navegação e contexto sempre acessíveis e a área de trabalho central dedicada ao conteúdo. A única transição é o redimensionamento responsivo; sem animações adicionais em controles de operação.

## Validação

- **AC-001:** removida a lógica de ocultação por rolagem; navegação fica fora da área rolável.
- **AC-002:** resumo, escopo, publicação e configurações renderizados em `MonitorContextSidebar`.
- **AC-003:** link de voltar movido para o cabeçalho da sidebar estrutural.
- **AC-004:** colunas aplicadas em `lg`, com contexto empilhado em telas menores.
- `frontend`: `npm run typecheck` — aprovado. Teste visual no navegador pendente.
