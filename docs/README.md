# Documentação técnica

Este diretório reúne a documentação funcional e técnica do MeuMonitorAI.

## Módulos principais

- [Pagamentos, assinaturas e acesso](./PAGAMENTOS-E-ASSINATURAS.md) — fonte técnica do fluxo Asaas, tabelas financeiras, webhooks, split, cancelamento, acesso canônico, cache Redis e ER do módulo.
- [Arquitetura](./ARCHITECTURE.md) — visão geral da arquitetura da aplicação.
- [Project](./Project.md) — contexto e organização do projeto.
- [PRD](./PRD.md) — requisitos de produto.

## Regra para manutenção

Ao alterar tabelas, endpoints, eventos de webhook, estados de assinatura ou regras de acesso, atualize primeiro o documento do módulo correspondente. Para qualquer mudança no fluxo Asaas, mantenha [PAGAMENTOS-E-ASSINATURAS.md](./PAGAMENTOS-E-ASSINATURAS.md) sincronizado com:

1. `backend/prisma/schema.prisma`;
2. os controllers, casos de uso e providers em `backend/src/modules/payments/`;
3. o contrato `GET /api/v1/student/access`;
4. os testes automatizados do backend e frontend.

O Asaas é a autoridade externa para o estado financeiro; `payment_*` é a representação financeira canônica local; Redis é somente cache do snapshot de acesso.
