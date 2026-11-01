# Tasks — forma de pagamento no checkout do aluno

## Pacote 1 — contrato de pagamento no backend

- **Critérios:** AC-003, AC-004, AC-005.
- **Responsável:** implementador backend.
- **Arquivos:** `backend/src/modules/payments/application/commands/create-checkout.use-case.ts`, `backend/src/modules/payments/http/payments.controller.ts`; provider/event repository somente se necessário conforme o plano.
- **Dependências:** contrato definido nesta spec.
- **Limites:** manter fallback de split da plataforma, preço, annual interval e idempotência; sem migration.
- **Verificações:** revisão estática; QA cobre os quatro payloads e confirmação mensal PIX.

## Pacote 2 — escolha de forma na vitrine

- **Critérios:** AC-001, AC-002, AC-005.
- **Responsável:** implementador frontend.
- **Arquivo:** `frontend/src/app/(public-teacher)/p/[teacherSlug]/StorefrontClient.tsx`.
- **Dependências:** envia `billingType: PIX | CREDIT_CARD` aceito pelo Pacote 1.
- **Limites:** preservar mudanças locais existentes; manter Asaas hospedado, sem dados sensíveis no app.
- **Verificações:** revisão estática; QA cobre interação e payload.

## Pacote 3 — testes e revisão independente

- **Critérios:** AC-001–AC-005.
- **Responsável:** revisor/QA.
- **Arquivos:** criar novos testes unitários/integrados sem editar os arquivos de teste preexistentes e modificados pelo usuário.
- **Dependências:** Pacotes 1 e 2 concluídos.
- **Verificações:** executar testes focados e registrar resultados/lacunas.
