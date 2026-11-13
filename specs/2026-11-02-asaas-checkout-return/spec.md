# Retorno do checkout Asaas

## Objetivo
Levar o aluno de volta à área autenticada após retornar do checkout, sem apresentar o redirecionamento do provedor como confirmação financeira definitiva.

## Critérios de aceite
- **AC-001:** retorno com `status=success` exibe confirmação recebida e encaminha para `/areadoaluno`.
- **AC-002:** acesso à área do aluno também fica disponível por ação imediata.
- **AC-003:** retorno cancelado/expirado informa o resultado e não redireciona automaticamente.
- **AC-004:** a mensagem deixa claro que o acesso depende da confirmação financeira enviada pelo Asaas.
