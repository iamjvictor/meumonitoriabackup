# Checkout direto sem conta de recebimento elegível

## Objetivo

Permitir que o aluno conclua a compra de um monitor publicado mesmo quando a conta de recebimento do professor não estiver apta a receber split. Nessa situação, o professor não recebe repasse e a plataforma recebe o valor do checkout, sujeito às taxas do provedor.

## Abordagens

- **A — fallback explícito no pedido (escolhida):** remover o bloqueio antecipado e congelar `PLATFORM_FALLBACK`, sem carteira e com percentual do professor zero, quando a conta não estiver aprovada, não tiver carteira ou o percentual for zero. Preserva cobrança e webhook existentes.
- **B — remover somente o bloqueio:** deixar o checkout prosseguir e confiar na montagem atual de splits vazios. Isso deixa snapshots divergentes e pode registrar split elegível sem carteira ou com percentual zero.
- **C — criar fluxo de checkout alternativo:** duplicaria idempotência, cobrança e processamento de webhook sem necessidade.

## Requisitos e critérios de aceite

- **AC-001:** checkout mensal e anual de monitor publicado prossegue sem split quando a conta do professor estiver ausente, pendente/não aprovada, sem carteira ou com percentual zero.
- **AC-002:** quando elegível, split existente do professor permanece igual.
- **AC-003:** o pedido sem repasse registra `splitPolicy = NONE`, carteira nula e percentual do professor `0.0000`; o processamento financeiro não atribui valor esperado ao professor.
- **AC-004:** validações de aluno, monitor publicado, preço, idempotência e falhas do provedor permanecem aplicáveis.

## Limites

Sem mudanças no frontend, no contrato do Asaas, nas taxas do provedor, em compras patrocinadas ou na política de comissão de indicação. Nenhuma conta é criada ou alterada para o professor.

## Decisões de implementação

Elegibilidade exige simultaneamente estado aprovado (local ou geral), `walletId` presente e percentual do professor maior que zero. Sem todos os requisitos, criar intenção com fallback da plataforma e enviar `splits: []` ao provedor. Não alterar schema nem migrations.
