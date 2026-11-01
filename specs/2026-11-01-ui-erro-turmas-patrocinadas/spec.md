# Erros na tela de turmas patrocinadas

## Objetivo

Dar um estado de erro claro e acionável quando a tela não consegue carregar monitores e/ou histórico de vagas, sem repetir mensagens técnicas.

## Direção visual e conteúdo

- **Tese visual:** área de trabalho calma, com um único aviso em tom de erro, alinhado ao cabeçalho e sem banners duplicados.
- **Conteúdo:** manter cabeçalho e formulário; o aviso explica qual dado falhou e oferece nova tentativa; falha somente no histórico preserva o fluxo de compra.
- **Interação:** recarga manual reutiliza o botão “Atualizar”; o aviso apresenta ação de retry com estado de carregamento e anúncio acessível.

## Abordagens consideradas

- Um alerta global para qualquer erro: simples, mas esconde qual parte falhou.
- Alertas separados sem deduplicação: preserva contexto, mas duplica a falha quando ambos endpoints caem (situação da captura).
- Mensagens por seção e alerta único quando ambas falham: recomendada; mantém contexto em falhas parciais e evita mensagens concorrentes.

## Limites

- Não ocultar falhas de carregamento nem fingir que histórico está vazio.
- Não bloquear novas compras se somente o histórico de vagas estiver indisponível e os monitores tiverem carregado.
- Mensagens 5xx não exibem texto interno do servidor; erros de validação continuam específicos.

## Critérios de aceite

- **AC-001:** Falha simultânea no carregamento de monitores e histórico gera um único aviso amigável com retry.
- **AC-002:** Falha apenas no histórico mantém a compra disponível e identifica o histórico como indisponível.
- **AC-003:** Falhas internas do servidor não mostram “Erro interno do servidor” nem expõem mensagem técnica.
