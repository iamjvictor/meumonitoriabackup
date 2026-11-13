# QA: remover bloqueio de acesso vigente

- AC-1: quote mensal aceita email que já possui acesso patrocinado pago, lote pendente ou acesso legado.
- AC-2: criação de checkout mensal aceita os mesmos casos sem criar assentos duplicados dentro do lote.
- AC-3: plano anual mantém preço/cálculo e aceita email com acesso vigente.
- AC-4: emails duplicados dentro da mesma compra continuam rejeitados.
- AC-5: checkout aprovado prorroga/estende período sem conceder acesso duplicado ou encurtar acesso existente.

Testes de unidade/use case usam repositório falso e não acessam banco compartilhado. Integração do evento de pagamento é lacuna se banco isolado indisponível.
