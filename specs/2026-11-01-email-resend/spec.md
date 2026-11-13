# Resend e notificações de turmas patrocinadas — proposta

Status: proposta para revisão; nenhuma implementação ou envio realizado.

## Objetivo

Enviar convite individual de onboarding ao aluno após a confirmação de pagamento da vaga patrocinada e informar o professor sobre eventos relevantes da compra. Reutilizar o fluxo de convite existente e o processamento assíncrono dos webhooks Asaas.

## Spec 1 — serviço de e-mail

- AC-001: criar serviço de e-mail transacional com interface independente do provedor e adaptador Resend. Configurar API key, remetente verificado e ambiente por variáveis; nunca expor credenciais no frontend ou logs.
- AC-002: persistir uma intenção de envio por destinatário e finalidade em transação com a mudança de estado relevante, com identificador de negócio único. Worker envia em segundo plano, registra tentativas, ID Resend e falhas; indisponibilidade da Resend não reverte pagamento nem bloqueia webhook Asaas.
- AC-003: repetição de eventos e jobs não gera mensagens duplicadas. Usar chave idempotente própria e chave Resend com payload estável; a janela de idempotência do provedor é de 24 horas, portanto não substitui o controle persistente local. Tratar timeout inconclusivo explicitamente, sem garantir entrega única absoluta após a janela.
- AC-004: suportar reprocessamento controlado, limites e backoff; registrar aceito pelo provedor separadamente de entregue. Após falhas definitivas, manter estado visível para operação.
- AC-005: receber eventos de entrega Resend em endpoint próprio, verificar assinatura com corpo bruto e secret dedicado, deduplicar e refletir entregue, atraso, bounce e reclamação. Nunca registrar token de convite ou conteúdo sensível.
- AC-006: ambientes de teste e produção têm remetentes, credenciais, filas e destinos controlados; teste não envia a alunos reais. O domínio de envio deve estar verificado na Resend.

## Spec 2 — disparos por pagamento

Uma compra pode conter N alunos: por exemplo, um único pagamento por 10 vagas deve gerar 10 intenções de convite individuais. A ativação da compra deve registrar todas as intenções de forma durável; o processamento de cada envio é independente, e a falha de um destinatário não impede os demais. A quantidade e os destinatários devem vir das vagas efetivamente pagas no lote, não dos dados do webhook ou do navegador.

- AC-007: após transição efetiva para acesso pago, criar um envio individual por cada uma das N vagas elegíveis do lote e por período de compra; uma compra com 10 vagas gera 10 intenções distintas. O aluno recebe professor, monitor, período e link de convite seguro; os demais destinatários não são expostos. Não enviar na criação da cobrança nem por redirecionamento do navegador.
- AC-008: respeitar o comportamento atual: anual pode ativar no CHECKOUT_PAID; mensal aguarda PAYMENT_CONFIRMED ou PAYMENT_RECEIVED. Ambos os eventos de pagamento e suas repetições devem produzir somente uma intenção por vaga/período. Validar a correlação do lote e ambiente antes de enviar.
- AC-009: aluno com conta existente recebe orientação para entrar e vincular a vaga; aluno novo recebe convite para criar conta. O fluxo de conta existente e recuperação de criação parcial identificados pelo QA da funcionalidade de convite são dependências bloqueantes antes do disparo real.
- AC-010: professor recebe uma notificação por transição relevante e lote/cobrança: pagamento aprovado, recusa de captura, vencimento, cancelamento ou expiração do checkout, estorno e chargeback. Eventos que descrevem o mesmo estado não repetem a mensagem; mensagens identificam monitor, período, situação e próximo passo sem expor dados de cartão.
- AC-011: checkout pago pendente de confirmação financeira não é informado como falha. Eventos fora de ordem não regridem estado nem disparam mensagem contraditória. Estorno parcial deve ser apresentado como parcial, sem presumir revogação integral.
- AC-012: convite expirado ou já utilizado é tratado sem ativação indevida; reenvio autorizado gera novo token e invalida o anterior, com limitação de frequência e rastreio. Envio inicial preserva o mesmo token e conteúdo nas tentativas.

## Contratos e decisões a confirmar

Propostas: e-mails transacionais em português; professor recebe confirmação além dos problemas; cancelamento voluntário e expiração geram aviso distinto; aviso de vencimento é enviado uma vez por cobrança. Confirmação de identidade, política exata para estorno parcial, remetente e domínio devem ser definidos antes da implementação. A geração do token exige conciliar armazenamento apenas de hash com retries: usar payload criptografado temporário na outbox com retenção curta ou outro mecanismo seguro aprovado; jamais salvar token em texto puro.

## Fontes

- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://resend.com/changelog/managing-webhooks-via-api
- https://resend.com/docs/dashboard/webhooks/introduction
- https://docs.asaas.com/docs/webhook-para-cobrancas
- https://docs.asaas.com/docs/checkout-events
