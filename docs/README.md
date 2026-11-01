# Documentação técnica

Este diretório reúne a documentação funcional e técnica do MeuMonitorAI.

## Módulos principais

- [Fluxo de pagamentos Asaas](./asaas/README.md) — índice organizado para comportamento atual, variáveis e operação, evidências de validação, specs e planos históricos.
- [Pagamentos, assinaturas e acesso](./asaas/reference/PAGAMENTOS-E-ASSINATURAS.md) — referência técnica do fluxo, tabelas financeiras, webhooks, split, cancelamento, acesso canônico, cache Redis e ER do módulo.
- [Arquitetura](./ARCHITECTURE.md) — visão geral da arquitetura da aplicação.
- [Processamento de PDFs](./processamentopdf/README.md) — índice de Docling, OCR, bases de conhecimento, questões, testes e specs.
- [Project](./Project.md) — contexto e organização do projeto.
- [PRD](./PRD.md) — requisitos de produto.

## Regra para manutenção

Ao alterar tabelas, endpoints, eventos de webhook, estados de assinatura ou regras de acesso, atualize primeiro o documento do módulo correspondente. Para qualquer mudança no fluxo Asaas, mantenha [PAGAMENTOS-E-ASSINATURAS.md](./asaas/reference/PAGAMENTOS-E-ASSINATURAS.md) sincronizado com:

1. `backend/prisma/schema.prisma`;
2. os controllers, casos de uso e providers em `backend/src/modules/payments/`;
3. o contrato `GET /api/v1/student/access`;
4. os testes automatizados do backend e frontend.

O Asaas é a autoridade externa para o estado financeiro; `payment_*` é a representação financeira canônica local; Redis é somente cache do snapshot de acesso.
