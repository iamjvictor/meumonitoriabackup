# Modal de compra da vitrine do professor

## Objetivo
Deixar a escolha e contratação de um monitor utilizáveis em telas pequenas e grandes, sem permitir que a página pública role por trás do diálogo.

## Requisitos e critérios de aceite
- **AC-001:** enquanto os detalhes do monitor estiverem abertos, a rolagem do documento fica bloqueada e é restaurada ao fechar o diálogo.
- **AC-002:** o diálogo cabe na altura visível da janela em viewports móveis e desktop; conteúdo longo rola dentro do diálogo sem cortar opções ou ações.
- **AC-003:** o aluno escolhe primeiro o plano mensal ou anual. Só então aparecem as formas válidas de pagamento; só após escolher uma forma aparece a ação de compra.
- **AC-004:** fechar e iniciar checkout mantêm os comportamentos existentes e o intervalo e método selecionados são enviados sem alteração das regras comerciais.

## Limites
Esta alteração cobre o modal de detalhes e compra do monitor na rota pública `/p/[teacherSlug]`. Não altera preços, contratos de API, autenticação ou o fluxo de turmas patrocinadas.
