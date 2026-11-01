# Plano

Usar o preço anual já entregue pelo perfil público. Derivar a parcela de 12 vezes na interface, destacar a oferta nos cards e no modal e manter o preço à vista como total. Enviar os tipos `DETACHED` e `INSTALLMENT` no checkout Asaas, com limite de 12 parcelas; manter snapshots de valor e prazo de serviço existentes.

## Arquivos

- `frontend/src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx`
- Backend: `backend/src/modules/payments/domain/ports/payment-provider.port.ts`, `backend/src/modules/payments/infrastructure/providers/asaas/asaas-checkout.provider.ts`, `backend/src/modules/payments/application/commands/create-checkout.use-case.ts`, além dos snapshots e webhooks já existentes.

## Verificação

Inspecionar o contrato do payload, os snapshots de pedido e o webhook anual; testes automatizados não serão executados nesta alteração.
