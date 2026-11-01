# Plano de QA independente — turmas patrocinadas

Base: `docs/superpowers/specs/2026-11-01-sponsored-payment-method-selector-design.md` e critérios AC-001, AC-002, AC-004, AC-005.

| Cenário | AC | Verificação |
|---|---|---|
| 1 e 10 alunos × mensal/anual × Pix/cartão | AC-001/002/004 | Total cotado e cobrado; quantidade e valor unitário; billingType único; chargeType e ciclo; sem split. |
| URLs de retorno | AC-001/002 | As três URLs usam base pública informada e identificam status e lote. |
| Serialização Asaas | AC-001/002 | Payload de `billingTypes`, `chargeTypes`, `subscription`, `installment`, itens e callbacks usando cliente fake. |
| Repetição idempotente | AC-005 | Repetição de mesma chave+fingerprint retorna o checkout sem chamar provedor; método ou quantidade/email alterados conflitam. |
| Edição de lote pendente | AC-005 | O método original persiste e é aplicado na atualização, sem depender de rede ou banco. |

Execução estritamente unitária com repositórios, cliente Asaas e dados falsos. Nenhum acesso ao banco ou à rede externa.
