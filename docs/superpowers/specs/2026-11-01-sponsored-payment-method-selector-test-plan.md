# Plano de testes — método de pagamento patrocinado

## Critérios cobertos

- **AC-001:** anual Pix ou cartão, ambos em checkout único `DETACHED`.
- **AC-002:** mensal Pix ou cartão, ambos em checkout `RECURRENT` mensal.
- **AC-003:** seleção obrigatória e limpa ao trocar o período.
- **AC-004:** método não altera preço e compras patrocinadas não usam split.
- **AC-005:** método persiste, aparece no resumo/histórico e é mantido ao editar lote pendente; idempotência separa métodos.
- **AC-006:** lotes anteriores sem método assumem cartão.

## Cenários

1. Anual + Pix → menu mostra Pix e cartão; checkout envia `billingType=PIX`, `DETACHED`, sem split.
2. Anual + cartão → checkout envia `billingType=CREDIT_CARD`, `DETACHED`, sem split.
3. Mensal + Pix → checkout envia `billingType=PIX`, `RECURRENT`, `cycle=MONTHLY`, sem split; informar que as cobranças Pix futuras precisam ser pagas manualmente.
4. Mensal + cartão → checkout envia `billingType=CREDIT_CARD`, `RECURRENT`, `cycle=MONTHLY`, sem split.
5. Nenhum método selecionado → revisão/checkout indisponíveis e mensagem acessível.
6. Alterar de mensal para anual ou vice-versa → limpa seleção anterior e exige uma nova escolha.
7. Alterar método com mesmo monitor/e-mails/período → gera nova identidade de idempotência/fingerprint.
8. Editar lote pendente → novo checkout mantém o método salvo no lote.
9. Lote antigo sem método → lista e edição exibem/utilizam `CREDIT_CARD`.
10. Os quatro casos de compra preservam o mesmo total e `splits: []`.

## Verificações

- Backend: `node --import tsx --test src/modules/payments/__tests__/create-sponsored-seat-batch.test.ts src/modules/payments/__tests__/asaas-provider.contract.test.ts src/modules/payments/__tests__/sponsored-seat.controller.test.ts src/modules/payments/__tests__/update-sponsored-seat-batch.test.ts`
- Frontend: `npx vitest run tests/unit/TeacherSponsoredClassesPage.test.tsx tests/unit/TeacherSponsoredSeatService.test.tsx`
- Tipos: `npm run typecheck` em `backend/` e `frontend/`.
- QA no browser: usar API/provider simulados ou Asaas Sandbox isolado; não criar cobrança em produção.
