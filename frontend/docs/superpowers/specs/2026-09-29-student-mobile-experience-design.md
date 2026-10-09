# Experiência responsiva da Área do Aluno

## Objetivo

Transformar a Área do Aluno em uma experiência de estudo confortável em celulares, tablets e desktops. A primeira entrega é o Início, que estabelecerá os componentes e regras usados nas demais rotas.

## Decisões aprovadas

- Em telas compactas e médias, a navegação primária é uma barra fixa inferior montada pelo layout compartilhado da Área do Aluno, presente em todas as rotas.
- A barra contém cinco destinos de mesmo nível: **Início**, **Chat**, **Praticar**, **Ranking** e **Perfil**.
- **Praticar** ocupa a posição central e recebe maior destaque visual, por ser a principal ação de estudo.
- O Chat é uma rota/tela de conversa, não uma coluna comprimida: preserva histórico, agente/matéria selecionados, campo de mensagem fixo e retorno de navegação claro.
- Em mobile, Perfil concentra os atalhos para Meu desempenho, Meus planos, Meu perfil, configurações e sair.
- A barra é renderizada uma única vez pelo layout global; telas que usam um shell próprio não duplicam a barra.
- No desktop, a barra lateral esquerda e o chat lateral existentes permanecem disponíveis.

## Estrutura responsiva

| Faixa | Navegação | Conteúdo | Chat |
| --- | --- | --- | --- |
| 320–767px | Barra inferior fixa | Uma coluna, sem overflow horizontal | Rota em tela cheia |
| 768–1023px | Barra inferior fixa | Grade adaptativa, até duas colunas quando houver espaço | Rota em tela cheia |
| 1024px+ | Sidebar esquerda | Layout atual, com contenção de largura e grades responsivas | Sidebar direita atual |

Todos os conteúdos mobile reservam espaço inferior para a barra e a área segura do dispositivo. Alvos de toque terão pelo menos 44px, enquanto o conteúdo respeitará reflow em 320px.

## Arquitetura

Um `StudentAppShell` será responsável por montar a estrutura comum: sidebar desktop, cabeçalho, barra mobile e regiões de conteúdo/chat. Cada página passa a informar apenas o destino ativo e seu conteúdo. A barra inferior será um componente semântico `nav`, com `aria-current="page"` no destino ativo e rótulos visíveis.

O destino Perfil será uma tela de hub no mobile. A página de perfil existente continua sendo a origem dos dados pessoais; o hub encaminhará para Perfil, Desempenho e Planos sem duplicar dados ou permissões.

## Primeira entrega: Início

1. Criar a barra inferior e integrá-la ao shell do Início.
2. Garantir que Início não seja coberto pela barra, incluindo modais e ações flutuantes.
3. Adaptar as grades e cards já existentes para 320px, 375px, 768px e 1024px, preservando hierarquia, toque e legibilidade.
4. Em telas abaixo de `lg`, ocultar a sidebar esquerda e o chat lateral, sem remover seus comportamentos desktop.
5. Validar navegação, foco, zoom, ausência de rolagem horizontal e renderização nos quatro viewports.

## Método para as próximas telas

Antes de adaptar cada rota, será feito um diagnóstico objetivo: navegação disponível, hierarquia da tarefa principal, largura/overflow, alvos de toque, formulários/modais, comportamento do chat e recuperação de contexto. O resultado definirá alterações específicas da rota, sempre reaproveitando o shell e os componentes base aprovados.

Ordem inicial: Início, Chat, Prática, Ranking e hub de Perfil; depois Desempenho e Planos como destinos internos do Perfil em mobile.

## Não incluído nesta fase

- Alterar APIs, dados, permissões ou regras de assinatura.
- Reescrever a lógica de chat, desafios, flashcards ou prática.
- Criar um aplicativo nativo/PWA offline.
