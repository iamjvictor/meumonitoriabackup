# Validação

- AC-001 e AC-002: teste independente de filtros, linha única por e-mail, status e data passou.
- AC-003: teste de renovação anual, cotação e checkout passou; typecheck passou. Não houve teste de pagamento real.
- AC-004: cancelamento individual não implementado; assinatura compartilhada requer persistência, atualização de cobrança e reconciliação de webhooks. Pagamentos únicos devem manter acesso até vencer, conforme decisão do usuário.
- AC-005: UI usa estado de vínculo; envio de convite não identificado no fluxo atual.
- Suíte anterior da página continua com falhas de expectativas do fluxo em etapas; validação visual em navegador não realizada.
