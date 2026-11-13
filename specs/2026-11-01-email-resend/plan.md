# Plano de execução proposto

1. Resolver achados de QA do onboarding: recuperação de conta criada sem vínculo e vínculo de conta existente. Validar em banco isolado antes de conectar envio.
2. Definir modelo de outbox transacional e estado de entrega, retenção segura do token e migração. Separar filas Redis e credenciais de teste/produção.
3. Implementar adaptador Resend e worker com idempotência persistente, retentativas e telemetria. Criar endpoint de webhook Resend com corpo bruto e assinatura validada.
4. Integrar transições de pagamento Asaas à criação atômica de intenções de envio; definir deduplicação por lote, vaga, período e tipo de transição. Usar eventos de domínio já correlacionados, não o recebimento bruto do webhook.
5. Criar templates e reenvio seguro de convites; diferenciar conta existente e nova e mostrar status operacional para suporte.
6. QA independente: pagamentos anuais e mensais, Pix e cartão, 1, 10 e N alunos; falha isolada em um envio sem impedir os demais e recuperação das intenções pendentes; eventos duplicados e fora de ordem; falha e timeout Resend; retorno após 24 h; token expirado, utilizado ou reemitido; conta existente; assinatura inválida; bounce; isolamento de ambientes. Validar Asaas e Resend em Sandbox e banco isolado antes de produção.

## Pacotes para delegação

- P1 onboarding e recuperação de conta (AC-009, AC-012), backend de convite e testes específicos.
- P2 outbox e provedor Resend (AC-001 a AC-006), infraestrutura de e-mail, migração e testes próprios; depende do contrato de retenção de token.
- P3 eventos de pagamento e notificações (AC-007 a AC-011), processamento de pagamentos e templates; depende de P1 e P2, sem escrita simultânea nos mesmos arquivos.
- P4 QA independente para cada pacote: plano de testes, revisão, testes de integração isolados e validação dos critérios.

Nenhuma migration, deploy, envio real ou mudança de configuração externa está incluída nesta etapa de planejamento.
