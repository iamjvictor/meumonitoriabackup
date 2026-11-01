# Tarefas — forma de pagamento nas turmas patrocinadas

- **T-001 / AC-001, AC-002, AC-004, AC-005, AC-006:** implementar contrato backend, checkout Asaas, persistência de `billingType`, idempotência e migração aditiva. Responsável: implementador backend. Dependência: desenho aprovado. Limite: não aplicar migração no Supabase remoto.
- **T-002 / AC-001–AC-006:** implementar menu expansível na página do professor, enviar seleção, manter método em edição/histórico e atualizar documentação. Responsável: implementador frontend. Dependência: T-001 concluída e revisada.
- **T-003 / AC-001–AC-006:** executar QA independente do fluxo mensal/anual Pix/cartão, edição de pendências e compatibilidade histórica; registrar validação. Responsável: revisor/QA.

## Contrato entre tarefas

`billingType` usa `PIX | CREDIT_CARD`. A API de criação exige esse campo. A listagem de lotes o retorna. A edição de lote pendente reutiliza o valor persistido e não permite trocar o método. O Asaas recebe exatamente um `billingTypes` por checkout patrocinado.
