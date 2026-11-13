# Plano independente de QA — Resend e convites

Pré-condição: usar mocks para Resend e Asaas em testes unitários; integração somente com banco isolado e credenciais Sandbox. Nunca enviar para alunos reais. Não executar migration no banco compartilhado.

| ID | AC | Cenário | Nível | Resultado esperado |
|---|---|---|---|---|
| QA-001 | AC-001, AC-006 | Serviço inicia sem chave/remetente em ambiente que habilita e-mail | Unit/config | Falha fechada, mensagem de configuração sem vazar segredo; frontend não contém credencial. |
| QA-002 | AC-002, AC-007 | Lote pago com 1 aluno | Integração isolada | Uma outbox vinculada à vaga/período; corpo contém destinatário, professor, monitor, período e convite correto. |
| QA-003 | AC-002, AC-007 | Lote pago com 10 alunos e N alunos | Integração isolada | Exatamente N intenções, destinatários isolados entre mensagens; um envio falho não interrompe os demais. |
| QA-004 | AC-002, AC-008 | CHECKOUT_CREATED e retorno de sucesso sem confirmação | Unit/integration | Nenhum convite ao aluno; não comunicar aprovação ao professor. |
| QA-005 | AC-007, AC-008 | Anual: CHECKOUT_PAID; mensal: PAYMENT_CONFIRMED e PAYMENT_RECEIVED | Integração isolada | Convites criados na transição definida por AC; mensal aguarda confirmação financeira. |
| QA-006 | AC-003, AC-008, AC-010 | Mesmo evento/job repetido, incluindo PAYMENT_CONFIRMED + PAYMENT_RECEIVED | Unit/integration | Unicidade persistente impede convites/status duplicados; professor recebe uma mensagem por transição. |
| QA-007 | AC-003, AC-004 | Resend timeout, 429, 5xx, erro definitivo e resposta aceita | Unit | Backoff/retry; estado aceito difere de entregue; recuperação sem duplicar; falha de e-mail não falha o webhook/pagamento. |
| QA-008 | AC-003 | Retry com payload idêntico dentro de 24 h e nova tentativa depois de 24 h | Unit | Idempotência local permanece; payload/token não é regenerado silenciosamente nem convite duplicado. |
| QA-009 | AC-005 | Webhook Resend válido, assinatura inválida, timestamp fora da tolerância, replay/duplicata | Unit/API | Só assinatura válida altera estado; idempotência por evento; corpo bruto usado na verificação. |
| QA-010 | AC-005 | Eventos delivered, delayed, bounced, complained e fora de ordem | Unit/integration | Estado refletido corretamente e monotônico conforme política, sem sobrescrever bounce com estado anterior. |
| QA-011 | AC-009 | E-mail sem conta, conta existente com vaga ainda não reclamada, conta criada mas vínculo falhou | Integração isolada | Aluno novo consegue definir senha e reclamar vaga; existente tem caminho autenticado para vincular; retry recupera criação parcial. |
| QA-012 | AC-012 | Token expirado, usado, reemitido; abuso de endpoint de reenvio | API/unit | Sem ativação indevida; token antigo invalida; limite aplicado; token não aparece em logs/URL de request ao servidor. |
| QA-013 | AC-010, AC-011 | Eventos do professor: aprovado, captura recusada, vencido, cancelado, expirado, estorno total/parcial, chargeback | Unit/integration | Texto e próximo passo corretos; sem detalhes de cartão; eventos repetidos/fora de ordem não geram mensagens contraditórias. |
| QA-014 | AC-006 | Chaves, Redis e remetentes distintos entre sandbox e produção | Config/integration | Ambiente Sandbox nunca dispara e-mail de produção; filas isoladas e origem/destino verificáveis. |

## Revisão de implementação

Inspecionar atomicidade de outbox com mudança de pagamento, constraint única de negócio, comportamento em concorrência, tratamento de timeout ambíguo, logs/PII, criptografia e retenção do token, autorização e rate limit do reenvio, validação de assinatura Resend sobre bytes crus, estados idempotentes, conteúdo/template e acessibilidade do caminho de cadastro.

## Evidência e limitações

Registrar por QA ID comando, resultado e fixture/ambiente. Testes que dependam de painel ou credenciais externas ficam como pendência manual até haver sandbox dedicado. Evidenciar contagem de envios (1, 10, N), nenhuma chamada externa real nos testes automatizados e nenhuma migration em banco compartilhado.
