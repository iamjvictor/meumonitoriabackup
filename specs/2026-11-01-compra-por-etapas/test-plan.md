# Plano de QA: listagem de turmas patrocinadas

Critérios para esta entrega:
- AC-TUR-001: ao abrir um monitor, filtro Todos/Mensal/Anual limita corretamente lotes e alunos.
- AC-TUR-002: contagem mostra alunos únicos por e-mail, inclusive quando a pessoa consta em lotes diferentes.
- AC-TUR-003: cada linha mostra e-mail, status derivado dos estados persistidos sem inferir cadastro só por existência de conta, e data de término do acesso quando disponível.
- AC-TUR-004: estado expirado é reconhecido por endsAt vencido mesmo se o status persistido ainda disser ACTIVE; não apresentar controles de cancelamento de lote como individuais.

Cenários: monitor com lotes mensais/anuais mistos; e-mail repetido entre lotes; vaga paga sem vínculo, ativa vinculada, pagamento pendente, e ativa com endsAt passado; ausência de endsAt. Executar teste de unidade da página e typecheck. Os cenários são avaliados contra dados mockados, sem gateway externo.
