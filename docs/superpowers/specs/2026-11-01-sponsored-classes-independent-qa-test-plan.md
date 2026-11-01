# Test plan — QA independente de turmas patrocinadas

## Escopo e segurança
Validar o fluxo de professor na tela com dados sintéticos e serviços mockados. Não usar sessão existente, API local conectada a produção, Supabase ou Asaas real; nenhum checkout será criado. Os testes de interface usam DOM simulado isolado e verificam o contrato enviado ao serviço e a URL de checkout retornada pelo mock.

## Critérios de aceite de referência
- **AC-001:** anual Pix cria checkout DETACHED; anual cartão permite à vista/até 12x, com billingType selecionado.
- **AC-002:** mensal Pix ou cartão gera recorrência mensal e método escolhido.
- **AC-003:** método é obrigatório e troca de período não reaproveita escolha incompatível.
- **AC-004:** cotação não depende do método, valores consistentes e sem split.
- **AC-005:** criação usa monitor, plano, e-mails e método selecionados; sucesso redireciona para checkout hospedado.
- **AC-006:** erros/validações ficam visíveis sem checkout indevido e permitem correção/retry.

## Cenários independentes
1. **Matriz dos quatro checkouts (AC-001/002/005):** anual/mensal × Pix/cartão; 1 e 10 e-mails distintos. Confirmar listagem e resumo, total e destino do redirect mockado, payload completo, método e quantidade.
2. **Cotação independente do método (AC-004):** para mesmo monitor/período/e-mails, comparar payloads de cotação em Pix e cartão e confirmar igualdade; total vem do serviço mockado.
3. **Validações de entrada (AC-003/006):** monitor/plano/método/alunos ausentes, e-mail inválido, duplicata e lista com 10 alunos; confirmar bloqueio da cotação/checkout inválido.
4. **Falhas e retry (AC-006):** falha de cotação e falha de checkout não redirecionam, exibem alerta associado à ação e preservam os dados editáveis; retry com resposta válida redireciona.
5. **Payload final (AC-001/002/004/005):** inspecionar fronteira do serviço HTTP/mock, inclusive billingType, período, beneficiaryEmails, expectedTotalAmountCents e URL; verificações do provedor para chargeTypes, máximo 12 parcelas, ciclo mensal e splits vazios podem ser feitas apenas por testes locais isolados existentes, sem chamar Asaas.

## Comandos previstos
- `cd frontend && npx vitest run tests/unit/TeacherSponsoredClassesPage.test.tsx`
- Arquivo QA independente criado para a matriz extensa, executado por Vitest.
- Opcional: `cd backend && node --import tsx --test src/modules/payments/__tests__/create-sponsored-seat-batch.test.ts src/modules/payments/__tests__/asaas-provider.contract.test.ts`

## Limitações
DOM/Vitest não substitui navegador real autenticado. Playwright não será apontado ao backend local porque seu ambiente possui credenciais de produção. Contrato Asaas real e webhooks não serão exercitados; evidência fica limitada a mocks e unit tests com provider fake.
